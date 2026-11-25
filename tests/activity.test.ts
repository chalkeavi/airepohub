import { describe, expect, it } from "vitest";
import { activityStatus } from "@/lib/activity";

const now = new Date("2026-11-24T00:00:00Z");

describe("activityStatus", () => {
  it.each([
    ["2026-11-01T00:00:00Z", false, "active"],
    ["2026-07-21T00:00:00Z", false, "slowing"],
    ["2025-06-01T00:00:00Z", false, "inactive"],
    ["2026-11-23T00:00:00Z", true, "archived"],
  ] as const)("%s archived=%s → %s", (pushed, archived, expected) => {
    expect(activityStatus(pushed, archived, now)).toBe(expected);
  });

  it("treats unknown push date as inactive", () => {
    expect(activityStatus(null, false, now)).toBe("inactive");
  });
});
