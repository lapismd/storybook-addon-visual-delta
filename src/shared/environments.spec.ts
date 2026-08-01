import { describe, expect, it } from "vitest";
import {
  parseVisualBaselineEnvironment,
  validateVisualDeltaBrowsers,
  withVisualBaselineEnvironment,
} from "./environments.js";

describe("visual baseline environments", () => {
  it("validates a non-empty unique Playwright browser matrix", () => {
    expect(validateVisualDeltaBrowsers(["chromium", "firefox", "webkit"]))
      .toEqual({
        value: ["chromium", "firefox", "webkit"],
        errors: [],
      });
    expect(validateVisualDeltaBrowsers([]).errors).toContain(
      "browsers must be a non-empty array.",
    );
    expect(validateVisualDeltaBrowsers(["chromium", "chromium"]).errors[0])
      .toMatch(/duplicate chromium/);
  });

  it("parses primary, interaction, actual, diff, and sidecar paths", () => {
    for (const value of [
      "story-firefox-linux.png",
      "story--open-webkit-win32.png",
      "story-chromium-darwin.actual.png",
      "story-firefox-linux.diff.png",
      "story-webkit-darwin.json",
    ]) {
      expect(parseVisualBaselineEnvironment(value)).not.toBeNull();
    }
    expect(parseVisualBaselineEnvironment("story-safari-darwin.png")).toBeNull();
  });

  it("replaces only the browser/platform suffix", () => {
    expect(
      withVisualBaselineEnvironment("/visual/story-chromium-darwin.png", {
        browser: "webkit",
        platform: "linux",
      }),
    ).toBe("/visual/story-webkit-linux.png");
  });
});
