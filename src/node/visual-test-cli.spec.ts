import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runVisualTestCli } from "./visual-test-cli.js";
import { PNG } from "pngjs";
import { visualRenderFingerprints } from "./affected-visual-tests.js";
import { writeDiffArtifactsForBaseline } from "../playwright/write-diff-artifacts.js";
import { visualArtifactPaths } from "./visual-artifacts.js";

function png(): Buffer {
  return PNG.sync.write(new PNG({ width: 2, height: 2 }));
}

describe("runVisualTestCli exact stories", () => {
  it("rebuilds static Storybook and keeps the worker selection exact", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "visual-delta-test-cli-"));
    const staticRoot = path.join(root, "storybook-static");
    mkdirSync(staticRoot, { recursive: true });
    writeFileSync(path.join(staticRoot, "iframe.html"), "<!doctype html>");
    writeFileSync(
      path.join(staticRoot, "index.json"),
      JSON.stringify({
        entries: {
          "examples-card--responsive": {
            id: "examples-card--responsive",
            type: "story",
            title: "Examples/Card",
            name: "Responsive",
            importPath: "./src/card.stories.ts",
          },
          "examples-card--fixed": {
            id: "examples-card--fixed",
            type: "story",
            title: "Examples/Card",
            name: "Fixed",
            importPath: "./src/card.stories.ts",
          },
        },
      }),
    );
    const execute = vi.fn(async (
      _command: string,
      args: string[],
      _cwd: string,
      _env?: NodeJS.ProcessEnv,
    ) => ({
      code: 0,
      results: [],
      args,
    }));
    try {
      await expect(
        runVisualTestCli({
          root,
          selection: "stories",
          storyIds: ["examples-card--responsive"],
          browsers: ["chromium"],
          baselineRelativePath: "teaching/responsive.png",
          hostOptions: {
            snapshotDir: "snapshots",
            baselinePathMode: "nested-import",
          },
          interaction: {
            storyId: "examples-card--responsive",
            stepId: "open-menu",
          },
          runCommand: execute,
        }),
      ).resolves.toBe(0);
      expect(execute).toHaveBeenCalledTimes(2);
      expect(execute.mock.calls[0]?.[1]).toEqual(["build-storybook"]);
      const playwrightArgs = execute.mock.calls[1]?.[1] ?? [];
      expect(playwrightArgs).toContain("--reporter=list");
      expect(playwrightArgs).toContain("--project");
      const grepIndex = playwrightArgs.indexOf("-g");
      expect(grepIndex).toBeGreaterThan(-1);
      expect(playwrightArgs[grepIndex + 1]).toMatch("examples-card--responsive");
      expect(playwrightArgs[grepIndex + 1]).not.toMatch("examples-card--fixed");
      const env = execute.mock.calls[1]?.[3];
      expect(env).toMatchObject({
        PLAYWRIGHT_UPDATE_SNAPSHOTS: "0",
        VISUAL_DELTA_SNAPSHOT_DIR: path.join(root, "snapshots"),
        VISUAL_DELTA_BASELINE_PATH_MODE: "nested-import",
        VISUAL_DELTA_BASELINE_OVERRIDE: "teaching/responsive.png",
        PLAYWRIGHT_INTERACTION_CAPTURE: JSON.stringify({
          storyId: "examples-card--responsive",
          stepId: "open-menu",
        }),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects an exact story outside the runnable static index", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "visual-delta-test-cli-"));
    const staticRoot = path.join(root, "storybook-static");
    mkdirSync(staticRoot, { recursive: true });
    writeFileSync(path.join(staticRoot, "iframe.html"), "<!doctype html>");
    writeFileSync(path.join(staticRoot, "index.json"), JSON.stringify({ entries: {} }));
    const execute = vi.fn(async () => ({ code: 0, results: [] }));
    try {
      await expect(
        runVisualTestCli({
          root,
          selection: "stories",
          storyIds: ["missing--story"],
          runCommand: execute,
        }),
      ).resolves.toBe(1);
      expect(execute).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reuses a complete fresh actual set unless --fresh is requested", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "visual-delta-test-cli-"));
    const entry = {
      id: "examples-card--responsive",
      type: "story" as const,
      title: "Examples/Card",
      name: "Responsive",
      importPath: "./src/Card.stories.ts",
    };
    const snapshotDir = path.join(root, "snapshots");
    const baselinePath = path.join(
      snapshotDir,
      "examples-card--responsive-chromium.png",
    );
    mkdirSync(path.join(root, "storybook-static"), { recursive: true });
    mkdirSync(path.join(root, ".visual-delta/cache"), { recursive: true });
    mkdirSync(path.join(root, "src"), { recursive: true });
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(path.join(root, "package.json"), '{"name":"fixture"}\n');
    writeFileSync(path.join(root, "src/Card.stories.ts"), "export const Responsive = {};\n");
    writeFileSync(
      path.join(root, "storybook-static/index.json"),
      JSON.stringify({ entries: { [entry.id]: entry } }),
    );
    writeFileSync(
      path.join(root, ".visual-delta/cache/preview-stats.json"),
      JSON.stringify({
        modules: [
          { id: "/virtual:/@storybook/builder-vite/vite-app.js" },
          { id: "./src/Card.stories.ts", reasons: [] },
        ],
      }),
    );
    writeFileSync(baselinePath, png());
    const hostOptions = {
      snapshotDir: "snapshots",
      baselinePathMode: "story-id" as const,
      affectedTests: {},
    };
    const fingerprint = visualRenderFingerprints(root, hostOptions)[entry.id];
    expect(fingerprint).toBeTruthy();
    writeDiffArtifactsForBaseline({
      entry,
      packageRoot: root,
      snapshotDir,
      mode: "story-id",
      baselinePngAbsPath: baselinePath,
      status: "passed",
      actualPng: png(),
      captureConfig: { align: "viewport" },
      renderFingerprint: fingerprint,
    });
    const execute = vi.fn(async () => ({ code: 0, results: [] }));
    try {
      await expect(
        runVisualTestCli({
          root,
          selection: "stories",
          storyIds: [entry.id],
          browsers: ["chromium"],
          hostOptions,
          runCommand: execute,
        }),
      ).resolves.toBe(0);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0]?.[1]).toEqual(["build-storybook"]);

      const actualPath = visualArtifactPaths({
        root,
        snapshotDir,
        baselinePath,
      }).actual;
      rmSync(actualPath);
      execute.mockClear();
      await expect(
        runVisualTestCli({
          root,
          selection: "stories",
          storyIds: [entry.id],
          browsers: ["chromium"],
          hostOptions,
          runCommand: execute,
        }),
      ).resolves.toBe(0);
      expect(execute).toHaveBeenCalledTimes(2);

      writeFileSync(actualPath, png());
      execute.mockClear();
      await expect(
        runVisualTestCli({
          root,
          selection: "stories",
          storyIds: [entry.id],
          browsers: ["chromium"],
          hostOptions,
          fresh: true,
          runCommand: execute,
        }),
      ).resolves.toBe(0);
      expect(execute).toHaveBeenCalledTimes(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
