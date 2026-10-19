import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { runVisualTestCli } from "./visual-test-cli.js";

it.each(["all", "affected"] as const)(
  "builds a missing index before resolving %s capture targets",
  async (selection) => {
    const root = mkdtempSync(path.join(tmpdir(), "visual-delta-cold-"));
    mkdirSync(path.join(root, "stories"));
    writeFileSync(path.join(root, "package.json"), '{"name":"cold-fixture"}');
    writeFileSync(
      path.join(root, "stories/Button.stories.ts"),
      "export const Default = {};\n",
    );
    const execute = vi.fn(async (_command: string, args: string[]) => {
      if (!args.includes("build-storybook")) return { code: 9, results: [] };
      mkdirSync(path.join(root, "storybook-static"), { recursive: true });
      mkdirSync(path.join(root, ".visual-delta/cache"), { recursive: true });
      writeFileSync(path.join(root, "storybook-static/iframe.html"), "iframe");
      writeFileSync(
        path.join(root, "storybook-static/index.json"),
        JSON.stringify({
          entries: {
            "button--default": {
              id: "button--default",
              type: "story",
              title: "Button",
              name: "Default",
              importPath: "./stories/Button.stories.ts",
            },
          },
        }),
      );
      writeFileSync(
        path.join(root, ".visual-delta/cache/preview-stats.json"),
        JSON.stringify({
          modules: [{ id: "./stories/Button.stories.ts", reasons: [] }],
        }),
      );
      return { code: 0, results: [] };
    });
    try {
      expect(
        await runVisualTestCli({ root, selection, runCommand: execute }),
      ).toBe(9);
      expect(execute.mock.calls[0]?.[1]).toEqual(["build-storybook"]);
      expect(execute).toHaveBeenCalledTimes(2);
      expect(execute.mock.calls[1]?.[1].join(" ")).toContain("playwright test");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

it("never builds an absent catalog for dry-run planning or an empty exact scope", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "visual-delta-cold-"));
  const execute = vi.fn(async () => ({ code: 0, results: [] }));
  try {
    expect(
      await runVisualTestCli({
        root,
        selection: "all",
        dryRun: true,
        runCommand: execute,
      }),
    ).toBe(0);
    expect(
      await runVisualTestCli({
        root,
        selection: "stories",
        storyIds: [],
        runCommand: execute,
      }),
    ).toBe(1);
    expect(execute).not.toHaveBeenCalled();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
