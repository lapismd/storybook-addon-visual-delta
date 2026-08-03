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
import { visualArtifactPaths } from "../node/visual-artifacts.js";
import type {
  VisualCaptureSetItem,
  VisualDiffVariant,
} from "../visual-diff-sidecar.js";

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
    version: 4,
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
 * Write derived comparison evidence beneath `.visual-delta/artifacts`, mirroring
 * the baseline's path relative to the configured snapshot directory.
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
  captureConfigHash?: string;
  operationId?: string;
  browser?: VisualDeltaBrowser;
  failureMode?: VisualTestFailureMode;
  variant?: VisualDiffVariant;
  captureSet?: VisualCaptureSetItem[];
  renderFingerprint?: string;
  comparisonSource?: "browser" | "cached-actual";
  captureOperationId?: string;
  actualCapturedAt?: string;
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
    captureConfigHash,
    operationId,
    browser = "chromium",
    failureMode = "warn",
    variant = visualModeName
      ? { kind: "mode", id: visualModeName }
      : { kind: "primary" },
    captureSet,
    renderFingerprint,
    comparisonSource = "browser",
    captureOperationId,
    actualCapturedAt,
  } = input;
  const snapshotRoot = path.isAbsolute(snapshotDir)
    ? snapshotDir
    : path.join(packageRoot, snapshotDir);
  const artifacts = visualArtifactPaths({
    root: packageRoot,
    snapshotDir: snapshotRoot,
    baselinePath: baselinePngAbsPath,
  });
  const outPath = artifacts.result;
  const captureId = captureOperationId ?? operationId ?? randomUUID();
  const capturedAt = actualCapturedAt ?? new Date().toISOString();
  const base = {
    ...buildSidecarBase(entry, mode, status, error, visualModeName, {
      browser,
    }),
    viewport,
    deviceScaleFactor,
    operationId: operationId ?? captureId,
    variant,
    captureSet: captureSet ?? [
      { variant, baselineRelative: artifacts.baselineRelative },
    ],
    comparisonSource,
    captureOperationId: captureId,
    actualCapturedAt: capturedAt,
    ...(renderFingerprint ? { renderFingerprint } : {}),
    ...(captureConfigHash
      ? { captureConfigHash }
      : captureConfig
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
    const actualPath = artifacts.actual;
    if (actualPng) {
      mkdirSync(path.dirname(actualPath), { recursive: true });
      if (comparisonSource === "browser" || !existsSync(actualPath)) {
        writeFileSync(actualPath, actualPng);
      }
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
      ...(actualPng ? { actualHash: sha256(actualPng) } : {}),
      ...(actualPng
        ? { actualRel: artifacts.actualRelative }
        : {}),
    };
    writeVisualDiffSidecar(outPath, sidecar);
    return sidecar;
  }
  try {
    const threshold =
      passThresholdPercent ?? readPlaywrightPassThresholdPercent(packageRoot);
    const { diffPng, ...comparison } = compareBaselineToActualPng(
      baselinePngAbsPath,
      actualPng,
      {
        passThresholdPercent: threshold,
        diffThreshold,
        includeAntiAliasing,
      },
    );
    const { actualPng: _fittedActual, ...metrics } = comparison;
    const actualPath = artifacts.actual;
    const heatmapPath = artifacts.diff;
    mkdirSync(path.dirname(actualPath), { recursive: true });
    if (comparisonSource === "browser" || !existsSync(actualPath)) {
      writeFileSync(actualPath, actualPng);
    }
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
      actualHash: sha256(actualPng),
      actualRel: artifacts.actualRelative,
      diffRel: artifacts.diffRelative,
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
