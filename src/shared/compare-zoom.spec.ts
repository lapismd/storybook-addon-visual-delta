import { describe, expect, it } from "vitest";
import {
  clampCompareZoom,
  compareZoomFromDefault,
  fitCompareScale,
  resolvedCompareZoomScale,
  stepCompareZoom,
} from "./compare-zoom.js";

describe("shared compare zoom", () => {
  it("fits one stage by width and height without upscaling", () => {
    expect(
      fitCompareScale({
        availableWidth: 640,
        availableHeight: 450,
        contentWidth: 1280,
        contentHeight: 900,
      }),
    ).toBe(0.5);
    expect(
      fitCompareScale({
        availableWidth: 1600,
        availableHeight: 1000,
        contentWidth: 1280,
        contentHeight: 900,
      }),
    ).toBe(1);
  });

  it("fits two full images into equal columns using one scale", () => {
    expect(
      fitCompareScale({
        availableWidth: 1292,
        availableHeight: 900,
        contentWidth: 1280,
        contentHeight: 900,
        columns: 2,
        columnGap: 12,
      }),
    ).toBe(0.5);
  });

  it("clamps and steps custom zoom from 25% to 200%", () => {
    expect(clampCompareZoom(0)).toBe(0.25);
    expect(clampCompareZoom(4)).toBe(2);
    expect(stepCompareZoom(0.25, -1)).toBe(0.25);
    expect(stepCompareZoom(1, 1)).toBe(1.1);
    expect(stepCompareZoom(2, 1)).toBe(2);
  });

  it("uses configured defaults and only recomputes Fit", () => {
    const fit = compareZoomFromDefault("fit");
    const custom = compareZoomFromDefault("100%");
    const input = {
      availableWidth: 640,
      availableHeight: 450,
      contentWidth: 1280,
      contentHeight: 900,
    };
    expect(resolvedCompareZoomScale(fit, input)).toBe(0.5);
    expect(resolvedCompareZoomScale(custom, input)).toBe(1);
  });
});
