import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import type { StoryIndexEntry } from "../node/snapshot-paths.js";
import { writeDiffArtifactsForBaseline } from "./write-diff-artifacts.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function png(width: number, height: number, rgba = [20, 30, 40, 255]): Buffer {
  const image = new PNG({ width, height });
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index] = rgba[0]!;
    image.data[index + 1] = rgba[1]!;
    image.data[index + 2] = rgba[2]!;
    image.data[index + 3] = rgba[3]!;
  }
  return PNG.sync.write(image);
}

function fixture() {
  const packageRoot = mkdtempSync(path.join(os.tmpdir(), "visual-sidecar-"));
  roots.push(packageRoot);
  const snapshotDir = "snapshots";
  const baselinePngAbsPath = path.join(packageRoot, snapshotDir, "story.png");
  mkdirSync(path.dirname(baselinePngAbsPath), { recursive: true });
  writeFileSync(baselinePngAbsPath, png(2, 2));
  const entry: StoryIndexEntry = {
    id: "example--story",
    title: "Example",
    name: "Story",
    importPath: "./Example.stories.ts",
    type: "story",
  };
  return { packageRoot, snapshotDir, baselinePngAbsPath, entry };
}

describe("writeDiffArtifactsForBaseline", () => {
  it("never turns a runner failure into a pass when fitted pixels match", () => {
    const input = fixture();
    const sidecar = writeDiffArtifactsForBaseline({
      ...input,
      mode: "nested-import",
      status: "failed",
      error: "Expected 2x2, received 3x2",
      actualPng: png(3, 2),
      passThresholdPercent: 100,
    });

    expect(sidecar).toMatchObject({
      version: 2,
      runnerStatus: "failed",
      status: "failed",
      outcome: "mismatch",
      passed: false,
      dimensionMismatch: true,
      capturedWidth: 3,
      capturedHeight: 2,
    });
  });

  it("records a passing runner with changed pixels inside tolerance", () => {
    const input = fixture();
    const sidecar = writeDiffArtifactsForBaseline({
      ...input,
      mode: "nested-import",
      status: "passed",
      actualPng: png(2, 2, [21, 30, 40, 255]),
      passThresholdPercent: 100,
    });

    expect(sidecar.version).toBe(2);
    expect(sidecar.runnerStatus).toBe("passed");
    expect(sidecar.status).toBe("passed");
    expect(["passed", "changed-within-tolerance"]).toContain(sidecar.outcome);
    expect(sidecar.passed).toBe(true);
    expect(sidecar.baselineHash).toHaveLength(64);

    const written = JSON.parse(
      readFileSync(input.baselinePngAbsPath.replace(/\.png$/, ".json"), "utf8"),
    );
    expect(written.operationId).toBeTruthy();
  });
});
