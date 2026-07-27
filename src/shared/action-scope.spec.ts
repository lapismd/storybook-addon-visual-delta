import { describe, expect, it } from "vitest";
import {
  executeVisualActionSequence,
  resolveVisualActionStoryIds,
} from "./action-scope.js";

describe("resolveVisualActionStoryIds", () => {
  it("keeps a story context exact", () => {
    expect(
      resolveVisualActionStoryIds({
        context: "story",
        contextStoryIds: ["menu--chooses-an-item"],
        visibleStoryIds: ["menu--chooses-an-item", "menu--checkboxes"],
      }),
    ).toEqual(["menu--chooses-an-item"]);
  });

  it("keeps every explicit component descendant", () => {
    expect(
      resolveVisualActionStoryIds({
        context: "component",
        contextStoryIds: [
          "menu--chooses-an-item",
          "menu--checkboxes",
          "menu--radio-items",
        ],
      }),
    ).toEqual([
      "menu--chooses-an-item",
      "menu--checkboxes",
      "menu--radio-items",
    ]);
  });

  it("uses exactly the globally visible stories", () => {
    expect(
      resolveVisualActionStoryIds({
        context: "global",
        visibleStoryIds: ["menu--checkboxes", "dialog--default"],
      }),
    ).toEqual(["menu--checkboxes", "dialog--default"]);
  });

  it("intersects visible, runnable, and affected stories exactly", () => {
    expect(
      resolveVisualActionStoryIds({
        context: "global",
        visibleStoryIds: [
          "menu--chooses-an-item",
          "menu--checkboxes",
          "dialog--default",
        ],
        runnableStoryIds: [
          "menu--chooses-an-item",
          "menu--checkboxes",
          "dialog--default",
          "hidden--affected",
        ],
        affectedStoryIds: [
          "menu--checkboxes",
          "hidden--affected",
          "skip--affected",
        ],
        affectedOnly: true,
      }),
    ).toEqual(["menu--checkboxes"]);
  });

  it("applies conservative affected fallbacks only within visible stories", () => {
    expect(
      resolveVisualActionStoryIds({
        context: "global",
        visibleStoryIds: ["menu--checkboxes", "dialog--default"],
        runnableStoryIds: [
          "menu--chooses-an-item",
          "menu--checkboxes",
          "dialog--default",
        ],
        affectedStoryIds: [
          "menu--chooses-an-item",
          "menu--checkboxes",
          "dialog--default",
        ],
        affectedOnly: true,
      }),
    ).toEqual(["menu--checkboxes", "dialog--default"]);
  });

  it("returns an empty scope without broadening", () => {
    expect(
      resolveVisualActionStoryIds({
        context: "global",
        visibleStoryIds: [],
        runnableStoryIds: ["menu--checkboxes"],
      }),
    ).toEqual([]);
    expect(
      resolveVisualActionStoryIds({
        context: "global",
        visibleStoryIds: ["menu--checkboxes"],
        runnableStoryIds: ["menu--checkboxes"],
        affectedStoryIds: [],
        affectedOnly: true,
      }),
    ).toEqual([]);
  });

  it("returns a detached frozen-at-invocation snapshot", () => {
    const visible = ["menu--checkboxes"];
    const resolved = resolveVisualActionStoryIds({
      context: "global",
      visibleStoryIds: visible,
    });
    visible.push("menu--radio-items");
    expect(resolved).toEqual(["menu--checkboxes"]);
  });

  it("executes baseline, comparison, and status actions in order", async () => {
    const calls: string[] = [];
    const results = [{ storyId: "menu--checkboxes", status: "passed" }];

    await expect(
      executeVisualActionSequence({
        writeBaselines: async () => {
          calls.push("baseline");
        },
        runVisualTests: async () => {
          calls.push("compare");
          return results;
        },
        updateStatus: async (received) => {
          calls.push("status");
          expect(received).toBe(results);
        },
      }),
    ).resolves.toBe(results);
    expect(calls).toEqual(["baseline", "compare", "status"]);
  });
});
