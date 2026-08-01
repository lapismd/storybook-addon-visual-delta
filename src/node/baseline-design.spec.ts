import { describe, expect, it } from "vitest";
import { existingVisualBaselineUrls } from "./baseline-design.js";

describe("baseline environment discovery", () => {
  it("keeps the filename shape and returns every committed environment", () => {
    const existing = new Set([
      "/visual/button-chromium-darwin.png",
      "/visual/button-firefox-darwin.png",
      "/visual/button-webkit-linux.png",
    ]);
    expect(
      existingVisualBaselineUrls(
        "/visual/button-chromium-darwin.png",
        (url) => existing.has(url),
      ),
    ).toEqual([...existing]);
  });
});
