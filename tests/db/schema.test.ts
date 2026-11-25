import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Loads every migration into PGlite (Postgres in WASM) with a minimal Supabase `auth` stub,
// then checks constraints, full-text search and anonymous RLS. Real Supabase tests: Milestone 2.

const dir = join(process.cwd(), "supabase/migrations");
let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { citext, pgcrypto } });
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
  `);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  await db.exec(`
    insert into repositories (github_id, owner, name, full_name, slug, github_url, summary, status, published_at)
    values (1, 'a', 'OpenSEO', 'a/OpenSEO', 'openseo', 'https://github.com/a/OpenSEO', 'SEO audit CLI', 'published', now()),
           (2, 'b', 'Secret', 'b/Secret', 'secret', 'https://github.com/b/Secret', 'unreleased tool', 'draft', null);
    insert into content_drafts (repository_id, content_type, generated_content, model_used)
      select id, 'summary', '{}', 'test-model' from repositories;
    create role anon;
    grant usage on schema public, auth to anon;
    grant select on all tables in schema public to anon;
  `);
});

afterAll(async () => {
  await db?.close();
});

describe("database schema", () => {
  it("finds published repos via full-text search", async () => {
    const r = await db.query<{ slug: string }>(
      `select slug from repositories where search_vector @@ websearch_to_tsquery('english', 'seo audit')`,
    );
    expect(r.rows.map((x) => x.slug)).toEqual(["openseo"]);
  });

  it("dedupes by GitHub id and case-insensitive full name", async () => {
    await expect(
      db.exec(`insert into repositories (github_id, owner, name, full_name, slug, github_url) values (1, 'x', 'x', 'x/x', 'x', 'u1')`),
    ).rejects.toThrow(/github_id/);
    await expect(
      db.exec(`insert into repositories (github_id, owner, name, full_name, slug, github_url) values (9, 'A', 'OPENSEO', 'A/OPENSEO', 'y', 'u2')`),
    ).rejects.toThrow(/full_name/);
  });

  it("requires a publish date for published rows", async () => {
    await expect(db.exec(`update repositories set status = 'published' where slug = 'secret'`)).rejects.toThrow(
      /published_has_date/,
    );
  });

  it("keeps one stats snapshot per repo per day", async () => {
    await db.exec(`insert into repository_stats (repository_id, stars, forks, open_issues) select id, 1, 1, 1 from repositories where slug = 'openseo'`);
    await expect(
      db.exec(`insert into repository_stats (repository_id, stars, forks, open_issues) select id, 2, 1, 1 from repositories where slug = 'openseo'`),
    ).rejects.toThrow(/duplicate key/);
  });

  describe("RLS as anonymous visitor", () => {
    beforeAll(async () => {
      await db.exec(`set role anon`);
    });
    afterAll(async () => {
      await db.exec(`reset role`);
    });

    it("sees only published repositories", async () => {
      const r = await db.query<{ slug: string }>(`select slug from repositories order by slug`);
      expect(r.rows.map((x) => x.slug)).toEqual(["openseo"]);
    });

    it("cannot read drafts, the discovery queue or audit logs", async () => {
      for (const table of ["content_drafts", "discovery_queue", "audit_logs", "automation_runs", "admin_users"]) {
        const r = await db.query<{ n: number }>(`select count(*)::int as n from ${table}`);
        expect(r.rows[0].n, table).toBe(0);
      }
    });
  });
});
