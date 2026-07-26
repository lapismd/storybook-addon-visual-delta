import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { VISUAL_DEVICE_SCALE_FACTOR, VISUAL_VIEWPORT } from "../constants.js";
import type { BaselinePathMode } from "../node/options.js";
import {
  screenshotRelativePath,
  snapshotFileName,
  type StoryIndexEntry,
} from "../node/snapshot-paths.js";
import { readPlaywrightPassThresholdPercent } from "../node/playwright-threshold.js";
import type {
  VisualDiffSidecar,
  VisualDiffSidecarStatus,
} from "../visual-diff-sidecar.js";
import { compareBaselineToActualPng } from "./compare-pixels.js";

export function baselinePngAbs(
  entry: StoryIndexEntry,
  packageRoot: string,
  snapshotDir: string,
  mode: BaselinePathMode,
  project = "chromium",
  platform: NodeJS.Platform | string = process.platform,
  visualModeName?: string,
): string {
  return path.join(
    packageRoot,
    snapshotDir,
    snapshotFileName(entry, mode, project, platform, visualModeName),
  );
}

function sidecarJsonPath(baselinePngAbsPath: string): string {
  return baselinePngAbsPath.replace(/\.png$/i, ".json");
}

function actualPngPath(baselinePngAbsPath: string): string {
  return baselinePngAbsPath.replace(/\.png$/i, ".actual.png");
}

function diffPngPath(baselinePngAbsPath: string): string {
  return baselinePngAbsPath.replace(/\.png$/i, ".diff.png");
}

/** Path relative to the snapshot root, for `/visual-baselines/<rel>` URLs. */
function snapshotPublicRel(
  absPath: string,
  packageRoot: string,
  snapshotDir: string,
): string {
  return path
    .relative(path.join(packageRoot, snapshotDir), absPath)
    .replace(/\\/g, "/");
}

function writeVisualDiffSidecar(
  filePath: string,
  sidecar: VisualDiffSidecar,
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");
}

function buildSidecarBase(
  entry: StoryIndexEntry,
  mode: BaselinePathMode,
  status: VisualDiffSidecarStatus,
  error?: string,
  visualModeName?: string,
): Omit<
  VisualDiffSidecar,
  | "imageWidth"
  | "imageHeight"
  | "viewport"
  | "deviceScaleFactor"
  | "diffPixels"
  | "totalPixels"
  | "diffPercent"
  | "passThresholdPercent"
  | "passed"
  | "changeBounds"
  | "diffHistogram"
  | "actualRel"
  | "diffRel"
> {
  return {
    version: 1,
    storyId: entry.id,
    title: entry.title,
    snapshotRel: screenshotRelativePath(entry, mode, visualModeName),
    status,
    ...(visualModeName ? { mode: visualModeName } : {}),
    ...(error ? { error } : {}),
    generatedAt: new Date().toISOString(),
    tool: "playwright",
  };
}

/**
 * Write ephemeral `.json` / `.actual.png` / `.diff.png` beside the baseline so
 * the Storybook panel can load a DiffResult after a Playwright compare run.
 */
export function writeDiffArtifactsForBaseline(input: {
  entry: StoryIndexEntry;
  packageRoot: string;
  snapshotDir: string;
  mode: BaselinePathMode;
  baselinePngAbsPath: string;
  status: "passed" | "failed";
  error?: string;
  actualPng: Buffer | null;
  visualModeName?: string;
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
}): void {
  const {
    entry,
    packageRoot,
    snapshotDir,
    mode,
    baselinePngAbsPath,
    status,
    error,
    actualPng,
    visualModeName,
    viewport = VISUAL_VIEWPORT,
    deviceScaleFactor = VISUAL_DEVICE_SCALE_FACTOR,
  } = input;
  const outPath = sidecarJsonPath(baselinePngAbsPath);
  const base = {
    ...buildSidecarBase(entry, mode, status, error, visualModeName),
    viewport,
    deviceScaleFactor,
  };
  if (!actualPng || !existsSync(baselinePngAbsPath)) {
    writeVisualDiffSidecar(outPath, base);
    return;
  }
  try {
    const threshold = readPlaywrightPassThresholdPercent(packageRoot);
    const {
      actualPng: fittedActual,
      diffPng,
      ...metrics
    } = compareBaselineToActualPng(baselinePngAbsPath, actualPng, threshold);
    const actualPath = actualPngPath(baselinePngAbsPath);
    const heatmapPath = diffPngPath(baselinePngAbsPath);
    writeFileSync(actualPath, fittedActual);
    writeFileSync(heatmapPath, diffPng);
    writeVisualDiffSidecar(outPath, {
      ...base,
      ...metrics,
      // Prefer pixel metrics status when compare succeeds.
      status: metrics.passed ? "passed" : "failed",
      actualRel: snapshotPublicRel(actualPath, packageRoot, snapshotDir),
      diffRel: snapshotPublicRel(heatmapPath, packageRoot, snapshotDir),
    });
  } catch {
    writeVisualDiffSidecar(outPath, base);
  }
}
