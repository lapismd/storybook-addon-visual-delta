import type { VisualModeRunResult } from "./mode-results.js";
import type {
  VisualComparisonOutcome,
  VisualDiffSidecar,
} from "../visual-diff-sidecar.js";

export type { VisualComparisonOutcome } from "../visual-diff-sidecar.js";

export type VisualRunResultLike = {
  status: "passed" | "failed" | "skipped" | "timedOut";
  error?: string;
  sidecar?: Partial<VisualDiffSidecar>;
  modeResults?: VisualModeRunResult[];
  missingBaseline?: boolean;
  outcome?: VisualComparisonOutcome;
};

const MISSING_BASELINE_MESSAGES = [
  "snapshot doesn't exist",
  "snapshot does not exist",
  "no baseline screenshot",
  "missing baseline",
] as const;

export function isMissingBaselineError(error: string | undefined): boolean {
  const normalized = error?.toLowerCase() ?? "";
  return MISSING_BASELINE_MESSAGES.some((message) =>
    normalized.includes(message),
  );
}

function changedPixels(
  sidecar: Partial<VisualDiffSidecar> | undefined,
): boolean {
  return Boolean(
    sidecar &&
      ((typeof sidecar.diffPixels === "number" && sidecar.diffPixels > 0) ||
        (typeof sidecar.diffPercent === "number" && sidecar.diffPercent > 0)),
  );
}

function sidecarOutcome(
  sidecar: Partial<VisualDiffSidecar> | undefined,
): VisualComparisonOutcome | undefined {
  if (!sidecar) return undefined;
  if (sidecar.dimensionMismatch) return "mismatch";
  if (
    sidecar.runnerStatus === "failed" ||
    sidecar.runnerStatus === "timedOut"
  ) {
    if (changedPixels(sidecar)) return "mismatch";
    return "error";
  }
  if (sidecar.runnerStatus === "skipped") return "skipped";
  if (sidecar.outcome) return sidecar.outcome;
  if (sidecar.error && !changedPixels(sidecar)) return "error";
  if (sidecar.passed === false) return "mismatch";
  if (typeof sidecar.diffPercent === "number") {
    const threshold = sidecar.passThresholdPercent;
    if (typeof threshold === "number" && sidecar.diffPercent > threshold) {
      return "mismatch";
    }
  }
  if (changedPixels(sidecar)) return "changed-within-tolerance";
  if (sidecar.passed === true) return "passed";
  return undefined;
}

/**
 * Convert runner, sidecar, and mode-specific data into one trustworthy result.
 *
 * A raw Playwright failure without comparison evidence is an infrastructure
 * error. Only sidecar/mode comparison failures are treated as mismatches.
 */
export function classifyVisualRunResult(
  result: VisualRunResultLike,
): VisualComparisonOutcome {
  if (result.status === "skipped") return "skipped";
  if (result.status === "timedOut") return "error";
  if (
    result.outcome === "mismatch" ||
    result.outcome === "missing-baseline" ||
    result.outcome === "error" ||
    result.outcome === "skipped"
  ) {
    return result.outcome;
  }

  const modeResults = result.modeResults ?? [];
  if (modeResults.some((mode) => mode.status === "error")) return "error";
  if (
    result.missingBaseline ||
    isMissingBaselineError(result.error) ||
    modeResults.some((mode) => mode.status === "new")
  ) {
    return "missing-baseline";
  }
  if (modeResults.some((mode) => mode.status === "failed")) return "mismatch";

  const primaryOutcome = sidecarOutcome(result.sidecar);
  if (primaryOutcome === "error" || primaryOutcome === "mismatch") {
    return primaryOutcome;
  }

  const modeOutcomes = modeResults.map((mode) => sidecarOutcome(mode.sidecar));
  if (modeOutcomes.some((outcome) => outcome === "error")) return "error";
  if (modeOutcomes.some((outcome) => outcome === "mismatch")) {
    return "mismatch";
  }
  if (
    primaryOutcome === "changed-within-tolerance" ||
    modeOutcomes.some((outcome) => outcome === "changed-within-tolerance")
  ) {
    return "changed-within-tolerance";
  }

  if (result.status === "failed") {
    // Playwright screenshot assertions fail before their post-run sidecar is
    // attached. If comparison evidence exists, preserve it as a mismatch.
    if (changedPixels(result.sidecar) || result.sidecar?.dimensionMismatch) {
      return "mismatch";
    }
    return "error";
  }
  if (result.outcome) return result.outcome;
  return "passed";
}
