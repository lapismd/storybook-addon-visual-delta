import { afterEach, describe, expect, it } from "vitest";
import {
  clearSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  SETTINGS_STORAGE_KEY,
} from "./settings.js";

describe("visual delta settings", () => {
  afterEach(() => {
    clearSettings();
  });

  it("returns defaults when storage is empty", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings().passThresholdByEngine).toEqual({
      html: 1.5,
      chromium: 1.5,
    });
  });

  it("round-trips saved settings and normalizes placement", () => {
    saveSettings({
      ...DEFAULT_SETTINGS,
      placement: "beside" as never,
      opacity: 0.4,
      liveVisible: false,
      passThresholdByEngine: { html: 1.5, chromium: 0.25 },
    });
    expect(loadSettings()).toMatchObject({
      placement: "right",
      opacity: 0.4,
      liveVisible: false,
      passThresholdByEngine: { html: 1.5, chromium: 0.25 },
    });
  });

  it("migrates legacy passThresholdPercent to both engines", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        placement: "center",
        opacity: 0.5,
        passThresholdPercent: 1.25,
      }),
    );
    expect(loadSettings().passThresholdByEngine).toEqual({
      html: 1.25,
      chromium: 1.25,
    });
  });

  it("falls back on corrupt JSON", () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, "{not-json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps invalid opacity using placement defaults", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ placement: "center", opacity: 99 }),
    );
    expect(loadSettings().opacity).toBe(0.5);
  });
});
