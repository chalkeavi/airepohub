import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Regression: @opennextjs/aws does `import cookieParser from "cookie"` and calls cookieParser.parse().
// With cookie@1.x (an __esModule build with no default export) the bundled default is undefined, so
// every request with a Cookie header crashed the Worker (Cloudflare error 1101). pnpm-workspace.yaml
// pins OpenNext's cookie to 0.7.x; this fails if that pin is lost.
describe("OpenNext cookie parser", () => {
  it("resolves a cookie module whose default import has parse()", () => {
    // pnpm places @opennextjs/aws next to @opennextjs/cloudflare (it isn't a direct dependency).
    const cloudflareDir = realpathSync(join(process.cwd(), "node_modules/@opennextjs/cloudflare"));
    const fromAws = createRequire(realpathSync(join(cloudflareDir, "../aws/package.json")));
    const mod = fromAws("cookie") as { __esModule?: boolean; default?: unknown; parse?: unknown };
    // esbuild's interop: default = module.exports unless the module sets __esModule.
    const defaultImport = (mod.__esModule ? mod.default : mod) as { parse?: (s: string) => Record<string, string> } | undefined;
    expect(typeof defaultImport?.parse).toBe("function");
    expect(defaultImport!.parse!("__cf_bm=abc; theme=dark")).toEqual({ __cf_bm: "abc", theme: "dark" });
  });
});
