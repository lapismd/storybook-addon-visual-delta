import { describe, expect, it } from "vitest";
import { baselineGeometryMismatch } from "./geometry-mismatch.js";

describe("baselineGeometryMismatch", () => {
  it("reports a stale component baseline without rounding noise", () => {
    expect(
      baselineGeometryMismatch(
        { width: 1232, height: 187 },
        { width: 263.968, height: 187 },
        { width: 1280, height: 900 },
        false,
      ),
    ).toEqual({
      baselineCss: { width: 1232, height: 187 },
      liveCss: { width: 264, height: 187 },
      captureViewport: { width: 1280, height: 900 },
    });
  });

  it("ignores sub-pixel drift and full-viewport captures", () => {
    expect(
      baselineGeometryMismatch(
        { width: 264, height: 187 },
        { width: 263.968, height: 187.4 },
        { width: 1280, height: 900 },
        false,
      ),
    ).toBeNull();
    expect(
      baselineGeometryMismatch(
        { width: 1280, height: 900 },
        { width: 264, height: 187 },
        { width: 1280, height: 900 },
        false,
      ),
    ).toBeNull();
  });
});
