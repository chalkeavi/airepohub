import { describe, expect, it } from "vitest";
import {
  getBeginnerFriendly,
  getPrerenderSlugs,
  getPublishedCount,
  getRepositoriesByCategory,
  getSearchSuggestions,
  getLeaderboards,
  getRelatedRepositories,
  getRepositoryBySlug,
  getRepositoryContent,
  searchRepositories,
} from "@/lib/data";
import { sampleRepositories } from "@/lib/data/sample/repositories";

describe("data layer (sample backend)", () => {
  it("never returns unpublished repositories", async () => {
    const original = sampleRepositories[0].status;
    sampleRepositories[0].status = "draft";
    try {
      expect(await getRepositoryBySlug(sampleRepositories[0].slug)).toBeNull();
      const { results } = await searchRepositories({ q: sampleRepositories[0].name });
      expect(results.map((r) => r.slug)).not.toContain(sampleRepositories[0].slug);
    } finally {
      sampleRepositories[0].status = original;
    }
  });

  it("has unique slugs and GitHub ids", () => {
    expect(new Set(sampleRepositories.map((r) => r.slug)).size).toBe(sampleRepositories.length);
    expect(new Set(sampleRepositories.map((r) => r.githubId)).size).toBe(sampleRepositories.length);
  });

  it("returns an all-time top 10 and empty weekly/monthly boards without fabricated growth", async () => {
    const boards = await getLeaderboards();
    const allTime = boards.find((b) => b.period === "all_time")!;
    expect(allTime.entries).toHaveLength(10);
    expect(allTime.entries.every((e) => e.starGrowth === null && e.movement === null)).toBe(true);
    for (const p of ["weekly", "monthly"] as const) {
      const b = boards.find((x) => x.period === p)!;
      expect(b.entries).toHaveLength(0);
      expect(b.emptyReason).toBeTruthy();
    }
  });

  it("filters category leaderboards", async () => {
    const boards = await getLeaderboards("coding-assistants");
    const allTime = boards.find((b) => b.period === "all_time")!;
    expect(allTime.entries.length).toBeGreaterThan(0);
    expect(allTime.entries.every((e) => e.repository.categorySlugs.includes("coding-assistants"))).toBe(true);
  });

  it("serves OpenSEO content with a source-backed install guide", async () => {
    const content = await getRepositoryContent("openseo");
    expect(content?.install.verification).toBe("official_docs");
    expect(content?.install.sourceUrl).toMatch(/^https:\/\/github\.com\/vikasswebdev\/OpenSEO\//);
    const commands = content!.install.guides.flatMap((g) => g.steps.map((s) => s.code ?? "")).join("\n");
    expect(commands).not.toContain("pip install openseo"); // not on PyPI (decision #7)
  });

  it("search matches names first and supports filters", async () => {
    const { results } = await searchRepositories({ q: "ollama" });
    expect(results[0].slug).toBe("ollama");
    const py = await searchRepositories({ language: "Python" });
    expect(py.results.every((r) => r.primaryLanguage === "Python")).toBe(true);
    expect((await searchRepositories({ q: "zzzz-no-match" })).total).toBe(0);
  });

  it("related repositories exclude the repo itself", async () => {
    const related = await getRelatedRepositories("ollama");
    expect(related.length).toBeGreaterThan(0);
    expect(related.map((r) => r.slug)).not.toContain("ollama");
  });

  it("beginner list only has beginner difficulty", async () => {
    expect((await getBeginnerFriendly()).every((r) => r.difficulty === "beginner")).toBe(true);
  });

  it("counts published repos and pages categories by stars", async () => {
    expect(await getPublishedCount()).toBe(sampleRepositories.filter((r) => r.status === "published").length);
    const { total, repositories } = await getRepositoriesByCategory("coding-assistants", 2);
    expect(repositories).toHaveLength(2);
    expect(total).toBeGreaterThanOrEqual(2);
    expect(repositories[0].stars).toBeGreaterThanOrEqual(repositories[1].stars);
  });

  it("prerenders only the most-starred pages and limits suggestions", async () => {
    const slugs = await getPrerenderSlugs(3);
    expect(slugs).toHaveLength(3);
    expect(await getSearchSuggestions(5)).toHaveLength(5);
  });
});
