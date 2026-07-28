import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  affectsAffectedPlan,
  createInvalidatableCache,
} from "./affected-plan-cache.js";

describe("createInvalidatableCache", () => {
  it("reuses a plan until a relevant file change invalidates it", () => {
    const calculate = vi
      .fn<() => { generation: number }>()
      .mockReturnValueOnce({ generation: 1 })
      .mockReturnValueOnce({ generation: 2 });
    const cache = createInvalidatableCache(calculate);

    expect(cache.get()).toEqual({ generation: 1 });
    expect(cache.get()).toEqual({ generation: 1 });
    expect(calculate).toHaveBeenCalledTimes(1);

    cache.invalidate();

    expect(cache.get()).toEqual({ generation: 2 });
    expect(calculate).toHaveBeenCalledTimes(2);
  });
});

describe("affectsAffectedPlan", () => {
  const root = path.resolve("/workspace/catalog");

  it("tracks source, story index, and preview graph changes", () => {
    expect(
      affectsAffectedPlan(root, path.join(root, "src/Button.svelte")),
    ).toBe(true);
    expect(
      affectsAffectedPlan(root, path.join(root, "storybook-static/index.json")),
    ).toBe(true);
    expect(
      affectsAffectedPlan(
        root,
        path.join(root, ".cache/visual-delta/preview-stats.json"),
      ),
    ).toBe(true);
  });

  it("ignores generated churn and files outside the checkout", () => {
    expect(
      affectsAffectedPlan(root, path.join(root, ".cache/vite/chunk.js")),
    ).toBe(false);
    expect(
      affectsAffectedPlan(root, path.resolve("/workspace/other/file.ts")),
    ).toBe(false);
  });
});
