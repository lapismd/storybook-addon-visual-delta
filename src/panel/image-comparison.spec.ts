import { describe, expect, it } from "vitest";
import { compareLoadedImages } from "./image-comparison.js";

function image(red: number, green: number, blue: number) {
  const data = new Uint8ClampedArray([red, green, blue, 255]);
  return {
    imageData: { data, width: 1, height: 1 } as ImageData,
    dataUrl: `data:image/png;base64,${red}-${green}-${blue}`,
    width: 1,
    height: 1,
  };
}

describe("image comparison", () => {
  it("returns reusable artifacts without publishing visual status", () => {
    const result = compareLoadedImages(image(255, 255, 255), image(0, 0, 0), {
      pixelThreshold: 0.2,
      passThresholdPercent: 1,
      deviceScaleFactor: 1,
    });

    expect(result.diffPixels).toBe(1);
    expect(result.diffPercent).toBe(100);
    expect(result.passed).toBe(false);
    expect(result.passThresholdPercent).toBe(1);
    expect(result.actualImage).toMatch(/^data:image\/png/);
    expect(result.diffImage).toMatch(/^data:image\/png/);
  });

  it("passes identical images", () => {
    const result = compareLoadedImages(
      image(120, 120, 120),
      image(120, 120, 120),
    );

    expect(result.diffPixels).toBe(0);
    expect(result.passed).toBe(true);
    expect(result.passThresholdPercent).toBe(0.063);
    expect(result.changeBounds).toBeNull();
  });
});
