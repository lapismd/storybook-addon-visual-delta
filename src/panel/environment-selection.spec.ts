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

  it("uses explicit identity only for unqualified demo assets", () => {
    expect(
      sourceMatchesEnvironment(
        "/visual-baselines/examples/card/drift.png",
        { browser: "chromium", platform: "darwin" },
        { browser: "chromium", platform: "darwin" },
      ),
    ).toBe(true);
    expect(
      sourceMatchesEnvironment(
        "/visual-baselines/examples/card/drift.png",
        { browser: "firefox", platform: "darwin" },
        { browser: "chromium", platform: "darwin" },
      ),
    ).toBe(false);
    expect(
      sourceMatchesEnvironment(
        "/visual/story-firefox-linux.png",
        { browser: "chromium", platform: "darwin" },
        { browser: "chromium", platform: "darwin" },
      ),
    ).toBe(false);
  });

  it("keeps canonical filename identity authoritative during discovery", () => {
    const options = discoverVisualEnvironments({
      configuredBrowsers: ["chromium"],
      runtimePlatform: "darwin",
      sources: ["/visual/story-firefox-linux.png"],
      declaredEnvironments: [{ browser: "chromium", platform: "darwin" }],
    });
    expect(options.browsers.map((option) => option.value)).toEqual([
      "chromium",
      "firefox",
    ]);
    expect(options.platforms.map((option) => option.value)).toEqual([
      "darwin",
      "linux",
    ]);
  });

  it("persists the local Browser × OS preference", () => {
    saveVisualEnvironmentPreference({ browser: "webkit", platform: "linux" });
    expect(loadVisualEnvironmentPreference()).toEqual({
      browser: "webkit",
      platform: "linux",
    });
  });
});
