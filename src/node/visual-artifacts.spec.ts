import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  visualArtifactPaths,
  visualArtifactPublicUrl,
} from "./visual-artifacts.js";

describe("visual artifact paths", () => {
  const root = path.resolve("/workspace");
  const snapshotDir = path.join(root, "tests/visual/snapshots");

  it("mirrors the baseline path beneath .visual-delta/artifacts", () => {
    expect(
      visualArtifactPaths({
        root,
        snapshotDir,
        baselinePath: path.join(snapshotDir, "components/button-chromium.png"),
      }),
    ).toMatchObject({
      baselineRelative: "components/button-chromium.png",
      actual: path.join(
        root,
        ".visual-delta/artifacts/components/button-chromium.actual.png",
      ),
      diff: path.join(
        root,
        ".visual-delta/artifacts/components/button-chromium.diff.png",
      ),
      result: path.join(
        root,
        ".visual-delta/artifacts/components/button-chromium.result.json",
      ),
    });
  });

  it("rejects paths outside snapshotDir", () => {
    expect(() =>
      visualArtifactPaths({
        root,
        snapshotDir,
        baselinePath: path.join(root, "other/button.png"),
      }),
    ).toThrow("inside snapshotDir");
  });

  it("builds traversal-safe public URLs", () => {
    expect(visualArtifactPublicUrl("components/button.actual.png")).toBe(
      "/visual-delta-artifacts/components/button.actual.png",
    );
    expect(() => visualArtifactPublicUrl("../button.actual.png")).toThrow(
      "Invalid",
    );
  });
});
