import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { writeDiffArtifactsForBaseline } from "../playwright/write-diff-artifacts.js";
import { recompareCachedActualSet } from "./cached-actual.js";
import { visualArtifactPaths } from "./visual-artifacts.js";

function png(color: [number, number, number, number]): Buffer {
  const image = new PNG({ width: 2, height: 2 });
  for (let index = 0; index < image.data.length; index += 4) {
    image.data.set(color, index);
  }
  return PNG.sync.write(image);
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "visual-cached-actual-"));
  const snapshotDir = path.join(root, "snapshots");
  const baselinePath = path.join(snapshotDir, "example--story-chromium.png");
  const entry = {
    id: "example--story",
    type: "story",
    title: "Example",
    name: "Story",
    importPath: "./Example.stories.ts",
  } as const;
  mkdirSync(snapshotDir, { recursive: true });
  mkdirSync(path.join(root, "storybook-static"), { recursive: true });
  writeFileSync(
    path.join(root, "storybook-static/index.json"),
    JSON.stringify({ entries: { [entry.id]: entry } }),
  );
  writeFileSync(baselinePath, png([0, 0, 0, 255]));
  writeDiffArtifactsForBaseline({
    entry,
    packageRoot: root,
    snapshotDir,
    mode: "story-id",
    baselinePngAbsPath: baselinePath,
    status: "passed",
    actualPng: png([255, 255, 255, 255]),
    passThresholdPercent: 100,
    captureConfig: { align: "viewport", threshold: 100 },
    renderFingerprint: "render-v1",
  });
  return { root, snapshotDir, baselinePath };
}

describe("cached canonical actual comparison", () => {
  it("regenerates result and diff evidence without rewriting the actual", () => {
    const input = fixture();
    const artifacts = visualArtifactPaths({
      root: input.root,
      snapshotDir: input.snapshotDir,
      baselinePath: input.baselinePath,
    });
    const actualBefore = readFileSync(artifacts.actual);
    writeFileSync(input.baselinePath, actualBefore);

    const result = recompareCachedActualSet({
      ...input,
      storyId: "example--story",
      browser: "chromium",
      baselinePathMode: "story-id",
      renderFingerprint: "render-v1",
      failureMode: "strict",
    });

    expect(result).toMatchObject({ source: "cached-actual", passed: true });
    expect(result?.sidecars[0]).toMatchObject({
      version: 4,
      comparisonSource: "cached-actual",
      outcome: "passed",
    });
    expect(readFileSync(artifacts.actual)).toEqual(actualBefore);
  });

  it("misses when render provenance or actual integrity changes", () => {
    const input = fixture();
    expect(
      recompareCachedActualSet({
        ...input,
        storyId: "example--story",
        browser: "chromium",
        baselinePathMode: "story-id",
        renderFingerprint: "render-v2",
        failureMode: "warn",
      }),
    ).toBeNull();

    const actual = visualArtifactPaths({
      root: input.root,
      snapshotDir: input.snapshotDir,
      baselinePath: input.baselinePath,
    }).actual;
    writeFileSync(actual, png([1, 2, 3, 255]));
    expect(
      recompareCachedActualSet({
        ...input,
        storyId: "example--story",
        browser: "chromium",
        baselinePathMode: "story-id",
        renderFingerprint: "render-v1",
        failureMode: "warn",
      }),
    ).toBeNull();
  });

  it("misses when captured image dimensions disagree with provenance", () => {
    const input = fixture();
    const artifacts = visualArtifactPaths({
      root: input.root,
      snapshotDir: input.snapshotDir,
      baselinePath: input.baselinePath,
    });
    const sidecar = JSON.parse(readFileSync(artifacts.result, "utf8")) as {
      capturedWidth: number;
    };
    sidecar.capturedWidth += 1;
    writeFileSync(artifacts.result, `${JSON.stringify(sidecar)}\n`);

    expect(
      recompareCachedActualSet({
        ...input,
        storyId: "example--story",
        browser: "chromium",
        baselinePathMode: "story-id",
        renderFingerprint: "render-v1",
        failureMode: "warn",
      }),
    ).toBeNull();
  });
});
