import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
}));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    default: { ...actual, execFileSync: execFileSyncMock },
    execFileSync: execFileSyncMock,
  };
});
vi.mock("./visual-server.js", () => ({
  ensureWarmStaticStorybookServer: vi.fn(async () => ({ ok: true })),
  ensurePlaywrightWebServerPort: vi.fn(async () => undefined),
}));

import { runBaselineUpdate, runInteractionUpdate } from "./baseline-cli.js";

const roots: string[] = [];
const execute = execFileSyncMock;

function fixture(storyIds: string[]): {
  root: string;
  snapshotDir: string;
} {
  const root = mkdtempSync(path.join(tmpdir(), "visual-delta-baseline-cli-"));
  roots.push(root);
  const snapshotDir = path.join(root, "snapshots");
  mkdirSync(path.join(root, "src"), { recursive: true });
  mkdirSync(path.join(root, "storybook-static"), { recursive: true });
  mkdirSync(path.join(root, ".visual-delta/cache"), { recursive: true });
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(path.join(root, "package.json"), '{"name":"fixture"}\n');
  const entries = Object.fromEntries(
    storyIds.map((storyId, index) => {
      const importPath = `./src/story-${index}.stories.ts`;
      writeFileSync(
        path.join(root, importPath.slice(2)),
        `export const Story${index} = {};\n`,
      );
      return [
        storyId,
        {
          id: storyId,
          type: "story",
          title: "Fixture",
          name: `Story ${index}`,
          importPath,
        },
      ];
    }),
  );
  writeFileSync(path.join(root, "storybook-static/iframe.html"), "iframe\n");
  writeFileSync(
    path.join(root, ".visual-delta/cache/preview-stats.json"),
    JSON.stringify({
      modules: Object.values(entries).map((entry) => ({
        id: entry.importPath,
        reasons: [],
      })),
    }),
  );
  writeFileSync(
    path.join(root, "storybook-static/index.json"),
    JSON.stringify({ entries }),
  );
  return { root, snapshotDir };
}

beforeEach(() => {
  execute.mockReset();
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("baseline CLI scoped capture", () => {
  it("returns immediately when every create-only primary baseline exists", async () => {
    const current = fixture(["fixture--one", "fixture--two"]);
    for (const storyId of ["fixture--one", "fixture--two"]) {
      writeFileSync(
        path.join(current.snapshotDir, `${storyId}-chromium.png`),
        "existing",
      );
    }

    await runBaselineUpdate({
      packageRoot: current.root,
      snapshotDir: current.snapshotDir,
      storyIds: ["fixture--one", "fixture--two"],
      approved: true,
      createOnly: true,
    });

    expect(execute).not.toHaveBeenCalled();
  });

  it("captures only missing primary targets in create-only mode", async () => {
    const current = fixture(["fixture--one", "fixture--two"]);
    writeFileSync(
      path.join(current.snapshotDir, "fixture--one-chromium.png"),
      "existing",
    );
    execute.mockImplementation((command, _args) => {
      if (command === "playwright") {
        writeFileSync(
          path.join(current.snapshotDir, "fixture--two-chromium.png"),
          "created",
        );
      }
      return Buffer.from("");
    });

    await runBaselineUpdate({
      packageRoot: current.root,
      snapshotDir: current.snapshotDir,
      storyIds: ["fixture--one", "fixture--two"],
      approved: true,
      createOnly: true,
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const args = execute.mock.calls[0]?.[1] as string[];
    expect(args[args.indexOf("-g") + 1]).toContain("fixture--two");
    expect(args[args.indexOf("-g") + 1]).not.toContain("fixture--one");
  });

  it("preserves review tags unless status mutation is explicitly enabled", async () => {
    const current = fixture(["fixture--one"]);
    const storyPath = path.join(current.root, "src/story-0.stories.ts");
    writeFileSync(
      storyPath,
      'export const One = { tags: ["visual-approved"] };\n',
    );
    execute.mockImplementation((command, _args) => {
      if (command === "playwright") {
        writeFileSync(
          path.join(current.snapshotDir, "fixture--one-chromium.png"),
          "created",
        );
      }
      return Buffer.from("");
    });

    await runBaselineUpdate({
      packageRoot: current.root,
      snapshotDir: current.snapshotDir,
      storyId: "fixture--one",
      approved: true,
    });

    expect(readFileSync(storyPath, "utf8")).toContain('"visual-approved"');
    expect(readFileSync(storyPath, "utf8")).not.toContain('"visual-pending"');

    await runBaselineUpdate({
      packageRoot: current.root,
      snapshotDir: current.snapshotDir,
      storyId: "fixture--one",
      approved: true,
      updateReviewStatus: true,
    });

    expect(readFileSync(storyPath, "utf8")).toContain('"visual-pending"');
    expect(readFileSync(storyPath, "utf8")).not.toContain('"visual-approved"');
  });

  it("returns immediately when a create-only interaction baseline exists", async () => {
    const current = fixture(["fixture--one"]);
    writeFileSync(
      path.join(
        current.snapshotDir,
        "fixture--one--open-menu-chromium.png",
      ),
      "existing",
    );

    await runInteractionUpdate({
      packageRoot: current.root,
      snapshotDir: current.snapshotDir,
      storyId: "fixture--one",
      stepLabel: "Open menu",
      stepId: "open-menu",
      approved: true,
      createOnly: true,
    });

    expect(execute).not.toHaveBeenCalled();
  });
});
