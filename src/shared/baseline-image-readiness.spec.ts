import { describe, expect, it } from "vitest";
import { baselineImageReady } from "./baseline-image-readiness.js";

const ready = {
  generation: 3,
  activeGeneration: 3,
  source: "/baseline.png",
  activeSource: "/baseline.png",
  complete: true,
  naturalWidth: 3840,
  naturalHeight: 2700,
};

describe("baselineImageReady", () => {
  it("accepts only a complete current image with valid dimensions", () => {
    expect(baselineImageReady(ready)).toBe(true);
    expect(baselineImageReady({ ...ready, complete: false })).toBe(false);
    expect(baselineImageReady({ ...ready, naturalWidth: 0 })).toBe(false);
    expect(baselineImageReady({ ...ready, naturalHeight: 0 })).toBe(false);
  });

  it("rejects stale generations and replaced sources", () => {
    expect(baselineImageReady({ ...ready, generation: 2 })).toBe(false);
    expect(
      baselineImageReady({ ...ready, activeSource: "/replacement.png" }),
    ).toBe(false);
  });
});
