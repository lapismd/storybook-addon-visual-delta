import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  it("collects ten strict missing baselines in one Playwright run", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "visual-delta-test-cli-"));
    const snapshotDir = path.join(root, "snapshots");
    mkdirSync(path.join(root, "storybook-static"), { recursive: true });
    mkdirSync(path.join(root, ".visual-delta/cache"), { recursive: true });
    mkdirSync(path.join(root, "src"), { recursive: true });
    const entries: Record<string, {
      id: string;
      type: "story";
      title: string;
      name: string;
      importPath: string;
    }> = {};
    const modules: Array<{ id: string; reasons?: never[] }> = [
      { id: "/virtual:/@storybook/builder-vite/vite-app.js" },
    ];
    for (let index = 0; index < 10; index += 1) {
      const id = `indentation--case-${index}`;
      const importPath = `./src/case-${index}.stories.ts`;
      entries[id] = {
        id,
        type: "story",
        title: "Indentation",
        name: `Case ${index}`,
        importPath,
      };
      modules.push({ id: importPath, reasons: [] });
      writeFileSync(path.join(root, importPath.slice(2)), "export const Case = {};\n");
    }
    writeFileSync(path.join(root, "package.json"), '{"name":"fixture"}\n');
    writeFileSync(path.join(root, "storybook-static/iframe.html"), "iframe");
    writeFileSync(
      path.join(root, "storybook-static/index.json"),
      JSON.stringify({ entries }),
    );
    writeFileSync(
      path.join(root, ".visual-delta/cache/preview-stats.json"),
      JSON.stringify({ modules }),
    );
    const execute = vi.fn(async (_command: string, args: string[]) => {
      if (args.includes("build-storybook")) return { code: 0, results: [] };
      for (const entry of Object.values(entries)) {
        writeDiffArtifactsForBaseline({
          entry,
          packageRoot: root,
          snapshotDir,
          mode: "story-id",
          baselinePngAbsPath: path.join(snapshotDir, `${entry.id}-chromium.png`),
          status: "passed",
          actualPng: png(),
          captureConfig: { align: "viewport" },
          browser: "chromium",
          failureMode: "strict",
          variant: { kind: "primary" },
          captureSet: [
            { variant: { kind: "primary" }, baselineRelative: `${entry.id}-chromium.png` },
          ],
        });
      }
      return {
        code: 0,
        results: Object.keys(entries).map((storyId, index) => ({
          index: index + 1,
          storyId,
          status: "passed" as const,
          browser: "chromium" as const,
          target: { browser: "chromium" as const },
          platform: "linux",
        })),
      };
    });
    try {
      await expect(
        runVisualTestCli({
          root,
          selection: "stories",
          storyIds: Object.keys(entries),
          browsers: ["chromium"],
          failureMode: "strict",
          fresh: true,
          hostOptions: { snapshotDir: "snapshots" },
          runCommand: execute,
        }),
      ).resolves.toBe(1);
      expect(execute).toHaveBeenCalledTimes(2);
      expect(
        Object.values(entries).every((entry) =>
          existsSync(
            visualArtifactPaths({
              root,
              snapshotDir,
              baselinePath: path.join(snapshotDir, `${entry.id}-chromium.png`),
            }).actual,
          ),
        ),
      ).toBe(true);
      const affected = JSON.parse(
        readFileSync(
          path.join(root, ".visual-delta/cache/affected-state-v1.json"),
          "utf8",
        ),
      ) as { passingFingerprints: Record<string, string> };
      expect(affected.passingFingerprints).toEqual({});
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reuses a verified canonical build for repeated fresh captures", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "visual-delta-test-cli-"));
    const cacheRoot = path.join(root, ".visual-delta/cache/canonical-build");
    mkdirSync(path.join(root, "storybook-static"), { recursive: true });
    mkdirSync(path.join(root, ".visual-delta/cache"), { recursive: true });
    mkdirSync(path.join(root, "src"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), '{"name":"fixture"}\n');
    writeFileSync(path.join(root, "src/Card.stories.ts"), "export const Default = {};\n");
    writeFileSync(path.join(root, "storybook-static/iframe.html"), "iframe");
    writeFileSync(
      path.join(root, "storybook-static/index.json"),
      JSON.stringify({
        entries: {
          "card--default": {
            id: "card--default",
            type: "story",
            title: "Card",
            name: "Default",
            importPath: "./src/Card.stories.ts",
          },
        },
      }),
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
    const execute = vi.fn(async (_command: string, args: string[]) => ({
      code: 0,
      results: args.includes("build-storybook")
        ? []
        : [
            {
              index: 1,
              storyId: "card--default",
              status: "passed" as const,
              browser: "chromium" as const,
              target: { browser: "chromium" as const },
              platform: "linux",
            },
          ],
    }));
    vi.stubEnv("VISUAL_DELTA_CANONICAL_BUILD_CACHE", cacheRoot);
    try {
      await expect(
        runVisualTestCli({
          root,
          selection: "stories",
          storyIds: ["card--default"],
          browsers: ["chromium"],
          fresh: true,
          runCommand: execute,
        }),
      ).resolves.toBe(0);
      expect(execute).toHaveBeenCalledTimes(2);
      expect(execute.mock.calls[0]?.[1]).toEqual(["build-storybook"]);

      execute.mockClear();
      await expect(
        runVisualTestCli({
          root,
          selection: "stories",
          storyIds: ["card--default"],
          browsers: ["chromium"],
          fresh: true,
          runCommand: execute,
        }),
      ).resolves.toBe(0);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0]?.[1]).not.toEqual(["build-storybook"]);

      execute.mockClear();
      vi.stubEnv("VISUAL_DELTA_FORCE_REBUILD", "1");
      await runVisualTestCli({
        root,
        selection: "stories",
        storyIds: ["card--default"],
        browsers: ["chromium"],
        fresh: true,
        runCommand: execute,
      });
      expect(execute.mock.calls[0]?.[1]).toEqual(["build-storybook"]);
    } finally {
      vi.unstubAllEnvs();
      rmSync(root, { recursive: true, force: true });
    }
  });

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
      expect(execute).not.toHaveBeenCalled();

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
