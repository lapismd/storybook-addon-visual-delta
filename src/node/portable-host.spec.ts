import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  attachSidecars,
  managerIndexedVisualRunScope,
  visualBaselineWriteCommandArgs,
  visualTestCommandArgs,
} from "./middleware.js";
import {
  DEFAULT_BASELINE_PATH_MODE,
  DEFAULT_VISUAL_UPDATE_ARGS,
  resolveBaselinePathMode,
} from "./options.js";
import {
  baselinePublicUrl,
  screenshotRelativePath,
  type StoryIndexEntry,
} from "./snapshot-paths.js";
import { CANONICAL_VISUAL_CAPTURE_PROFILE } from "../shared/capture-profile.js";
import { visualArtifactPaths } from "./visual-artifacts.js";

const entry: StoryIndexEntry = {
  id: "workspace-shell-tabs--top-light",
  importPath: "./src/lib/ui/workspace-tabs.stories.ts",
};

describe("portable Visual Delta host options", () => {
  it("defaults to story-id path mode and packaged CLI", () => {
    expect(DEFAULT_BASELINE_PATH_MODE).toBe("story-id");
    expect(resolveBaselinePathMode(undefined)).toBe("story-id");
    expect(resolveBaselinePathMode({ baselinePathMode: "nested-import" })).toBe(
      "nested-import",
    );
    expect(DEFAULT_VISUAL_UPDATE_ARGS).toEqual([
      "exec",
      "visual-delta",
      "update",
      "--allow-dirty",
      "--approved",
    ]);
  });

  it("resolves selected and visible manager scopes from the static index only", () => {
    const root = mkdtempSync(path.join(tmpdir(), "visual-delta-manager-scope-"));
    mkdirSync(path.join(root, "storybook-static"), { recursive: true });
    writeFileSync(
      path.join(root, "storybook-static/index.json"),
      JSON.stringify({
        entries: {
          "card--one": { id: "card--one", type: "story" },
          "card--two": { id: "card--two", type: "story" },
          "card--skipped": {
            id: "card--skipped",
            type: "story",
            tags: ["skip-visual"],
          },
        },
      }),
    );
    try {
      expect(
        managerIndexedVisualRunScope(root, "selected", ["card--two"]),
      ).toMatchObject({
        storyIds: ["card--two"],
        summary: { selected: 1, total: 2 },
      });
      expect(managerIndexedVisualRunScope(root, "all").storyIds).toEqual([
        "card--one",
        "card--two",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("supports flat story-id snapshots", () => {
    expect(screenshotRelativePath(entry, "story-id")).toBe(
      "workspace-shell-tabs--top-light.png",
    );
    expect(baselinePublicUrl(entry, "story-id")).toBe(
      "/visual-baselines/workspace-shell-tabs--top-light-chromium.png",
    );
  });

  it("preserves nested import paths for the UI catalog", () => {
    expect(screenshotRelativePath(entry, "nested-import")).toBe(
      "src/lib/ui/top-light.png",
    );
  });

  it("uses host-provided Playwright arguments", () => {
    expect(
      visualTestCommandArgs(
        {
          visualTestArgs: [
            "exec",
            "playwright",
            "test",
            "-c",
            "playwright.visual.config.ts",
          ],
        },
        "workspace-shell-tabs--top-light$",
      ),
    ).toEqual([
      "exec",
      "playwright",
      "test",
      "-c",
      "playwright.visual.config.ts",
      "--reporter=list",
      "-g",
      "workspace-shell-tabs--top-light$",
    ]);
  });

  it("forwards the host baseline identity to create-only mutations", () => {
    expect(
      visualBaselineWriteCommandArgs(
        {
          snapshotDir: "snapshots",
          baselinePathMode: "nested-import",
        },
        "/workspace",
        {
          createOnly: true,
          rebuild: false,
          browser: "chromium",
          storyIds: ["workspace-shell-tabs--top-light"],
          component: undefined,
        },
      ),
    ).toEqual([
      ...DEFAULT_VISUAL_UPDATE_ARGS,
      "--create-only",
      "--snapshot-dir",
      "/workspace/snapshots",
      "--baseline-path-mode",
      "nested-import",
      "--browser",
      "chromium",
      "--story-id",
      "workspace-shell-tabs--top-light",
    ]);
  });

  it("preserves explicit writer baseline identity overrides", () => {
    const visualUpdateArgs = [
      ...DEFAULT_VISUAL_UPDATE_ARGS,
      "--snapshot-dir",
      "custom-snapshots",
      "--baseline-path-mode",
      "story-id",
    ];
    const args = visualBaselineWriteCommandArgs(
      {
        snapshotDir: "snapshots",
        baselinePathMode: "nested-import",
        visualUpdateArgs,
      },
      "/workspace",
      {
        createOnly: false,
        rebuild: true,
        browser: "firefox",
        storyIds: [],
        component: "Workspace/Shell",
      },
    );

    expect(args).toEqual([
      ...visualUpdateArgs,
      "--rebuild",
      "--browser",
      "firefox",
      "--component",
      "Workspace/Shell",
    ]);
    expect(args.filter((argument) => argument === "--snapshot-dir")).toHaveLength(
      1,
    );
    expect(
      args.filter((argument) => argument === "--baseline-path-mode"),
    ).toHaveLength(1);
  });

  it("forwards the story source formatter to the packaged writer", () => {
    const args = visualBaselineWriteCommandArgs(
      {
        storySourceFormatter: {
          command: "pnpm",
          args: ["exec", "prettier", "--stdin-filepath", "{filePath}"],
        },
      },
      "/workspace",
      {
        createOnly: false,
        rebuild: false,
        browser: "chromium",
        storyIds: ["demo--light"],
        component: undefined,
      },
    );

    expect(args).toContain("--story-source-formatter-command");
    expect(args).toEqual(
      expect.arrayContaining([
        "--story-source-formatter-arg",
        "--stdin-filepath",
        "--story-source-formatter-arg",
        "{filePath}",
      ]),
    );
  });

  it("narrows Playwright with repeatable browser projects", () => {
    expect(
      visualTestCommandArgs({}, undefined, ["firefox", "webkit"]),
    ).toEqual([
      "exec",
      "playwright",
      "test",
      "--reporter=list",
      "--project",
      "firefox",
      "--project",
      "webkit",
    ]);
  });

  it("preserves the runner profile carried by a fresh sidecar", () => {
    const root = mkdtempSync(path.join(tmpdir(), "visual-delta-sidecar-"));
    const snapshotDir = path.join(root, "snapshots");
    const staticDir = path.join(root, "storybook-static");
    const profile = {
      ...CANONICAL_VISUAL_CAPTURE_PROFILE,
      id: "custom-canonical-runner",
    };
    mkdirSync(snapshotDir, { recursive: true });
    mkdirSync(staticDir, { recursive: true });
    writeFileSync(
      path.join(staticDir, "index.json"),
      JSON.stringify({ entries: { [entry.id]: entry } }),
    );
    writeFileSync(
      path.join(snapshotDir, "workspace-shell-tabs--top-light-chromium.png"),
      "baseline",
    );
    const baselinePath = path.join(
      snapshotDir,
      "workspace-shell-tabs--top-light-chromium.png",
    );
    const resultPath = visualArtifactPaths({
      root,
      snapshotDir,
      baselinePath,
    }).result;
    mkdirSync(path.dirname(resultPath), { recursive: true });
    writeFileSync(
      resultPath,
      JSON.stringify({
        version: 4,
        storyId: entry.id,
        snapshotRel: "workspace-shell-tabs--top-light.png",
        status: "passed",
        generatedAt: new Date(0).toISOString(),
        tool: "playwright",
        target: { browser: "chromium" },
        captureProfile: profile,
      }),
    );
    try {
      const [result] = attachSidecars(
        [
          {
            storyId: entry.id,
            title: entry.id,
            status: "passed",
            target: { browser: "chromium" },
          },
        ],
        root,
        { snapshotDir: "snapshots", baselinePathMode: "story-id" },
      );
      expect(result?.captureProfile).toEqual(profile);
      expect(result?.environment?.platform).toBe(profile.os);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("aggregates a failed named mode into the story result", () => {
    const root = mkdtempSync(path.join(tmpdir(), "visual-delta-mode-sidecar-"));
    const snapshotDir = path.join(root, "snapshots");
    mkdirSync(path.join(root, "storybook-static"), { recursive: true });
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(
      path.join(root, "storybook-static/index.json"),
      JSON.stringify({ entries: { [entry.id]: entry } }),
    );
    const primaryBaseline = path.join(
      snapshotDir,
      "workspace-shell-tabs--top-light-chromium.png",
    );
    const modeBaseline = path.join(
      snapshotDir,
      "workspace-shell-tabs--top-light--compact-chromium.png",
    );
    writeFileSync(primaryBaseline, "baseline");
    writeFileSync(modeBaseline, "mode baseline");
    const primaryResult = visualArtifactPaths({
      root,
      snapshotDir,
      baselinePath: primaryBaseline,
    }).result;
    const modeResult = visualArtifactPaths({
      root,
      snapshotDir,
      baselinePath: modeBaseline,
    }).result;
    mkdirSync(path.dirname(primaryResult), { recursive: true });
    writeFileSync(
      primaryResult,
      JSON.stringify({
        version: 4,
        storyId: entry.id,
        snapshotRel: "workspace-shell-tabs--top-light.png",
        status: "passed",
        outcome: "passed",
        policyStatus: "passed",
        passed: true,
        generatedAt: new Date(0).toISOString(),
        tool: "playwright",
        target: { browser: "chromium" },
      }),
    );
    writeFileSync(
      modeResult,
      JSON.stringify({
        version: 4,
        storyId: entry.id,
        mode: "compact",
        variant: { kind: "mode", id: "compact" },
        snapshotRel: "workspace-shell-tabs--top-light--compact.png",
        status: "failed",
        outcome: "mismatch",
        policyStatus: "failed",
        passed: false,
        generatedAt: new Date(0).toISOString(),
        tool: "playwright",
        target: { browser: "chromium" },
      }),
    );
    try {
      const [result] = attachSidecars(
        [
          {
            storyId: entry.id,
            title: entry.id,
            status: "passed",
            target: { browser: "chromium" },
          },
        ],
        root,
        { snapshotDir: "snapshots", baselinePathMode: "story-id" },
      );
      expect(result).toMatchObject({ status: "failed", policyStatus: "failed" });
      expect(result?.modeResults?.find((mode) => mode.mode === "compact")?.status).toBe(
        "failed",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
