import React from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
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
import { BUILTIN_VISUAL_DELTA_WORKFLOW } from "../shared/workflow-config.js";
import { renderWithTheme } from "../test/render.js";

const config: VisualDeltaResolvedConfig = {
  ok: true,
  options: {
    root: "/repo",
    snapshotDir: "/repo/snapshots",
    baselinePathMode: "nested-import",
    visualServerPort: 9010,
    allowRebuild: true,
    allowVcsWrites: false,
    visualUpdateArgs: ["visual-delta", "update"],
    visualInteractionUpdateArgs: ["visual-delta", "interaction-update"],
    visualTestArgs: ["playwright", "test"],
    addonSrcDir: null,
  },
  playwrightPassThresholdPercent: 1,
  projectDefaults: BUILTIN_VISUAL_DELTA_DEFAULTS,
  workflow: BUILTIN_VISUAL_DELTA_WORKFLOW,
  vcs: {
    kind: "jj",
    available: true,
    writeAllowed: false,
    reason: "VCS commits are disabled.",
  },
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
  it("groups setup, baseline, capture, workflow, and command values", () => {
    const sections = configurationSections(config);
    expect(sections.map((section) => section.title)).toEqual([
      "Setup",
      "Baselines",
      "Capture",
      "Workflow",
      "Commands",
    ]);
    expect(sections[1]?.rows).toContainEqual({
      label: "Pass threshold",
      value: "1%",
    });
  });
});

describe("ConfigurationPanel", () => {
  it("opens on the current story and saves only changed overrides", async () => {
    const user = userEvent.setup();
    const saveStory = vi.fn(async (update) => ({
      ok: true as const,
      storyId: update.storyId,
      values: update.values ?? {},
      unset: update.unset ?? [],
    }));
    renderWithTheme(
      <ConfigurationPanel
        initialConfig={config}
        story={{
          id: "shadcn-overlays-popover--open-panel",
          name: "Open panel",
          parameters: {
            images: ["/visual-baselines/shadcn/popover/open-panel.png"],
            align: "canvas",
            placement: "right",
          },
        }}
        onClose={() => {}}
        onSaveStoryConfig={saveStory}
      />,
    );

    expect(
      screen.getByRole("tab", { name: "Story", selected: true }),
    ).toBeVisible();
    expect(
      screen.getByText("shadcn-overlays-popover--open-panel"),
    ).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText("Story baseline placement"),
      "center",
    );
    await user.click(screen.getByRole("button", { name: "Save story" }));

    expect(saveStory).toHaveBeenCalledWith({
      storyId: "shadcn-overlays-popover--open-panel",
      values: { placement: "center" },
    });
    expect(await screen.findByText(/Story configuration saved/)).toBeVisible();
  });

  it("flags alignment metadata and repairs only the current story", async () => {
    const user = userEvent.setup();
    const saveStory = vi.fn(async (update) => ({
      ok: true as const,
      storyId: update.storyId,
      values: update.values ?? {},
      unset: update.unset ?? [],
    }));
    renderWithTheme(
      <ConfigurationPanel
        initialConfig={config}
        story={{
          id: "shadcn-overlays-popover--open-panel",
          name: "Open panel",
          parameters: {
            images: ["/visual-baselines/shadcn/popover/open-panel.png"],
            align: "canvas",
          },
          alignmentMismatch: {
            configured: "canvas",
            recommended: "viewport",
            baselineCss: { width: 1280, height: 900 },
            liveCss: { width: 1232, height: 146 },
            captureViewport: { width: 1280, height: 900 },
            reason: "viewport-sized-baseline",
          },
        }}
        onClose={() => {}}
        onSaveStoryConfig={saveStory}
      />,
    );

    expect(
      screen.getByRole("alert", {
        name: "Story alignment configuration mismatch",
      }),
    ).toHaveTextContent("viewport-sized");
    await user.click(
      screen.getByRole("button", { name: "Use viewport alignment" }),
    );

    expect(saveStory).toHaveBeenCalledWith({
      storyId: "shadcn-overlays-popover--open-panel",
      values: { align: "viewport" },
    });
    expect(
      await screen.findByText("Story alignment updated to viewport."),
    ).toBeVisible();
    expect(
      screen.queryByRole("alert", {
        name: "Story alignment configuration mismatch",
      }),
    ).not.toBeInTheDocument();
  });

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

  it("edits opt-in live approval and VCS workflow independently from capture defaults", async () => {
    const user = userEvent.setup();
    const saveWorkflow = vi.fn(async (workflow) => ({
      ...config,
      workflow,
      projectConfigExists: true,
    }));
    renderWithTheme(
      <ConfigurationPanel
        initialConfig={config}
        onClose={() => {}}
        onSaveWorkflow={saveWorkflow}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Workflow" }));
    await user.click(
      screen.getByLabelText(
        "Automatically accept passing Diff Chromium, Story, and Run Diff",
      ),
    );
    await user.selectOptions(
      screen.getByLabelText("Visual Delta VCS workflow mode"),
      "review",
    );
    const template = screen.getByLabelText(
      "Visual Delta commit message template",
    );
    fireEvent.change(template, {
      target: { value: "Visual review: {scope}" },
    });
    await user.click(screen.getByRole("button", { name: "Save workflow" }));

    expect(saveWorkflow).toHaveBeenCalledWith({
      autoAcceptLiveStoryComparisons: true,
      vcs: {
        mode: "review",
        commitMessageTemplate: "Visual review: {scope}",
      },
    });
    expect(
      await screen.findByText(
        /policy change remains available for manual review/i,
      ),
    ).toBeVisible();
  });
});
