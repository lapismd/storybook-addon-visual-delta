import {
  SKIP_VISUAL_TAG,
  VISUAL_REVIEW_APPROVED_TAG,
  VISUAL_REVIEW_FAILED_TAG,
  VISUAL_REVIEW_PENDING_TAG,
  VISUAL_REVIEW_READY_TAG,
} from "../constants.js";
import type {
  VisualBaselineCoverage,
  VisualEnvironmentCoverage,
  VisualStoryDescriptor,
  VisualStoryFact,
} from "../shared/story-facts.js";
import {
  VISUAL_DELTA_BROWSERS,
  isVisualDeltaBrowser,
  visualBaselineEnvironmentKey,
  visualDeltaBrowserLabel,
  type VisualBaselineEnvironment,
} from "../shared/environments.js";
import {
  classifyVisualRunResult,
  type VisualComparisonOutcome,
} from "../shared/visual-result-classification.js";
import type { VisualRunResultItem } from "./run-visual.js";

export const VISUAL_FILTER_QUERY_PARAM = "visualFilter";
export const VISUAL_FILTER_ADDON_ID =
  "storybook-addon-visual-delta/sidebar-filter";

export type VisualReviewFilterValue =
  | "ready"
  | "pending"
  | "approved"
  | "failed"
  | "unreviewed";

export type VisualResultFilterValue =
  | "mismatch"
  | "changed-within-tolerance"
  | "passed"
  | "error"
  | "not-run";

export type VisualInclusionFilterValue = "included" | "skipped";

export type VisualStoryFilterFact = {
  storyId: string;
  review: VisualReviewFilterValue;
  result: VisualResultFilterValue;
  baseline: VisualBaselineCoverage;
  inclusion: VisualInclusionFilterValue;
  environmentCoverage: VisualEnvironmentCoverage[];
  requiredEnvironments: VisualBaselineEnvironment[];
};

export type VisualFilterOptionDescriptor = {
  id: string;
  label: string;
};

export type VisualFilterGroupDescriptor = {
  id: "os" | "browser";
  label: string;
  options: VisualFilterOptionDescriptor[];
};

export type VisualFilterSelectionState = "off" | "included" | "excluded";

export const VISUAL_FILTER_GROUPS = {
  review: [
    "review.ready",
    "review.pending",
    "review.approved",
    "review.failed",
    "review.unreviewed",
  ],
  result: [
    "result.mismatch",
    "result.changed-within-tolerance",
    "result.passed",
    "result.error",
    "result.not-run",
  ],
  coverage: ["coverage.present", "coverage.missing", "coverage.unresolved"],
  inclusion: ["inclusion.skipped"],
} as const;

export const VISUAL_QUICK_FILTER_IDS = [
  "quick.needs-attention",
  "quick.review-queue",
  "quick.coverage-gaps",
  "quick.os-parity-gaps",
] as const;

export type VisualQuickFilterId = (typeof VISUAL_QUICK_FILTER_IDS)[number];

const KNOWN_FILTER_IDS = new Set<string>([
  ...VISUAL_QUICK_FILTER_IDS,
  ...Object.values(VISUAL_FILTER_GROUPS).flat(),
]);

const KNOWN_FACET_IDS = new Set<string>(
  Object.values(VISUAL_FILTER_GROUPS).flat(),
);

const DYNAMIC_OS_FILTER_RE = /^os\.([a-z0-9]+)$/;
const DYNAMIC_BROWSER_FILTER_RE = /^browser\.([a-z0-9]+)$/;

function isKnownFacetId(id: string): boolean {
  if (KNOWN_FACET_IDS.has(id)) return true;
  if (DYNAMIC_OS_FILTER_RE.test(id)) return true;
  const browser = id.match(DYNAMIC_BROWSER_FILTER_RE)?.[1];
  return isVisualDeltaBrowser(browser);
}

function isKnownFilterId(id: string): boolean {
  return KNOWN_FILTER_IDS.has(id) || isKnownFacetId(id);
}

function platformLabel(platform: string): string {
  if (platform === "darwin") return "macOS";
  if (platform === "linux") return "Linux";
  if (platform === "win32") return "Windows";
  return platform;
}

export function buildVisualEnvironmentFilterGroups(
  availableEnvironments: readonly VisualBaselineEnvironment[] = [],
  requiredEnvironments: readonly VisualBaselineEnvironment[] = [],
): VisualFilterGroupDescriptor[] {
  const environments = new Map<string, VisualBaselineEnvironment>();
  for (const environment of [
    ...availableEnvironments,
    ...requiredEnvironments,
  ]) {
    environments.set(visualBaselineEnvironmentKey(environment), environment);
  }
  const platforms = [
    ...new Set([...environments.values()].map((item) => item.platform)),
  ];
  const platformOrder = ["darwin", "linux", "win32"];
  platforms.sort((left, right) => {
    const leftIndex = platformOrder.indexOf(left);
    const rightIndex = platformOrder.indexOf(right);
    if (leftIndex >= 0 || rightIndex >= 0) {
      if (leftIndex < 0) return 1;
      if (rightIndex < 0) return -1;
      return leftIndex - rightIndex;
    }
    return left.localeCompare(right);
  });
  const browsers = [
    ...new Set([...environments.values()].map((item) => item.browser)),
  ].sort(
    (left, right) =>
      VISUAL_DELTA_BROWSERS.indexOf(left) -
      VISUAL_DELTA_BROWSERS.indexOf(right),
  );
  return [
    {
      id: "os",
      label: "Operating System",
      options: platforms.map((platform) => ({
        id: `os.${platform}`,
        label: platformLabel(platform),
      })),
    },
    {
      id: "browser",
      label: "Browser",
      options: browsers.map((browser) => ({
        id: `browser.${browser}`,
        label: visualDeltaBrowserLabel(browser),
      })),
    },
  ].filter((group) => group.options.length > 0) as VisualFilterGroupDescriptor[];
}

function reviewFromTags(tags: readonly string[]): VisualReviewFilterValue {
  if (tags.includes(VISUAL_REVIEW_FAILED_TAG)) return "failed";
  if (tags.includes(VISUAL_REVIEW_READY_TAG)) return "ready";
  if (tags.includes(VISUAL_REVIEW_PENDING_TAG)) return "pending";
  if (tags.includes(VISUAL_REVIEW_APPROVED_TAG)) return "approved";
  return "unreviewed";
}

function filterResultFromOutcome(
  outcome: VisualComparisonOutcome | undefined,
): VisualResultFilterValue {
  if (!outcome || outcome === "skipped" || outcome === "missing-baseline") {
    return "not-run";
  }
  return outcome;
}

function resultByStory(
  results: readonly VisualRunResultItem[] | undefined,
): Map<string, VisualComparisonOutcome> {
  const outcomes = new Map<string, VisualComparisonOutcome>();
  for (const result of results ?? []) {
    outcomes.set(result.storyId, classifyVisualRunResult(result));
  }
  return outcomes;
}

export function buildVisualStoryFilterFacts(
  stories: readonly VisualStoryDescriptor[],
  coverage: readonly VisualStoryFact[],
  results: readonly VisualRunResultItem[] | undefined,
  hasCompletedRun: boolean,
  requiredEnvironments: readonly VisualBaselineEnvironment[] = [],
): Map<string, VisualStoryFilterFact> {
  const coverageByStory = new Map(coverage.map((fact) => [fact.storyId, fact]));
  const outcomes = hasCompletedRun ? resultByStory(results) : new Map();
  return new Map(
    stories.map((story) => {
      const tags = story.tags ?? [];
      const coverageFact = coverageByStory.get(story.id);
      const fact: VisualStoryFilterFact = {
        storyId: story.id,
        review: reviewFromTags(tags),
        result: hasCompletedRun
          ? filterResultFromOutcome(outcomes.get(story.id))
          : "not-run",
        baseline: coverageFact?.baseline ?? "unresolved",
        inclusion: tags.includes(SKIP_VISUAL_TAG) ? "skipped" : "included",
        environmentCoverage: coverageFact?.environmentCoverage ?? [],
        requiredEnvironments: [...requiredEnvironments],
      };
      return [story.id, fact];
    }),
  );
}

/** Bare filter id from an include (`review.ready`) or exclude (`!review.ready`) token. */
export function filterIdFromToken(token: string): string {
  return token.startsWith("!") ? token.slice(1) : token;
}

export function isExcludeToken(token: string): boolean {
  return token.startsWith("!");
}

export function excludeFilterToken(id: string): string {
  return `!${id}`;
}

export function isKnownFilterToken(token: string): boolean {
  const id = filterIdFromToken(token);
  if (isExcludeToken(token)) {
    // Quick views are include-only presets.
    return isKnownFacetId(id);
  }
  return isKnownFilterId(id);
}

export function parseVisualFilterIds(value: unknown): string[] {
  if (typeof value !== "string") return [];
  // Last token wins when both include and exclude appear for the same id.
  const byId = new Map<string, string>();
  for (const part of value.split(",")) {
    const token = part.trim();
    if (!token || !isKnownFilterToken(token)) continue;
    byId.set(filterIdFromToken(token), token);
  }
  return [...byId.values()];
}

export function serializeVisualFilterIds(ids: readonly string[]): string {
  return ids.filter((token) => isKnownFilterToken(token)).join(",");
}

export function filterSelectionState(
  activeIds: readonly string[],
  id: string,
): VisualFilterSelectionState {
  if (activeIds.includes(id)) return "included";
  if (activeIds.includes(excludeFilterToken(id))) return "excluded";
  return "off";
}

/** Checkbox: off → include; included/excluded → clear. Clears quick views. */
export function toggleFilterCheckbox(
  activeIds: readonly string[],
  id: string,
): string[] {
  const state = filterSelectionState(activeIds, id);
  if (state === "off") return setFilterInclude(activeIds, id);
  return clearFilterId(activeIds, id);
}

/** Invert polarity (Storybook Include/Exclude). Off or included → exclude; excluded → include. */
export function invertFilterPolarity(
  activeIds: readonly string[],
  id: string,
): string[] {
  if (!isKnownFacetId(id)) {
    return setFilterInclude(activeIds, id);
  }
  return filterSelectionState(activeIds, id) === "excluded"
    ? setFilterInclude(activeIds, id)
    : setFilterExclude(activeIds, id);
}

export function setFilterInclude(
  activeIds: readonly string[],
  id: string,
): string[] {
  if (!isKnownFilterId(id)) return [...activeIds];
  if (id.startsWith("quick.")) return [id];
  const next = activeIds.filter(
    (token) =>
      !token.startsWith("quick.") &&
      filterIdFromToken(token) !== id,
  );
  next.push(id);
  return next;
}

export function setFilterExclude(
  activeIds: readonly string[],
  id: string,
): string[] {
  if (!isKnownFacetId(id)) return [...activeIds];
  const next = activeIds.filter(
    (token) =>
      !token.startsWith("quick.") &&
      filterIdFromToken(token) !== id,
  );
  next.push(excludeFilterToken(id));
  return next;
}

export function clearFilterId(
  activeIds: readonly string[],
  id: string,
): string[] {
  return activeIds.filter((token) => filterIdFromToken(token) !== id);
}

function matchesQuickView(
  fact: VisualStoryFilterFact,
  id: VisualQuickFilterId,
): boolean {
  if (id === "quick.needs-attention") {
    return (
      fact.inclusion === "included" &&
      (fact.review === "ready" ||
        fact.result === "mismatch" ||
        fact.result === "error" ||
        fact.baseline === "missing")
    );
  }
  if (id === "quick.review-queue") {
    return (
      fact.review === "ready" ||
      fact.review === "pending" ||
      fact.review === "failed"
    );
  }
  if (id === "quick.os-parity-gaps") {
    if (
      fact.inclusion !== "included" ||
      fact.requiredEnvironments.length === 0
    ) {
      return false;
    }
    const coverageByEnvironment = new Map(
      fact.environmentCoverage.map((coverage) => [
        visualBaselineEnvironmentKey(coverage),
        coverage.baseline,
      ]),
    );
    return fact.requiredEnvironments.some(
      (environment) =>
        coverageByEnvironment.get(visualBaselineEnvironmentKey(environment)) !==
        "present",
    );
  }
  return (
    fact.inclusion === "included" &&
    (fact.baseline === "missing" || fact.result === "not-run")
  );
}

function factValueForPrefix(
  fact: VisualStoryFilterFact,
  prefix: string,
): string | null {
  if (prefix === "review") return fact.review;
  if (prefix === "result") return fact.result;
  if (prefix === "coverage") return fact.baseline;
  if (prefix === "inclusion") return fact.inclusion;
  return null;
}

function groupValues(
  tokens: ReadonlySet<string>,
  prefix: string,
  polarity: "include" | "exclude",
): string[] {
  return [...tokens]
    .filter((token) => {
      const excluded = isExcludeToken(token);
      if ((polarity === "exclude") !== excluded) return false;
      return filterIdFromToken(token).startsWith(`${prefix}.`);
    })
    .map((token) => filterIdFromToken(token).slice(prefix.length + 1));
}

function groupMatches(
  factValue: string,
  includes: readonly string[],
  excludes: readonly string[],
): boolean {
  if (includes.length > 0 && !includes.includes(factValue)) return false;
  if (excludes.length > 0 && excludes.includes(factValue)) return false;
  return true;
}

function presentEnvironments(
  fact: VisualStoryFilterFact,
): VisualEnvironmentCoverage[] {
  return fact.environmentCoverage.filter(
    (environment) => environment.baseline === "present",
  );
}

function environmentGroupsMatch(
  fact: VisualStoryFilterFact,
  tokens: ReadonlySet<string>,
): boolean {
  const osIncludes = groupValues(tokens, "os", "include");
  const osExcludes = groupValues(tokens, "os", "exclude");
  const browserIncludes = groupValues(tokens, "browser", "include");
  const browserExcludes = groupValues(tokens, "browser", "exclude");
  const present = presentEnvironments(fact);

  if (
    osExcludes.some((platform) =>
      present.some((environment) => environment.platform === platform),
    ) ||
    browserExcludes.some((browser) =>
      present.some((environment) => environment.browser === browser),
    )
  ) {
    return false;
  }

  if (osIncludes.length === 0 && browserIncludes.length === 0) return true;
  return present.some(
    (environment) =>
      (osIncludes.length === 0 || osIncludes.includes(environment.platform)) &&
      (browserIncludes.length === 0 ||
        browserIncludes.includes(environment.browser)),
  );
}

export function visualStoryMatchesFilters(
  fact: VisualStoryFilterFact,
  activeIds: readonly string[],
  hasCompletedRun: boolean,
): boolean {
  const tokens = new Set(activeIds.filter((token) => isKnownFilterToken(token)));
  const quick = VISUAL_QUICK_FILTER_IDS.find((id) => tokens.has(id));
  if (quick) return matchesQuickView(fact, quick);

  const reviewIncludes = groupValues(tokens, "review", "include");
  const reviewExcludes = groupValues(tokens, "review", "exclude");
  const resultIncludes = hasCompletedRun
    ? groupValues(tokens, "result", "include")
    : [];
  const resultExcludes = hasCompletedRun
    ? groupValues(tokens, "result", "exclude")
    : [];
  const coverageIncludes = groupValues(tokens, "coverage", "include");
  const coverageExcludes = groupValues(tokens, "coverage", "exclude");
  const inclusionIncludes = groupValues(tokens, "inclusion", "include");
  const inclusionExcludes = groupValues(tokens, "inclusion", "exclude");

  return (
    groupMatches(fact.review, reviewIncludes, reviewExcludes) &&
    groupMatches(fact.result, resultIncludes, resultExcludes) &&
    groupMatches(fact.baseline, coverageIncludes, coverageExcludes) &&
    groupMatches(fact.inclusion, inclusionIncludes, inclusionExcludes) &&
    environmentGroupsMatch(fact, tokens)
  );
}

export function storyMatchesFilterOption(
  fact: VisualStoryFilterFact,
  id: string,
  hasCompletedRun: boolean,
): boolean {
  if (VISUAL_QUICK_FILTER_IDS.includes(id as VisualQuickFilterId)) {
    return matchesQuickView(fact, id as VisualQuickFilterId);
  }
  if (id.startsWith("result.") && !hasCompletedRun) return false;
  const os = id.match(DYNAMIC_OS_FILTER_RE)?.[1];
  if (os) {
    return presentEnvironments(fact).some(
      (environment) => environment.platform === os,
    );
  }
  const browser = id.match(DYNAMIC_BROWSER_FILTER_RE)?.[1];
  if (browser) {
    return presentEnvironments(fact).some(
      (environment) => environment.browser === browser,
    );
  }
  const prefix = id.split(".")[0] ?? "";
  const value = id.slice(prefix.length + 1);
  const factValue = factValueForPrefix(fact, prefix);
  return factValue === value;
}

/** Per-option population counts (Storybook-style; not “remaining after other filters”). */
export function buildVisualFilterOptionCounts(
  facts: ReadonlyMap<string, VisualStoryFilterFact> | Iterable<VisualStoryFilterFact>,
  hasCompletedRun: boolean,
): Record<string, number> {
  const list =
    facts instanceof Map ? [...facts.values()] : [...facts];
  const ids = new Set<string>(KNOWN_FILTER_IDS);
  for (const fact of list) {
    for (const environment of [
      ...fact.environmentCoverage,
      ...fact.requiredEnvironments,
    ]) {
      ids.add(`os.${environment.platform}`);
      ids.add(`browser.${environment.browser}`);
    }
  }
  const counts: Record<string, number> = {};
  for (const id of ids) {
    counts[id] = 0;
  }
  for (const fact of list) {
    for (const id of ids) {
      if (storyMatchesFilterOption(fact, id, hasCompletedRun)) {
        counts[id] = (counts[id] ?? 0) + 1;
      }
    }
  }
  return counts;
}

export function countStoriesMatchingFilters(
  facts: ReadonlyMap<string, VisualStoryFilterFact> | Iterable<VisualStoryFilterFact>,
  activeIds: readonly string[],
  hasCompletedRun: boolean,
): { matching: number; total: number } {
  const list =
    facts instanceof Map ? [...facts.values()] : [...facts];
  const total = list.length;
  if (!activeIds.length) return { matching: total, total };
  let matching = 0;
  for (const fact of list) {
    if (visualStoryMatchesFilters(fact, activeIds, hasCompletedRun)) {
      matching += 1;
    }
  }
  return { matching, total };
}

export function createVisualStoryFilter(
  facts: ReadonlyMap<string, VisualStoryFilterFact>,
  activeIds: readonly string[],
  hasCompletedRun: boolean,
): (entry: { id: string; type?: string }) => boolean {
  if (!activeIds.length) return () => true;
  return (entry) => {
    const fact = facts.get(entry.id);
    return fact
      ? visualStoryMatchesFilters(fact, activeIds, hasCompletedRun)
      : false;
  };
}
