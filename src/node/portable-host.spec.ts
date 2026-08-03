import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { attachSidecars, visualTestCommandArgs } from "./middleware.js";
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
      "--skip-build",
    ]);
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
});
