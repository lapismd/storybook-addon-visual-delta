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
    environmentCoverage: [
      {
        browser: "chromium" as const,
        platform: "darwin",
        baseline: "present" as const,
      },
      {
        browser: "chromium" as const,
        platform: "linux",
        baseline: "missing" as const,
      },
    ],
  },
  {
    storyId: "approved-pass",
    baseline: "present" as const,
    environmentCoverage: [
      {
        browser: "chromium" as const,
        platform: "darwin",
        baseline: "present" as const,
      },
      {
        browser: "chromium" as const,
        platform: "linux",
        baseline: "present" as const,
      },
      {
        browser: "firefox" as const,
        platform: "linux",
        baseline: "present" as const,
      },
    ],
  },
  {
    storyId: "skipped-missing",
    baseline: "missing" as const,
    environmentCoverage: [
      {
        browser: "chromium" as const,
        platform: "darwin",
        baseline: "missing" as const,
      },
      {
        browser: "chromium" as const,
        platform: "linux",
        baseline: "missing" as const,
      },
    ],
  },
  {
    storyId: "unreviewed-new",
    baseline: "missing" as const,
    environmentCoverage: [
      {
        browser: "chromium" as const,
        platform: "darwin",
        baseline: "unresolved" as const,
      },
      {
        browser: "chromium" as const,
        platform: "linux",
        baseline: "missing" as const,
      },
    ],
  },
];
const requiredEnvironments = [
  { browser: "chromium" as const, platform: "darwin" },
  { browser: "chromium" as const, platform: "linux" },
];
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
    requiredEnvironments,
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
    expect(matchingIds(facts, ["quick.os-parity-gaps"])).toEqual([
      "ready-mismatch",
      "unreviewed-new",
    ]);
  });

  it("matches exact Browser × OS pairs and excludes present facets", () => {
    expect(matchingIds(facts, ["os.linux"])).toEqual(["approved-pass"]);
    expect(matchingIds(facts, ["browser.firefox"])).toEqual([
      "approved-pass",
    ]);
    expect(matchingIds(facts, ["os.linux", "browser.firefox"])).toEqual([
      "approved-pass",
    ]);
    expect(matchingIds(facts, ["!os.linux"])).toEqual([
      "ready-mismatch",
      "skipped-missing",
      "unreviewed-new",
    ]);

    const crossPairFacts = new Map([
      [
        "cross-pair",
        {
          storyId: "cross-pair",
          review: "unreviewed" as const,
          result: "not-run" as const,
          baseline: "present" as const,
          inclusion: "included" as const,
          requiredEnvironments: [],
          environmentCoverage: [
            {
              browser: "chromium" as const,
              platform: "darwin",
              baseline: "present" as const,
            },
            {
              browser: "firefox" as const,
              platform: "linux",
              baseline: "present" as const,
            },
          ],
        },
      ],
    ]);
    expect(matchingIds(crossPairFacts, ["os.linux", "browser.chromium"]))
      .toEqual([]);
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
        "os.linux,!browser.firefox,quick.os-parity-gaps,!quick.os-parity-gaps",
      ),
    ).toEqual(["os.linux", "!browser.firefox", "quick.os-parity-gaps"]);
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
    expect(counts["os.linux"]).toBe(1);
    expect(counts["browser.firefox"]).toBe(1);
    expect(counts["quick.os-parity-gaps"]).toBe(2);
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

  it("builds friendly dynamic environment filter descriptors", () => {
    expect(
      buildVisualEnvironmentFilterGroups(
        [
          { browser: "chromium", platform: "linux" },
          { browser: "webkit", platform: "darwin" },
        ],
        [{ browser: "firefox", platform: "darwin" }],
      ),
    ).toEqual([
      {
        id: "os",
        label: "Operating System",
        options: [
          { id: "os.darwin", label: "macOS" },
          { id: "os.linux", label: "Linux" },
        ],
      },
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
