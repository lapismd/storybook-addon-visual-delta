import { describe, expect, it } from "vitest";
import {
  discoverVisualEnvironments,
  loadVisualEnvironmentPreference,
  saveVisualEnvironmentPreference,
  sourceMatchesEnvironment,
} from "./environment-selection.js";

describe("panel environment selection", () => {
  it("combines configured browsers with discovered view-only environments", () => {
    const options = discoverVisualEnvironments({
      configuredBrowsers: ["chromium", "firefox"],
      runtimePlatform: "darwin",
      sources: [
        "/visual/story-chromium-darwin.png",
        "/visual/story-webkit-linux.png",
      ],
    });
    expect(options.browsers).toEqual([
      { value: "chromium", label: "Chromium", enabled: true },
      { value: "firefox", label: "Firefox", enabled: true },
      { value: "webkit", label: "WebKit (view only)", enabled: false },
    ]);
    expect(options.platforms).toEqual([
      { value: "darwin", label: "macOS", enabled: true },
      { value: "linux", label: "Linux (view only)", enabled: false },
    ]);
  });

  it("never falls back across environments", () => {
    expect(
      sourceMatchesEnvironment("story-firefox-linux.png", {
        browser: "firefox",
        platform: "darwin",
      }),
    ).toBe(false);
  });

  it("persists the local Browser × OS preference", () => {
    saveVisualEnvironmentPreference({ browser: "webkit", platform: "linux" });
    expect(loadVisualEnvironmentPreference()).toEqual({
      browser: "webkit",
      platform: "linux",
    });
  });
});
