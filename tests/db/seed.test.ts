import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Applies every migration plus supabase/seed.sql (twice, to prove it is idempotent),
// then reads as the anonymous role the website uses.

let db: PGlite;
const root = process.cwd();

beforeAll(async () => {
  db = new PGlite({ extensions: { citext, pgcrypto } });
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
    create role anon;
    create role authenticated;
  `);
  const dir = join(root, "supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  const seed = readFileSync(join(root, "supabase/seed.sql"), "utf8");
  await db.exec(seed);
  await db.exec(seed);
  await db.exec(`
    grant usage on schema public, auth to anon;
    grant select on all tables in schema public to anon;
    set role anon;
  `);
});

afterAll(async () => {
  await db?.close();
});

const count = async (sql: string) => Number((await db.query<{ n: number }>(sql)).rows[0].n);

describe("seed", () => {
  it("loads categories and published repositories once", async () => {
    expect(await count("select count(*)::int n from categories")).toBe(10);
    expect(await count("select count(*)::int n from repositories")).toBe(24);
    expect(await count("select count(*)::int n from repository_stats")).toBe(24);
  });

  it("stores OpenSEO's product page without the unpublished pip command", async () => {
    const { rows } = await db.query<{ instructions: unknown; label: string }>(
      "select g.instructions, g.label from installation_guides g join repositories r on r.id = g.repository_id where r.slug = 'openseo' order by sort_order",
    );
    expect(rows.map((r) => r.label)).toEqual(["macOS", "Linux", "Windows"]);
    expect(JSON.stringify(rows)).not.toContain("pip install openseo");
    expect(await count("select count(*)::int n from tutorials")).toBe(1);
    expect(await count("select count(*)::int n from repository_content where array_length(best_for, 1) > 0")).toBe(1);
  });

  it("stores one global all-time ranking with no invented growth", async () => {
    expect(await count("select count(*)::int n from ranking_snapshots where category_id is null")).toBe(24);
    expect(await count("select count(*)::int n from ranking_snapshots where star_growth is not null or previous_rank is not null")).toBe(0);
    expect(await count("select count(*)::int n from ranking_snapshots where period <> 'all_time'")).toBe(0);
  });

  it("full-text search finds repos by topic words", async () => {
    const n = await count(
      "select count(*)::int n from repositories where search_vector @@ websearch_to_tsquery('english', 'seo audit')",
    );
    expect(n).toBeGreaterThan(0);
  });
});
