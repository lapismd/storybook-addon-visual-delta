import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  VisualComparisonOutcome,
  VisualDiffSidecar,
  VisualDiffSidecarStatus,
} from "../visual-diff-sidecar.js";
import { compareBaselineToActualPng } from "./compare-pixels.js";
import type { VisualDeltaBrowser } from "../shared/environments.js";
import { CANONICAL_VISUAL_CAPTURE_PROFILE } from "../shared/capture-profile.js";
import {
  isWarningComparisonOutcome,
  type VisualTestFailureMode,
} from "../shared/failure-mode.js";

export function baselinePngAbs(
  entry: StoryIndexEntry,
  packageRoot: string,
  snapshotDir: string,
  mode: BaselinePathMode,
  project = "chromium",
  visualModeName?: string,
): string {
  const snapshotRoot = path.isAbsolute(snapshotDir)
    ? snapshotDir
    : path.join(packageRoot, snapshotDir);
  return path.join(
    snapshotRoot,
    snapshotFileName(entry, mode, project, visualModeName),
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
  const snapshotRoot = path.isAbsolute(snapshotDir)
    ? snapshotDir
    : path.join(packageRoot, snapshotDir);
  return path.relative(snapshotRoot, absPath).replace(/\\/g, "/");
}

export function writeVisualDiffSidecar(
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
  target?: { browser: VisualDeltaBrowser },
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
    version: 3,
    storyId: entry.id,
    title: entry.title,
    snapshotRel: screenshotRelativePath(entry, mode, visualModeName),
    status,
    runnerStatus: status,
    ...(target ? { browser: target.browser, target } : {}),
    captureProfile: CANONICAL_VISUAL_CAPTURE_PROFILE,
    platform: CANONICAL_VISUAL_CAPTURE_PROFILE.os,
    ...(visualModeName ? { mode: visualModeName } : {}),
    ...(error ? { error } : {}),
    generatedAt: new Date().toISOString(),
    tool: "playwright",
    operationId: randomUUID(),
  };
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function visualCaptureConfigHash(value: unknown): string {
  return sha256(stableJson(value));
}

function comparisonOutcome(options: {
  runnerStatus: VisualDiffSidecarStatus;
  metricsPassed?: boolean;
  changed?: boolean;
  dimensionMismatch?: boolean;
  baselineExists: boolean;
  actualExists: boolean;
}): VisualComparisonOutcome {
  if (options.runnerStatus === "skipped") return "skipped";
  if (!options.baselineExists) return "missing-baseline";
  if (options.runnerStatus === "timedOut") return "error";
  if (!options.actualExists) return "error";
  if (options.dimensionMismatch || options.metricsPassed === false) {
    return "mismatch";
  }
  if (options.runnerStatus === "failed") {
    return options.changed ? "mismatch" : "error";
  }
  return options.changed ? "changed-within-tolerance" : "passed";
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
  passThresholdPercent?: number;
  diffThreshold?: number;
  includeAntiAliasing?: boolean;
  captureConfig?: unknown;
  operationId?: string;
  browser?: VisualDeltaBrowser;
  failureMode?: VisualTestFailureMode;
}): VisualDiffSidecar {
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
    passThresholdPercent,
    diffThreshold,
    includeAntiAliasing,
    captureConfig,
    operationId,
    browser = "chromium",
    failureMode = "warn",
  } = input;
  const outPath = sidecarJsonPath(baselinePngAbsPath);
  const base = {
    ...buildSidecarBase(entry, mode, status, error, visualModeName, {
      browser,
    }),
    viewport,
    deviceScaleFactor,
    ...(operationId ? { operationId } : {}),
    ...(captureConfig
      ? { captureConfigHash: visualCaptureConfigHash(captureConfig) }
      : {}),
  };
  const baselineExists = existsSync(baselinePngAbsPath);
  if (!actualPng || !baselineExists) {
    const outcome = comparisonOutcome({
      runnerStatus: status,
      baselineExists,
      actualExists: Boolean(actualPng),
    });
    const actualPath = actualPngPath(baselinePngAbsPath);
    if (actualPng) {
      mkdirSync(path.dirname(actualPath), { recursive: true });
      writeFileSync(actualPath, actualPng);
    }
    const sidecar: VisualDiffSidecar = {
      ...base,
      status: "failed",
      outcome,
      policyStatus:
        failureMode === "warn" && isWarningComparisonOutcome(outcome)
          ? "warning"
          : "failed",
      passed: false,
      ...(actualPng
        ? { actualRel: snapshotPublicRel(actualPath, packageRoot, snapshotDir) }
        : {}),
    };
    writeVisualDiffSidecar(outPath, sidecar);
    return sidecar;
  }
  try {
    const threshold =
      passThresholdPercent ?? readPlaywrightPassThresholdPercent(packageRoot);
    const {
      actualPng: fittedActual,
      diffPng,
      ...metrics
    } = compareBaselineToActualPng(baselinePngAbsPath, actualPng, {
      passThresholdPercent: threshold,
      diffThreshold,
      includeAntiAliasing,
    });
    const actualPath = actualPngPath(baselinePngAbsPath);
    const heatmapPath = diffPngPath(baselinePngAbsPath);
    writeFileSync(actualPath, fittedActual);
    writeFileSync(heatmapPath, diffPng);
    const outcome = comparisonOutcome({
      runnerStatus: status,
      metricsPassed: metrics.passed,
      changed: metrics.diffPixels > 0,
      dimensionMismatch: metrics.dimensionMismatch,
      baselineExists: true,
      actualExists: true,
    });
    const passed =
      status === "passed" &&
      (outcome === "passed" || outcome === "changed-within-tolerance");
    const sidecar: VisualDiffSidecar = {
      ...base,
      ...metrics,
      status: passed ? "passed" : "failed",
      outcome,
      policyStatus: passed
        ? "passed"
        : failureMode === "warn" && isWarningComparisonOutcome(outcome)
          ? "warning"
          : "failed",
      passed,
      baselineHash: sha256(readFileSync(baselinePngAbsPath)),
      actualRel: snapshotPublicRel(actualPath, packageRoot, snapshotDir),
      diffRel: snapshotPublicRel(heatmapPath, packageRoot, snapshotDir),
    };
    writeVisualDiffSidecar(outPath, sidecar);
    return sidecar;
  } catch (caught) {
    const sidecar: VisualDiffSidecar = {
      ...base,
      status: "failed",
      outcome: "error",
      policyStatus: "failed",
      passed: false,
      error:
        error ?? (caught instanceof Error ? caught.message : String(caught)),
    };
    writeVisualDiffSidecar(outPath, sidecar);
    return sidecar;
  }
}
