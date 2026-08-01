export type VisualTestFailureMode = "warn" | "strict";

export const DEFAULT_VISUAL_TEST_FAILURE_MODE: VisualTestFailureMode = "warn";

export function isVisualTestFailureMode(
  value: unknown,
): value is VisualTestFailureMode {
  return value === "warn" || value === "strict";
}

export function resolveVisualTestFailureMode(options: {
  explicit?: unknown;
  environment?: unknown;
  configured?: unknown;
}): VisualTestFailureMode {
  for (const value of [
    options.explicit,
    options.environment,
    options.configured,
  ]) {
    if (isVisualTestFailureMode(value)) return value;
  }
  return DEFAULT_VISUAL_TEST_FAILURE_MODE;
}

export function isWarningComparisonOutcome(
  outcome: string | undefined,
): boolean {
  return outcome === "missing-baseline" || outcome === "mismatch";
}
