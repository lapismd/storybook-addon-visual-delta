import { describe, expect, it } from "vitest";
import {
  buildVisualStoryFilterFacts,
  parseVisualFilterIds,
  serializeVisualFilterIds,
  visualStoryMatchesFilters,
} from "./visual-filters.js";

const stories = [
  { id: "ready-mismatch", tags: ["visual-ready"] },
  { id: "approved-pass", tags: ["visual-approved"] },
  { id: "skipped-missing", tags: ["skip-visual"] },
  { id: "unreviewed-new", tags: [] },
];
const coverage = [
  { storyId: "ready-mismatch", baseline: "present" as const },
  { storyId: "approved-pass", baseline: "present" as const },
  { storyId: "skipped-missing", baseline: "missing" as const },
  { storyId: "unreviewed-new", baseline: "missing" as const },
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

describe("visual filters", () => {
  const facts = buildVisualStoryFilterFacts(stories, coverage, results, true);

  it("uses OR within a group and AND across groups", () => {
    expect(
      [...facts.values()]
        .filter((fact) =>
          visualStoryMatchesFilters(
            fact,
            ["review.ready", "review.approved", "coverage.present"],
            true,
          ),
        )
        .map((fact) => fact.storyId),
    ).toEqual(["ready-mismatch", "approved-pass"]);
    expect(
      [...facts.values()]
        .filter((fact) =>
          visualStoryMatchesFilters(
            fact,
            ["review.ready", "result.passed"],
            true,
          ),
        )
        .map((fact) => fact.storyId),
    ).toEqual([]);
  });

  it("provides attention, review-queue, and coverage-gap quick views", () => {
    const matching = (id: string) =>
      [...facts.values()]
        .filter((fact) => visualStoryMatchesFilters(fact, [id], true))
        .map((fact) => fact.storyId);
    expect(matching("quick.needs-attention")).toEqual([
      "ready-mismatch",
      "unreviewed-new",
    ]);
    expect(matching("quick.review-queue")).toEqual(["ready-mismatch"]);
    expect(matching("quick.coverage-gaps")).toEqual(["unreviewed-new"]);
  });

  it("ignores result facets until a completed run exists", () => {
    expect(
      [...facts.values()].every((fact) =>
        visualStoryMatchesFilters(fact, ["result.mismatch"], false),
      ),
    ).toBe(true);
  });

  it("round-trips canonical URL ids and ignores unknown values", () => {
    const parsed = parseVisualFilterIds(
      "review.ready,unknown,result.mismatch,review.ready",
    );
    expect(parsed).toEqual(["review.ready", "result.mismatch"]);
    expect(serializeVisualFilterIds(parsed)).toBe(
      "review.ready,result.mismatch",
    );
  });
});
