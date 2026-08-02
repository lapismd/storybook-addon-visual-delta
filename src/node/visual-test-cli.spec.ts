import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runVisualTestCli } from "./visual-test-cli.js";

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
});
