import { describe, expect, it } from "vitest";
import type { VisualDeltaResolvedConfig } from "../shared/config-types.js";
import { configurationSections } from "./ConfigurationPanel.js";

const config: VisualDeltaResolvedConfig = {
  ok: true,
  options: {
    root: "/repo",
    snapshotDir: "/repo/snapshots",
    baselinePathMode: "nested-import",
    visualServerPort: 9010,
    allowRebuild: true,
    visualUpdateArgs: ["visual-delta", "update"],
    visualInteractionUpdateArgs: ["visual-delta", "interaction-update"],
    visualTestArgs: ["playwright", "test"],
    addonSrcDir: null,
  },
  playwrightPassThresholdPercent: 1,
  onboarding: {
    suiteReady: true,
    playwrightConfigReady: true,
    snapshotDirExists: true,
    ready: true,
    hint: "Ready",
  },
  diagnostics: [],
  warnings: [],
};

describe("configurationSections", () => {
  it("groups setup, baseline, capture, and command values", () => {
    const sections = configurationSections(config);
    expect(sections.map((section) => section.title)).toEqual([
      "Setup",
      "Baselines",
      "Capture",
      "Commands",
    ]);
    expect(sections[1]?.rows).toContainEqual({
      label: "Pass threshold",
      value: "1%",
    });
  });
});
