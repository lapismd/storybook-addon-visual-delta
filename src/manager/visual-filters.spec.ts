import { describe, expect, it } from "vitest";
import {
  buildVisualFilterOptionCounts,
  buildVisualEnvironmentFilterGroups,
  buildVisualStoryFilterFacts,
  countStoriesMatchingFilters,
  filterSelectionState,
  invertFilterPolarity,
  parseVisualFilterIds,
  serializeVisualFilterIds,
  setFilterExclude,
  setFilterInclude,
  toggleFilterCheckbox,
  visualStoryMatchesFilters,
} from "./visual-filters.js";

const stories = [
  { id: "ready-mismatch", tags: ["visual-ready"] },
  { id: "approved-pass", tags: ["visual-approved"] },
  { id: "skipped-missing", tags: ["skip-visual"] },
  { id: "unreviewed-new", tags: [] },
];
const coverage = [
  {
    storyId: "ready-mismatch",
    baseline: "present" as const,
    browserCoverage: [
      { browser: "chromium" as const, baseline: "present" as const },
      { browser: "firefox" as const, baseline: "missing" as const },
    ],
  },
  {
    storyId: "approved-pass",
    baseline: "present" as const,
    browserCoverage: [
      { browser: "chromium" as const, baseline: "present" as const },
      { browser: "firefox" as const, baseline: "present" as const },
    ],
  },
  {
    storyId: "skipped-missing",
    baseline: "missing" as const,
    browserCoverage: [
      { browser: "chromium" as const, baseline: "missing" as const },
      { browser: "firefox" as const, baseline: "missing" as const },
    ],
  },
  {
    storyId: "unreviewed-new",
    baseline: "missing" as const,
    browserCoverage: [
      { browser: "chromium" as const, baseline: "unresolved" as const },
      { browser: "firefox" as const, baseline: "missing" as const },
    ],
  },
];
const requiredBrowsers = ["chromium", "firefox"] as const;
const results = [
  {
    storyId: "ready-mismatch",
    title: "Ready mismatch",
    status: "failed" as const,
    outcome: "mismatch" as const,
  },
  {
    storyId: "approved-pass",
    title: "Approved pass",
    status: "passed" as const,
  },
];

function matchingIds(
  facts: ReturnType<typeof buildVisualStoryFilterFacts>,
  ids: string[],
  hasCompletedRun = true,
) {
  return [...facts.values()]
    .filter((fact) =>
      visualStoryMatchesFilters(fact, ids, hasCompletedRun),
    )
    .map((fact) => fact.storyId);
}

describe("visual filters", () => {
  const facts = buildVisualStoryFilterFacts(
    stories,
    coverage,
    results,
    true,
    requiredBrowsers,
  );

  it("uses OR within a group and AND across groups", () => {
    expect(
      matchingIds(facts, [
        "review.ready",
        "review.approved",
        "coverage.present",
      ]),
    ).toEqual(["ready-mismatch", "approved-pass"]);
    expect(matchingIds(facts, ["review.ready", "result.passed"])).toEqual([]);
  });

  it("excludes with ! tokens and ANDs excludes within a group", () => {
    expect(matchingIds(facts, ["!review.approved"])).toEqual([
      "ready-mismatch",
      "skipped-missing",
      "unreviewed-new",
    ]);
    expect(
      matchingIds(facts, ["coverage.present", "!result.passed"]),
    ).toEqual(["ready-mismatch"]);
    expect(
      matchingIds(facts, ["!review.ready", "!review.approved"]),
    ).toEqual(["skipped-missing", "unreviewed-new"]);
  });

  it("treats inclusion as skipped-only (exclude hides skipped)", () => {
    expect(matchingIds(facts, ["inclusion.skipped"])).toEqual([
      "skipped-missing",
    ]);
    expect(matchingIds(facts, ["!inclusion.skipped"])).toEqual([
      "ready-mismatch",
      "approved-pass",
      "unreviewed-new",
    ]);
    expect(parseVisualFilterIds("inclusion.included")).toEqual([]);
  });

  it("provides attention, review-queue, and coverage-gap quick views", () => {
    expect(matchingIds(facts, ["quick.needs-attention"])).toEqual([
      "ready-mismatch",
      "unreviewed-new",
    ]);
    expect(matchingIds(facts, ["quick.review-queue"])).toEqual([
      "ready-mismatch",
    ]);
    expect(matchingIds(facts, ["quick.coverage-gaps"])).toEqual([
      "unreviewed-new",
    ]);
    expect(matchingIds(facts, ["quick.browser-coverage-gaps"])).toEqual([
      "ready-mismatch",
      "unreviewed-new",
    ]);
  });

  it("matches browser coverage and excludes present browser facets", () => {
    expect(matchingIds(facts, ["browser.firefox"])).toEqual([
      "approved-pass",
    ]);
    expect(matchingIds(facts, ["!browser.firefox"])).toEqual([
      "ready-mismatch",
      "skipped-missing",
      "unreviewed-new",
    ]);
  });

  it("ignores result facets until a completed run exists", () => {
    expect(
      [...facts.values()].every((fact) =>
        visualStoryMatchesFilters(fact, ["result.mismatch"], false),
      ),
    ).toBe(true);
    expect(
      [...facts.values()].every((fact) =>
        visualStoryMatchesFilters(fact, ["!result.passed"], false),
      ),
    ).toBe(true);
  });

  it("round-trips include and exclude URL tokens", () => {
    const parsed = parseVisualFilterIds(
      "review.ready,unknown,!result.passed,review.ready,!review.ready",
    );
    // Last polarity for review.ready wins (exclude).
    expect(parsed).toEqual(["!review.ready", "!result.passed"]);
    expect(serializeVisualFilterIds(parsed)).toBe(
      "!review.ready,!result.passed",
    );
    expect(parseVisualFilterIds("!quick.needs-attention")).toEqual([]);
    expect(
      parseVisualFilterIds(
        "os.linux,!browser.firefox,quick.browser-coverage-gaps,!quick.browser-coverage-gaps",
      ),
    ).toEqual(["!browser.firefox", "quick.browser-coverage-gaps"]);
  });

  it("toggles include/exclude polarity for facets", () => {
    expect(setFilterInclude([], "review.ready")).toEqual(["review.ready"]);
    expect(setFilterExclude(["review.ready"], "review.ready")).toEqual([
      "!review.ready",
    ]);
    expect(invertFilterPolarity(["review.ready"], "review.ready")).toEqual([
      "!review.ready",
    ]);
    expect(invertFilterPolarity(["!review.ready"], "review.ready")).toEqual([
      "review.ready",
    ]);
    expect(toggleFilterCheckbox(["!review.ready"], "review.ready")).toEqual(
      [],
    );
    expect(filterSelectionState(["!review.ready"], "review.ready")).toBe(
      "excluded",
    );
    expect(setFilterInclude(["quick.needs-attention"], "review.ready")).toEqual(
      ["review.ready"],
    );
  });

  it("counts option populations and matching totals", () => {
    const counts = buildVisualFilterOptionCounts(facts, true);
    expect(counts["review.ready"]).toBe(1);
    expect(counts["coverage.present"]).toBe(2);
    expect(counts["quick.needs-attention"]).toBe(2);
    expect(counts["result.passed"]).toBe(1);
    expect(counts["browser.firefox"]).toBe(1);
    expect(counts["quick.browser-coverage-gaps"]).toBe(2);
    expect(buildVisualFilterOptionCounts(facts, false)["result.passed"]).toBe(
      0,
    );

    expect(
      countStoriesMatchingFilters(facts, ["!review.approved"], true),
    ).toEqual({ matching: 3, total: 4 });
    expect(countStoriesMatchingFilters(facts, [], true)).toEqual({
      matching: 4,
      total: 4,
    });
  });

  it("builds friendly dynamic browser filter descriptors", () => {
    expect(
      buildVisualEnvironmentFilterGroups(
        ["chromium", "webkit"],
        ["firefox"],
      ),
    ).toEqual([
      {
        id: "browser",
        label: "Browser",
        options: [
          { id: "browser.chromium", label: "Chromium" },
          { id: "browser.firefox", label: "Firefox" },
          { id: "browser.webkit", label: "WebKit" },
        ],
      },
    ]);
  });
});
