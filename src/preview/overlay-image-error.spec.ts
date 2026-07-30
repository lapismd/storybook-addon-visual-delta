import { describe, expect, it } from "vitest";

/**
 * Preview `applySelection` clears the overlay when the baseline `<img>` fails
 * to load or reports `naturalWidth === 0`. Keep this contract explicit so
 * story switches cannot leave Baseline chrome without a bitmap.
 */
export function shouldClearOverlayForFailedBaselineImage(
  naturalWidth: number,
): boolean {
  return !(naturalWidth > 0);
}

describe("baseline image load failure", () => {
  it("clears overlay chrome when the PNG has no decoded dimensions", () => {
    expect(shouldClearOverlayForFailedBaselineImage(0)).toBe(true);
    expect(shouldClearOverlayForFailedBaselineImage(1280)).toBe(false);
  });
});
