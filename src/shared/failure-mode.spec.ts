import { describe, expect, it } from "vitest";
import {
  isWarningComparisonOutcome,
  resolveVisualTestFailureMode,
} from "./failure-mode.js";

describe("visual test failure mode", () => {
  it("uses CLI, environment, project, then warn precedence", () => {
    expect(
      resolveVisualTestFailureMode({
        explicit: "warn",
        environment: "strict",
        configured: "strict",
      }),
    ).toBe("warn");
    expect(
      resolveVisualTestFailureMode({
        environment: "strict",
        configured: "warn",
      }),
    ).toBe("strict");
    expect(resolveVisualTestFailureMode({ configured: "strict" })).toBe(
      "strict",
    );
    expect(resolveVisualTestFailureMode({})).toBe("warn");
  });

  it("limits warnings to missing baselines and pixel mismatches", () => {
    expect(isWarningComparisonOutcome("missing-baseline")).toBe(true);
    expect(isWarningComparisonOutcome("mismatch")).toBe(true);
    expect(isWarningComparisonOutcome("error")).toBe(false);
  });
});
