import { describe, expect, it } from "vitest";
import {
  shouldDeferVisualPolicyFailure,
  visualCaptureSelections,
} from "./suite.js";

describe("visualCaptureSelections", () => {
  const modes = {
    Compact: { globals: { density: "compact" } },
    Dark: { globals: { theme: "dark" } },
  };

  it("retains primary and named modes for an ordinary suite run", () => {
    expect(visualCaptureSelections(modes)).toEqual([
      { name: "Default" },
      {
        name: "Compact",
        modeName: "Compact",
        globals: { density: "compact" },
      },
      { name: "Dark", modeName: "Dark", globals: { theme: "dark" } },
    ]);
  });

  it("captures only the selected primary variant for an exact baseline override", () => {
    expect(visualCaptureSelections(modes, true)).toEqual([
      { name: "Default" },
    ]);
  });
});

describe("deferred visual policy failures", () => {
  it("defers expected mismatch and missing-baseline policy outcomes", () => {
    const environment = { VISUAL_DELTA_DEFER_POLICY_FAILURES: "1" };
    expect(
      shouldDeferVisualPolicyFailure({ outcome: "mismatch", environment }),
    ).toBe(true);
    expect(
      shouldDeferVisualPolicyFailure({
        outcome: "missing-baseline",
        environment,
      }),
    ).toBe(true);
  });

  it("never defers infrastructure errors or ordinary suite runs", () => {
    expect(
      shouldDeferVisualPolicyFailure({
        outcome: "error",
        environment: { VISUAL_DELTA_DEFER_POLICY_FAILURES: "1" },
      }),
    ).toBe(false);
    expect(
      shouldDeferVisualPolicyFailure({ outcome: "mismatch", environment: {} }),
    ).toBe(false);
  });
});
