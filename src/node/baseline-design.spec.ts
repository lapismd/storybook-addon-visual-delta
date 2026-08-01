import { describe, expect, it } from "vitest";
import { existingVisualBaselineUrls } from "./baseline-design.js";

describe("baseline environment discovery", () => {
  it("keeps the filename shape and returns every committed environment", () => {
    const existing = new Set([
      "/visual/button-chromium.png",
      "/visual/button-firefox.png",
      "/visual/button-webkit.png",
    ]);
    expect(
      existingVisualBaselineUrls(
        "/visual/button-chromium.png",
        (url) => existing.has(url),
      ),
    ).toEqual([...existing]);
  });
});
