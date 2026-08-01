import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyVisualBaselineMigration,
  planVisualBaselineMigration,
} from "./baseline-migration.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "visual-delta-migration-"));
  const snapshots = path.join(root, "snapshots");
  mkdirSync(snapshots, { recursive: true });
  return { root, snapshots };
}

describe("baseline migration", () => {
  it("requires ARM64 canonical recapture instead of promoting legacy PNGs", () => {
    const { root, snapshots } = fixture();
    writeFileSync(path.join(snapshots, "story-chromium-darwin.png"), "legacy");
    const plan = planVisualBaselineMigration({
      root,
      snapshotDirs: [snapshots],
    });
    expect(plan.canApply).toBe(false);
    expect(plan.items[0]).toMatchObject({
      canonicalPath: path.join(snapshots, "story-chromium.png"),
      status: "recapture-required",
    });
  });

  it("rewrites sources and removes legacy artifacts only after approval", () => {
    const { root, snapshots } = fixture();
    const legacy = path.join(snapshots, "story-chromium-linux.png");
    writeFileSync(legacy, "legacy");
    writeFileSync(path.join(snapshots, "story-chromium.png"), "canonical");
    writeFileSync(path.join(snapshots, "story-chromium.json"), "{}");
    writeFileSync(
      path.join(root, "Story.stories.ts"),
      'const src = "/visual-baselines/story-chromium-linux.png";\n',
    );
    const cacheDir = path.join(root, ".cache", "visual-delta");
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(path.join(cacheDir, "affected-state-v1.json"), "{}");
    const plan = planVisualBaselineMigration({
      root,
      snapshotDirs: [snapshots],
    });
    expect(() =>
      applyVisualBaselineMigration(plan, { approved: false }),
    ).toThrow(/--approved/);
    const result = applyVisualBaselineMigration(plan, { approved: true });
    expect(result.removed).toContain("snapshots/story-chromium-linux.png");
    expect(result.removed).toContain("snapshots/story-chromium.json");
    expect(result.updatedSources).toContain("Story.stories.ts");
    expect(result.invalidatedCaches).toEqual([".cache/visual-delta"]);
    expect(existsSync(cacheDir)).toBe(false);
  });
});
