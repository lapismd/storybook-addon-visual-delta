import { describe, expect, it } from "vitest";
import { baselineCompareSizesFromNatural } from "./compare-viewport.js";

describe("baselineCompareSizesFromNatural", () => {
  it("uses per-image device scale metadata", () => {
    expect(baselineCompareSizesFromNatural(1440, 960, 16, 1)?.content).toEqual({
      width: 1440,
      height: 960,
    });
    expect(baselineCompareSizesFromNatural(3840, 2700, 16, 3)?.content).toEqual(
      {
        width: 1280,
        height: 900,
      },
    );
  });
});
