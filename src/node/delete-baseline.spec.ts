import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deleteVisualBaseline } from "./delete-baseline.js";
import { visualArtifactPaths } from "./visual-artifacts.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "visual-delete-"));
  const importPath = "./src/shared/shadcn/demo/Demo.stories.svelte";
  const storyPath = path.join(root, importPath);
  const snapshotDir = path.join(
    root,
    "tests/visual/storybook.spec.ts-snapshots",
  );
  const baselineRelative = "shadcn/demo/default-chromium.png";
  const baselinePath = path.join(snapshotDir, baselineRelative);
  const baselineUrl = `/visual-baselines/${baselineRelative}`;
  mkdirSync(path.dirname(storyPath), { recursive: true });
  mkdirSync(path.dirname(baselinePath), { recursive: true });
  mkdirSync(path.join(root, "storybook-static"), { recursive: true });
  writeFileSync(
    storyPath,
    `<Story
  name="Default"
  tags={["visual-approved", "docs-only"]}
  parameters={{
    visualDelta: {
      images: [${JSON.stringify(baselineUrl)}],
      opacity: 0.5,
    },
  }}
>\n`,
  );
  writeFileSync(
    path.join(root, "storybook-static/index.json"),
    JSON.stringify({
      entries: {
        "shadcn-demo--default": {
          id: "shadcn-demo--default",
          type: "story",
          name: "Default",
          importPath,
          tags: ["visual-approved", "docs-only"],
        },
      },
    }),
  );
  const artifacts = visualArtifactPaths({
    root,
    snapshotDir,
    baselinePath,
  });
  for (const filePath of [baselinePath, artifacts.actual, artifacts.diff, artifacts.result]) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, "fixture");
  }
  return { root, storyPath, baselinePath, baselineUrl, artifacts };
}

describe("deleteVisualBaseline", () => {
  it("removes the exact source reference, PNG, and sidecars without changing review metadata", () => {
    const { root, storyPath, baselinePath, baselineUrl, artifacts } = fixture();
    const result = deleteVisualBaseline(
      root,
      { baselinePathMode: "nested-import" },
      {
        storyId: "shadcn-demo--default",
        baselineUrl,
      },
    );

    expect(result.deletedFiles).toHaveLength(4);
    expect(existsSync(baselinePath)).toBe(false);
    expect(existsSync(artifacts.actual)).toBe(false);
    const source = readFileSync(storyPath, "utf8");
    expect(source).not.toContain(baselineUrl);
    expect(source).toContain("visual-approved");
    expect(source).toContain("docs-only");
    const index = JSON.parse(
      readFileSync(path.join(root, "storybook-static/index.json"), "utf8"),
    ) as { entries: Record<string, { tags?: string[] }> };
    expect(index.entries["shadcn-demo--default"]?.tags).toEqual([
      "visual-approved",
      "docs-only",
    ]);
  });

  it("rejects a screenshot path belonging to another story", () => {
    const { root, baselinePath } = fixture();
    expect(() =>
      deleteVisualBaseline(
        root,
        { baselinePathMode: "nested-import" },
        {
          storyId: "shadcn-demo--default",
          baselineUrl:
            "/visual-baselines/shadcn/demo/another-story-chromium.png",
        },
      ),
    ).toThrow("does not belong to story");
    expect(existsSync(baselinePath)).toBe(true);
  });
});
