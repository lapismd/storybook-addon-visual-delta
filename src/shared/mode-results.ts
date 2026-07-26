import type { VisualDiffSidecar } from "../visual-diff-sidecar.js";

export type VisualModeResultStatus = "passed" | "failed" | "new" | "error";

export type VisualModeRunResult = {
  /** `null` identifies the Default capture. */
  mode: string | null;
  status: VisualModeResultStatus;
  sidecar?: VisualDiffSidecar;
  error?: string;
};

export function isMissingModeBaselineError(error?: string): boolean {
  const value = error?.toLowerCase() ?? "";
  return (
    value.includes("snapshot doesn't exist") ||
    value.includes("snapshot does not exist") ||
    value.includes("no baseline screenshot")
  );
}

export function modeResultStatus(
  sidecar: VisualDiffSidecar,
  hasBaseline: boolean,
): VisualModeResultStatus {
  if (!hasBaseline || isMissingModeBaselineError(sidecar.error)) return "new";
  if (sidecar.error && sidecar.diffPercent == null) return "error";
  if (typeof sidecar.passed === "boolean") {
    return sidecar.passed ? "passed" : "failed";
  }
  return sidecar.status === "passed" ? "passed" : "failed";
}

/** Aggregate precedence: error → new → failed → passed. */
export function aggregateModeResultStatus(
  results: readonly VisualModeRunResult[],
): VisualModeResultStatus | null {
  if (results.length === 0) return null;
  if (results.some((result) => result.status === "error")) return "error";
  if (results.some((result) => result.status === "new")) return "new";
  if (results.some((result) => result.status === "failed")) return "failed";
  return "passed";
}
