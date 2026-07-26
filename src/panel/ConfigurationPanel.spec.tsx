import React from "react";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  VisualDeltaProjectDefaults,
  VisualDeltaResolvedConfig,
} from "../shared/config-types.js";
import {
  ConfigurationPanel,
  configurationSections,
} from "./ConfigurationPanel.js";
import { BUILTIN_VISUAL_DELTA_DEFAULTS } from "../shared/project-defaults.js";
import { renderWithTheme } from "../test/render.js";

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
  projectDefaults: BUILTIN_VISUAL_DELTA_DEFAULTS,
  projectDefaultSources: {
    passThresholdPercent: "built-in",
    diffThreshold: "built-in",
    diffIncludeAntiAliasing: "built-in",
    delay: "built-in",
    cropToViewport: "built-in",
    placement: "built-in",
    opacity: "built-in",
    baselineLabelOffset: "built-in",
    previewSplitZoomDefault: "built-in",
    diffResultZoomDefault: "built-in",
  },
  projectConfigPath: "/repo/.visual-delta/config.json",
  projectConfigExists: false,
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

afterEach(cleanup);

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

describe("ConfigurationPanel", () => {
  it("opens on editable defaults and persists a validated draft", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async (projectDefaults: VisualDeltaProjectDefaults) => ({
      ...config,
      projectDefaults,
      playwrightPassThresholdPercent: projectDefaults.passThresholdPercent,
      projectConfigExists: true,
    }));
    renderWithTheme(
      <ConfigurationPanel
        initialConfig={config}
        onClose={() => {}}
        onSaveProjectDefaults={save}
      />,
    );

    expect(
      screen.getByRole("tab", { name: "Defaults", selected: true }),
    ).toBeVisible();
    expect(screen.getAllByRole("slider")).toHaveLength(6);
    const threshold = screen.getByLabelText("Pass threshold percentage");
    await user.clear(threshold);
    await user.type(threshold, "2.5");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ passThresholdPercent: 2.5 }),
    );
    expect(await screen.findByText(/Project defaults saved/)).toBeVisible();
  });

  it("preserves edits when persistence fails and exposes resolved details", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <ConfigurationPanel
        initialConfig={config}
        onClose={() => {}}
        onSaveProjectDefaults={async () => {
          throw new Error("Disk is read-only");
        }}
      />,
    );
    const opacity = screen.getByLabelText("Overlay opacity");
    await user.clear(opacity);
    await user.type(opacity, "0.7");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Disk is read-only",
    );
    expect(opacity).toHaveValue(0.7);

    await user.click(screen.getByRole("tab", { name: "Resolved" }));
    expect(screen.getByRole("heading", { name: "Baselines" })).toBeVisible();
    expect(screen.getByText("/repo/.visual-delta/config.json")).toBeVisible();
  });
});
