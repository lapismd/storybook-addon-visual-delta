import { describe, expect, it } from "vitest";
import {
  acceptableStoryIdsFromLastRun,
  isMissingBaselineFailure,
  rejectableStoryIdsFromLastRun,
  reviewableStoryIdsFromLastRun,
  reviewUpdatesFromRunResults,
  type VisualRunResultItem,
} from "./run-visual.js";

describe("reviewUpdatesFromRunResults", () => {
  it("maps completed comparisons to ready or failed review states", () => {
    const results: VisualRunResultItem[] = [
      { storyId: "a--one", status: "passed", title: "a--one" },
      {
        storyId: "a--two",
        status: "failed",
        title: "a--two",
        outcome: "mismatch",
      },
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
        outcome: "mismatch",
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

  it("does not change review tags for infrastructure errors", () => {
    expect(
      reviewUpdatesFromRunResults([
        {
          storyId: "a--crashed",
          status: "failed",
          title: "a--crashed",
          error: "Browser crashed during capture",
        },
      ]),
    ).toEqual([]);
  });

  it("does not demote approved stories to ready when they still pass", () => {
    const results: VisualRunResultItem[] = [
      { storyId: "a--approved", status: "passed", title: "a--approved" },
      { storyId: "a--pending", status: "passed", title: "a--pending" },
      {
        storyId: "a--approved-diff",
        status: "failed",
        title: "a--approved-diff",
        outcome: "mismatch",
      },
    ];
    const current = new Map([
      ["a--approved", "approved" as const],
      ["a--pending", "pending" as const],
      ["a--approved-diff", "approved" as const],
    ]);
    expect(
      reviewUpdatesFromRunResults(results, {
        currentReviewStatus: (id) => current.get(id),
      }),
    ).toEqual([
      { storyId: "a--pending", status: "ready" },
      { storyId: "a--approved-diff", status: "failed" },
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

const lastRunFixture = {
  finishedAt: 1,
  summary: { total: 4, passed: 2, failed: 2, skipped: 0 },
  results: [
    { storyId: "a", title: "A", status: "passed" as const },
    { storyId: "a", title: "A mode", status: "passed" as const },
    {
      storyId: "b",
      title: "B",
      status: "failed" as const,
      missingBaseline: true,
    },
    {
      storyId: "c",
      title: "C",
      status: "failed" as const,
      outcome: "mismatch" as const,
    },
    {
      storyId: "d",
      title: "D",
      status: "failed" as const,
      error: "Browser crashed",
    },
    {
      storyId: "e",
      title: "E",
      status: "passed" as const,
      outcome: "changed-within-tolerance" as const,
    },
  ],
};

describe("acceptableStoryIdsFromLastRun", () => {
  it("includes only passes and within-tolerance, deduped", () => {
    expect(acceptableStoryIdsFromLastRun(lastRunFixture)).toEqual(["a", "e"]);
  });
});

describe("rejectableStoryIdsFromLastRun", () => {
  it("includes only mismatches", () => {
    expect(rejectableStoryIdsFromLastRun(lastRunFixture)).toEqual(["c"]);
  });
});

describe("reviewableStoryIdsFromLastRun", () => {
  it("unions acceptables and rejectables, excluding missing and crashes", () => {
    expect(reviewableStoryIdsFromLastRun(lastRunFixture)).toEqual([
      "a",
      "e",
      "c",
    ]);
  });
});
