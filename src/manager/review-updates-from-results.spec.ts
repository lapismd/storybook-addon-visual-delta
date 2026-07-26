import { describe, expect, it } from "vitest";
import {
  isMissingBaselineFailure,
  reviewableStoryIdsFromLastRun,
  reviewUpdatesFromRunResults,
  type VisualRunResultItem,
} from "./run-visual.js";

describe("reviewUpdatesFromRunResults", () => {
  it("maps passed → ready and failed → failed", () => {
    const results: VisualRunResultItem[] = [
      { storyId: "a--one", status: "passed", title: "a--one" },
      { storyId: "a--two", status: "failed", title: "a--two" },
    ];
    expect(reviewUpdatesFromRunResults(results)).toEqual([
      { storyId: "a--one", status: "ready" },
      { storyId: "a--two", status: "failed" },
    ]);
  });

  it("does not tag failed when the baseline PNG is missing", () => {
    const results: VisualRunResultItem[] = [
      {
        storyId: "a--missing",
        status: "failed",
        title: "a--missing",
        missingBaseline: true,
        error: "No baseline screenshot",
      },
      {
        storyId: "a--diff",
        status: "failed",
        title: "a--diff",
        error: "Screenshot comparison failed",
      },
      {
        storyId: "a--ok",
        status: "passed",
        title: "a--ok",
      },
    ];
    expect(reviewUpdatesFromRunResults(results)).toEqual([
      { storyId: "a--diff", status: "failed" },
      { storyId: "a--ok", status: "ready" },
    ]);
  });

  it("detects Playwright missing-snapshot error text", () => {
    expect(
      isMissingBaselineFailure({
        storyId: "x--y",
        status: "failed",
        title: "x--y",
        error:
          "Error: A snapshot doesn't exist at /tmp/foo.png, writing actual.",
      }),
    ).toBe(true);
  });
});

describe("reviewableStoryIdsFromLastRun", () => {
  it("deduplicates completed results and excludes missing baselines", () => {
    expect(
      reviewableStoryIdsFromLastRun({
        finishedAt: 1,
        summary: { total: 4, passed: 2, failed: 2, skipped: 0 },
        results: [
          { storyId: "a", title: "A", status: "passed" },
          { storyId: "a", title: "A mode", status: "passed" },
          {
            storyId: "b",
            title: "B",
            status: "failed",
            missingBaseline: true,
          },
          { storyId: "c", title: "C", status: "failed" },
        ],
      }),
    ).toEqual(["a", "c"]);
  });
});
