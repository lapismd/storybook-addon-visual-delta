import { describe, expect, it } from "vitest";
import type { VisualDiffSidecar } from "../visual-diff-sidecar.js";
import { aggregateModeResultStatus, modeResultStatus } from "./mode-results.js";

function sidecar(
  overrides: Partial<VisualDiffSidecar> = {},
): VisualDiffSidecar {
  return {
    version: 1,
    storyId: "button--primary",
    snapshotRel: "button.png",
    status: "passed",
    generatedAt: "2026-07-26T08:30:00.000Z",
    tool: "playwright",
    ...overrides,
  };
}

describe("mode result precedence", () => {
  it("distinguishes new baselines and capture errors from pixel failures", () => {
    expect(modeResultStatus(sidecar(), false)).toBe("new");
    expect(
      modeResultStatus(sidecar({ status: "failed", passed: false }), true),
    ).toBe("failed");
    expect(
      modeResultStatus(
        sidecar({ status: "failed", error: "Browser disconnected" }),
        true,
      ),
    ).toBe("error");
  });

  it("aggregates error before new before failed before passed", () => {
    expect(
      aggregateModeResultStatus([
        { mode: null, status: "passed" },
        { mode: "Dark", status: "failed" },
        { mode: "Mobile", status: "new" },
      ]),
    ).toBe("new");
    expect(
      aggregateModeResultStatus([
        { mode: null, status: "passed" },
        { mode: "Dark", status: "error" },
      ]),
    ).toBe("error");
  });
});
