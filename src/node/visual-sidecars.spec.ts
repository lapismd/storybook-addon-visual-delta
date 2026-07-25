import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  baselinePngExistsForStoryId,
  baselinePngPathForStoryId,
  syncStaticIndexSkipVisual,
} from "./visual-sidecars.js";

describe("baselinePngExistsForStoryId", () => {
  it("resolves nested-import paths and reports existence", () => {
    const root = mkdtempSync(path.join(tmpdir(), "vd-baseline-"));
    const snapshotDir = path.join(root, "snaps");
    mkdirSync(path.join(root, "storybook-static"), { recursive: true });
    mkdirSync(path.join(snapshotDir, "shadcn/button"), { recursive: true });
    writeFileSync(
      path.join(root, "storybook-static", "index.json"),
      JSON.stringify({
        entries: {
          "shadcn-button--default": {
            id: "shadcn-button--default",
            type: "story",
            name: "Default",
            importPath: "./src/shared/shadcn/button/Button.stories.svelte",
          },
        },
      }),
    );

    const png = baselinePngPathForStoryId(
      "shadcn-button--default",
      root,
      snapshotDir,
      "nested-import",
    );
    expect(png).toBe(
      path.join(snapshotDir, "shadcn/button/default-chromium-darwin.png"),
    );
    expect(
      baselinePngExistsForStoryId(
        "shadcn-button--default",
        root,
        snapshotDir,
        "nested-import",
      ),
    ).toBe(false);

    writeFileSync(png!, "png");
    expect(
      baselinePngExistsForStoryId(
        "shadcn-button--default",
        root,
        snapshotDir,
        "nested-import",
      ),
    ).toBe(true);
  });
});

describe("syncStaticIndexSkipVisual", () => {
  it("removes skip-visual from matching index entries", () => {
    const root = mkdtempSync(path.join(tmpdir(), "vd-index-"));
    mkdirSync(path.join(root, "storybook-static"), { recursive: true });
    const indexPath = path.join(root, "storybook-static", "index.json");
    writeFileSync(
      indexPath,
      JSON.stringify({
        entries: {
          "forms-input--error": {
            id: "forms-input--error",
            type: "story",
            tags: ["dev", "skip-visual", "test"],
          },
          "forms-input--default": {
            id: "forms-input--default",
            type: "story",
            tags: ["dev", "test"],
          },
        },
      }),
    );

    const result = syncStaticIndexSkipVisual(
      root,
      ["forms-input--error", "forms-input--default"],
      false,
    );
    expect(result.updated).toEqual(["forms-input--error"]);
    const parsed = JSON.parse(readFileSync(indexPath, "utf8")) as {
      entries: Record<string, { tags?: string[] }>;
    };
    expect(parsed.entries["forms-input--error"]?.tags).toEqual(["dev", "test"]);
    expect(parsed.entries["forms-input--default"]?.tags).toEqual([
      "dev",
      "test",
    ]);
  });
});
