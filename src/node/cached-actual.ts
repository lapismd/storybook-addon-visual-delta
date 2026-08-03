import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { PNG } from "pngjs";
import { CANONICAL_VISUAL_CAPTURE_PROFILE } from "../shared/capture-profile.js";
import type { VisualDeltaBrowser } from "../shared/environments.js";
import type { VisualTestFailureMode } from "../shared/failure-mode.js";
import {
  isVisualDiffSidecar,
  type VisualDiffSidecar,
  type VisualDiffVariant,
} from "../visual-diff-sidecar.js";
import { writeDiffArtifactsForBaseline } from "../playwright/write-diff-artifacts.js";
import type { BaselinePathMode } from "./options.js";
import { loadStoryIndex } from "./visual-sidecars.js";
import { visualArtifactPaths } from "./visual-artifacts.js";

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readResult(filePath: string): VisualDiffSidecar | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return isVisualDiffSidecar(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sameVariant(left: VisualDiffVariant | undefined, right: VisualDiffVariant): boolean {
  return Boolean(
    left &&
      left.kind === right.kind &&
      (left.kind === "primary" || left.id === (right as { id: string }).id),
  );
}

function captureSetContainsSeed(
  sidecar: VisualDiffSidecar,
  baselineRelative: string,
): boolean {
  return Boolean(
    sidecar.variant &&
      sidecar.captureSet?.some(
        (member) =>
          member.baselineRelative === baselineRelative &&
          sameVariant(sidecar.variant, member.variant),
      ),
  );
}

export type CachedActualComparison = {
  source: "cached-actual";
  sidecars: VisualDiffSidecar[];
  passed: boolean;
};

/**
 * Recompare one complete canonical capture set without launching a browser.
 * Any incomplete or stale field makes this a cache miss; callers then run the
 * normal capture worker.
 */
export function recompareCachedActualSet(options: {
  root: string;
  snapshotDir: string;
  baselinePath: string;
  storyId: string;
  browser: VisualDeltaBrowser;
  baselinePathMode: BaselinePathMode;
  renderFingerprint: string;
  failureMode: VisualTestFailureMode;
}): CachedActualComparison | null {
  const snapshotRoot = path.resolve(options.snapshotDir);
  const seedPaths = visualArtifactPaths({
    root: options.root,
    snapshotDir: snapshotRoot,
    baselinePath: options.baselinePath,
  });
  const seed = readResult(seedPaths.result);
  if (
    !seed ||
    seed.version !== 4 ||
    seed.storyId !== options.storyId ||
    (seed.target?.browser ?? seed.browser) !== options.browser ||
    !seed.captureProfile ||
    !isDeepStrictEqual(seed.captureProfile, CANONICAL_VISUAL_CAPTURE_PROFILE) ||
    seed.viewport?.width !== CANONICAL_VISUAL_CAPTURE_PROFILE.viewport.width ||
    seed.viewport?.height !== CANONICAL_VISUAL_CAPTURE_PROFILE.viewport.height ||
    seed.deviceScaleFactor !== CANONICAL_VISUAL_CAPTURE_PROFILE.deviceScaleFactor ||
    seed.renderFingerprint !== options.renderFingerprint ||
    !seed.captureOperationId ||
    !seed.actualCapturedAt ||
    !seed.captureConfigHash ||
    !seed.captureSet?.length ||
    !captureSetContainsSeed(seed, seedPaths.baselineRelative)
  ) {
    return null;
  }

  const entry = loadStoryIndex(options.root)[options.storyId];
  if (!entry) return null;
  const candidates: Array<{
    baselinePath: string;
    actual: Buffer;
    result: VisualDiffSidecar;
  }> = [];
  for (const member of seed.captureSet) {
    const baselinePath = path.resolve(
      snapshotRoot,
      ...member.baselineRelative.split("/"),
    );
    const relative = path.relative(snapshotRoot, baselinePath);
    if (
      !relative ||
      path.isAbsolute(relative) ||
      relative.split(path.sep).includes("..") ||
      !existsSync(baselinePath)
    ) {
      return null;
    }
    const artifacts = visualArtifactPaths({
      root: options.root,
      snapshotDir: snapshotRoot,
      baselinePath,
    });
    const result = readResult(artifacts.result);
    if (
      !result ||
      result.version !== 4 ||
      result.storyId !== options.storyId ||
      !sameVariant(result.variant, member.variant) ||
      (result.target?.browser ?? result.browser) !== options.browser ||
      result.renderFingerprint !== options.renderFingerprint ||
      result.captureOperationId !== seed.captureOperationId ||
      !result.actualCapturedAt ||
      !result.captureConfigHash ||
      !isDeepStrictEqual(result.captureSet, seed.captureSet) ||
      !isDeepStrictEqual(result.captureProfile, CANONICAL_VISUAL_CAPTURE_PROFILE) ||
      result.viewport?.width !== CANONICAL_VISUAL_CAPTURE_PROFILE.viewport.width ||
      result.viewport?.height !== CANONICAL_VISUAL_CAPTURE_PROFILE.viewport.height ||
      result.deviceScaleFactor !== CANONICAL_VISUAL_CAPTURE_PROFILE.deviceScaleFactor ||
      !result.actualHash ||
      result.actualRel !== artifacts.actualRelative ||
      !existsSync(artifacts.actual)
    ) {
      return null;
    }
    const actual = readFileSync(artifacts.actual);
    if (sha256(actual) !== result.actualHash) return null;
    try {
      const decoded = PNG.sync.read(actual);
      if (
        decoded.width <= 0 ||
        decoded.height <= 0 ||
        result.capturedWidth !== decoded.width ||
        result.capturedHeight !== decoded.height
      ) {
        return null;
      }
    } catch {
      return null;
    }
    candidates.push({ baselinePath, actual, result });
  }

  const sidecars = candidates.map(({ baselinePath, actual, result }) =>
    writeDiffArtifactsForBaseline({
      entry,
      packageRoot: options.root,
      snapshotDir: snapshotRoot,
      mode: options.baselinePathMode,
      baselinePngAbsPath: baselinePath,
      status: "passed",
      actualPng: actual,
      visualModeName: result.mode,
      viewport: result.viewport,
      deviceScaleFactor: result.deviceScaleFactor,
      passThresholdPercent: result.passThresholdPercent,
      captureConfigHash: result.captureConfigHash,
      browser: options.browser,
      failureMode: options.failureMode,
      variant: result.variant,
      captureSet: seed.captureSet,
      renderFingerprint: options.renderFingerprint,
      comparisonSource: "cached-actual",
      captureOperationId: seed.captureOperationId,
      actualCapturedAt: result.actualCapturedAt,
    }),
  );
  return {
    source: "cached-actual",
    sidecars,
    passed: sidecars.every((sidecar) => sidecar.policyStatus !== "failed"),
  };
}
