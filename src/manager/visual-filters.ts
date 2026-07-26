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
  inclusion: ["inclusion.included", "inclusion.skipped"],
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

export function parseVisualFilterIds(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [
    ...new Set(
      value
        .split(",")
        .map((part) => part.trim())
        .filter((part) => KNOWN_FILTER_IDS.has(part)),
    ),
  ];
}

export function serializeVisualFilterIds(ids: readonly string[]): string {
  return ids.filter((id) => KNOWN_FILTER_IDS.has(id)).join(",");
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

function selectedValues(ids: ReadonlySet<string>, prefix: string): string[] {
  return [...ids]
    .filter((id) => id.startsWith(`${prefix}.`))
    .map((id) => id.slice(prefix.length + 1));
}

export function visualStoryMatchesFilters(
  fact: VisualStoryFilterFact,
  activeIds: readonly string[],
  hasCompletedRun: boolean,
): boolean {
  const ids = new Set(activeIds.filter((id) => KNOWN_FILTER_IDS.has(id)));
  const quick = VISUAL_QUICK_FILTER_IDS.find((id) => ids.has(id));
  if (quick) return matchesQuickView(fact, quick);

  const review = selectedValues(ids, "review");
  const result = hasCompletedRun ? selectedValues(ids, "result") : [];
  const coverage = selectedValues(ids, "coverage");
  const inclusion = selectedValues(ids, "inclusion");
  return (
    (!review.length || review.includes(fact.review)) &&
    (!result.length || result.includes(fact.result)) &&
    (!coverage.length || coverage.includes(fact.baseline)) &&
    (!inclusion.length || inclusion.includes(fact.inclusion))
  );
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
