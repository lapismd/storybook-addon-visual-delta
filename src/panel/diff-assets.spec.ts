import { describe, expect, it } from "vitest";
import { buildDiffHistogram, buildFocusAssets } from "./diff-assets.js";

function rgba(
  width: number,
  height: number,
  fill: [number, number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  return data;
}

describe("buildFocusAssets", () => {
  it("returns null changeBounds and undimmed actual when nothing changed", () => {
    const actual = rgba(2, 2, [10, 20, 30, 255]);
    const diff = rgba(2, 2, [0, 0, 0, 0]);
    const { changeBounds, focusDataUrl } = buildFocusAssets(actual, diff, 2, 2);
    expect(changeBounds).toBeNull();
    expect(focusDataUrl.startsWith("data:image/png")).toBe(true);
  });

  it("bounds red/green pixelmatch mismatches", () => {
    const actual = rgba(4, 4, [0, 0, 0, 255]);
    const diff = rgba(4, 4, [0, 0, 0, 0]);
    // Mark pixel (1,1) as red mismatch
    const i = (1 * 4 + 1) * 4;
    diff[i] = 255;
    diff[i + 1] = 0;
    diff[i + 2] = 0;
    diff[i + 3] = 255;
    const { changeBounds } = buildFocusAssets(actual, diff, 4, 4);
    expect(changeBounds).not.toBeNull();
    expect(changeBounds!.width).toBeGreaterThanOrEqual(1);
    expect(changeBounds!.height).toBeGreaterThanOrEqual(1);
  });
});

describe("buildDiffHistogram", () => {
  it("buckets changed pixels by max-channel delta", () => {
    const baseline = rgba(1, 1, [0, 0, 0, 255]);
    const actual = rgba(1, 1, [255, 0, 0, 255]);
    const diff = rgba(1, 1, [255, 0, 0, 255]);
    const hist = buildDiffHistogram(baseline, actual, diff, 1, 1, 8);
    expect(hist).toHaveLength(8);
    expect(hist.reduce((a, b) => a + b, 0)).toBe(1);
    expect(hist[7]).toBe(1);
  });
});
