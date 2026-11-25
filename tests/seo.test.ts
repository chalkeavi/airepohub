import { describe, expect, it } from "vitest";
import { decideRoute, type RouteIndex } from "@/lib/route-index";
import { howToJsonLd, jsonLdString, repoDescription, repoTitle, softwareSourceCodeJsonLd, truncate } from "@/lib/seo";
import { openseoContent } from "@/lib/data/sample/content/openseo";
import { sampleRepositories } from "@/lib/data/sample/repositories";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

const openseo = sampleRepositories.find((r) => r.slug === "openseo")!;

describe("titles and descriptions", () => {
  it("keeps every repo title within 60 characters including the brand suffix, without mid-sentence cuts", () => {
    for (const r of sampleRepositories) {
      const t = repoTitle(r);
      expect(`${t} | AIRepoHub`.length).toBeLessThanOrEqual(60);
      expect(t).not.toMatch(/…$/);
      expect(t.startsWith(r.name)).toBe(true);
    }
  });
  it("uses an editor override when set", () => {
    expect(repoTitle(openseo, "Custom")).toBe("Custom");
  });
  it("keeps descriptions within 160 characters", () => {
    for (const r of sampleRepositories) expect(repoDescription(r, r.hasFullContent).length).toBeLessThanOrEqual(160);
  });
  it("truncates at a word boundary", () => {
    expect(truncate("one two three four", 12)).toBe("one two…");
  });
});

describe("structured data", () => {
  it("describes the repo with GitHub facts only", () => {
    const ld = softwareSourceCodeJsonLd(openseo, openseoContent);
    expect(ld["@type"]).toBe("SoftwareSourceCode");
    expect(ld.codeRepository).toBe(openseo.githubUrl);
    expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|ratingValue|downloadCount/);
  });
  it("adds HowTo only for verified guides", () => {
    expect(openseoContent.install.verification).not.toBe("verified");
    expect(howToJsonLd(openseo, openseoContent)).toBeNull();
    const verified = { ...openseoContent, install: { ...openseoContent.install, verification: "verified" as const } };
    expect(howToJsonLd(openseo, verified)?.["@type"]).toBe("HowTo");
  });
  it("escapes < so content cannot close the script tag", () => {
    expect(jsonLdString({ x: "</script><script>" })).not.toContain("</script>");
  });
});

describe("route decisions (proxy)", () => {
  const index: RouteIndex = {
    repos: new Set(["openseo", "ollama"]),
    categories: new Set(["local-llms"]),
    aliases: new Map([["open-seo", "openseo"], ["gone", "unpublished"]]),
  };
  it("passes known slugs and unrelated paths", () => {
    expect(decideRoute("/repo/openseo", index)).toEqual({ action: "next" });
    expect(decideRoute("/categories/local-llms", index)).toEqual({ action: "next" });
    expect(decideRoute("/about", index)).toEqual({ action: "next" });
  });
  it("301s aliases and wrong case to the canonical slug", () => {
    expect(decideRoute("/repo/open-seo", index)).toEqual({ action: "redirect", location: "/repo/openseo" });
    expect(decideRoute("/repo/OpenSEO", index)).toEqual({ action: "redirect", location: "/repo/openseo" });
    expect(decideRoute("/categories/Local-LLMs", index)).toEqual({ action: "redirect", location: "/categories/local-llms" });
  });
  it("returns not found for unknown slugs and aliases pointing at unpublished repos", () => {
    expect(decideRoute("/repo/nope", index)).toEqual({ action: "not_found" });
    expect(decideRoute("/repo/gone", index)).toEqual({ action: "not_found" });
    expect(decideRoute("/categories/nope", index)).toEqual({ action: "not_found" });
    expect(decideRoute("/repo/%E0%A4%A", index)).toEqual({ action: "not_found" });
  });
});

describe("sitemap and robots", () => {
  it("lists only published repos and the public pages", async () => {
    const original = sampleRepositories[0].status;
    sampleRepositories[0].status = "draft";
    try {
      const urls = (await sitemap()).map((e) => e.url);
      expect(urls).not.toContain(expect.stringContaining(`/repo/${sampleRepositories[0].slug}`));
      expect(urls.filter((u) => u.includes("/repo/")).length).toBe(sampleRepositories.length - 1);
      expect(urls.some((u) => u.includes("/search"))).toBe(false);
    } finally {
      sampleRepositories[0].status = original;
    }
  });
  it("blocks search and admin and links the sitemap", () => {
    const r = robots();
    expect(JSON.stringify(r.rules)).toContain("/search");
    expect(JSON.stringify(r.rules)).toContain("/admin");
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
