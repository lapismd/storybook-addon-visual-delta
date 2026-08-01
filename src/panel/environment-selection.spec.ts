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
        "/visual/story-chromium.png",
        "/visual/story-webkit.png",
      ],
    });
    expect(options.browsers).toEqual([
      { value: "chromium", label: "Chromium", enabled: true },
      { value: "firefox", label: "Firefox", enabled: true },
      { value: "webkit", label: "WebKit (view only)", enabled: false },
    ]);
    expect(options.platforms).toEqual([
      { value: "linux", label: "Linux · ARM64", enabled: true },
    ]);
  });

  it("keeps project-wide environments available without current-story wiring", () => {
    const options = discoverVisualEnvironments({
      configuredBrowsers: ["chromium"],
      runtimePlatform: "darwin",
      availableEnvironments: [
        { browser: "chromium", platform: "darwin" },
        { browser: "webkit", platform: "linux" },
      ],
      sources: [],
    });

    expect(options.browsers).toEqual([
      { value: "chromium", label: "Chromium", enabled: true },
      { value: "webkit", label: "WebKit (view only)", enabled: false },
    ]);
    expect(options.platforms).toEqual([
      { value: "linux", label: "Linux · ARM64", enabled: true },
    ]);
  });

  it("does not fall back across browsers", () => {
    expect(
      sourceMatchesEnvironment("story-firefox.png", {
        browser: "firefox",
        platform: "darwin",
      }),
    ).toBe(true);
    expect(
      sourceMatchesEnvironment("story-firefox.png", {
        browser: "chromium",
        platform: "linux",
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
        "/visual/story-firefox.png",
        { browser: "chromium", platform: "darwin" },
        { browser: "chromium", platform: "darwin" },
      ),
    ).toBe(false);
  });

  it("keeps canonical filename identity authoritative during discovery", () => {
    const options = discoverVisualEnvironments({
      configuredBrowsers: ["chromium"],
      runtimePlatform: "darwin",
      sources: ["/visual/story-firefox.png"],
      declaredEnvironments: [{ browser: "chromium", platform: "darwin" }],
    });
    expect(options.browsers.map((option) => option.value)).toEqual([
      "chromium",
      "firefox",
    ]);
    expect(options.platforms.map((option) => option.value)).toEqual(["linux"]);
  });

  it("persists the local browser preference with deprecated platform data", () => {
    saveVisualEnvironmentPreference({ browser: "webkit", platform: "linux" });
    expect(loadVisualEnvironmentPreference()).toEqual({
      browser: "webkit",
      platform: "linux",
    });
  });
});
