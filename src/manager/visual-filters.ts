import {
  SKIP_VISUAL_TAG,
  VISUAL_REVIEW_APPROVED_TAG,
  VISUAL_REVIEW_FAILED_TAG,
  VISUAL_REVIEW_PENDING_TAG,
  VISUAL_REVIEW_READY_TAG,
} from "../constants.js";
import type {
  VisualBaselineCoverage,
  VisualStoryDescriptor,
  VisualStoryFact,
} from "../shared/story-facts.js";
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
] as const;

export type VisualQuickFilterId = (typeof VISUAL_QUICK_FILTER_IDS)[number];

const KNOWN_FILTER_IDS = new Set<string>([
  ...VISUAL_QUICK_FILTER_IDS,
  ...Object.values(VISUAL_FILTER_GROUPS).flat(),
]);

const KNOWN_FACET_IDS = new Set<string>(
  Object.values(VISUAL_FILTER_GROUPS).flat(),
);

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
): Map<string, VisualStoryFilterFact> {
  const coverageByStory = new Map(
    coverage.map((fact) => [fact.storyId, fact.baseline]),
  );
  const outcomes = hasCompletedRun ? resultByStory(results) : new Map();
  return new Map(
    stories.map((story) => {
      const tags = story.tags ?? [];
      const fact: VisualStoryFilterFact = {
        storyId: story.id,
        review: reviewFromTags(tags),
        result: hasCompletedRun
          ? filterResultFromOutcome(outcomes.get(story.id))
          : "not-run",
        baseline: coverageByStory.get(story.id) ?? "unresolved",
        inclusion: tags.includes(SKIP_VISUAL_TAG) ? "skipped" : "included",
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
    return KNOWN_FACET_IDS.has(id);
  }
  return KNOWN_FILTER_IDS.has(id);
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
  if (!KNOWN_FACET_IDS.has(id)) {
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
  if (!KNOWN_FILTER_IDS.has(id)) return [...activeIds];
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
  if (!KNOWN_FACET_IDS.has(id)) return [...activeIds];
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
    groupMatches(fact.inclusion, inclusionIncludes, inclusionExcludes)
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
  const counts: Record<string, number> = {};
  for (const id of KNOWN_FILTER_IDS) {
    counts[id] = 0;
  }
  for (const fact of list) {
    for (const id of KNOWN_FILTER_IDS) {
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
