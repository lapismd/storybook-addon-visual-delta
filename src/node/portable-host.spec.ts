import { describe, expect, it } from "vitest";
import { visualTestCommandArgs } from "./middleware.js";
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
      "/visual-baselines/workspace-shell-tabs--top-light-chromium-darwin.png",
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
});
