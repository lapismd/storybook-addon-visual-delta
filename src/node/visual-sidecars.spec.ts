import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  baselinePngExistsForStoryId,
  baselinePngPathForStoryId,
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
