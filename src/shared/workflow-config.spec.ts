import { describe, expect, it } from "vitest";
import {
  BUILTIN_VISUAL_DELTA_WORKFLOW,
  renderVisualDeltaCommitMessage,
  shouldAutoAcceptLiveStoryComparison,
  validateVisualDeltaWorkflowConfig,
} from "./workflow-config.js";

describe("Visual Delta workflow configuration", () => {
  it("defaults every mutation and commit automation setting off", () => {
    expect(validateVisualDeltaWorkflowConfig(undefined)).toEqual({
      value: BUILTIN_VISUAL_DELTA_WORKFLOW,
      errors: [],
    });
  });

  it("accepts the allow-listed workflow and rejects unknown commands", () => {
    const valid = validateVisualDeltaWorkflowConfig(
      {
        autoAcceptLiveStoryComparisons: true,
        vcs: {
          mode: "review",
          commitMessageTemplate: "Visual: {action} {scope}",
        },
      },
      { rejectUnknown: true },
    );
    expect(valid.errors).toEqual([]);
    expect(valid.value.vcs.mode).toBe("review");

    const invalid = validateVisualDeltaWorkflowConfig(
      {
        vcs: {
          mode: "push",
          command: "git push",
        },
      },
      { rejectUnknown: true },
    );
    expect(invalid.errors.join(" ")).toMatch(/mode must be/);
    expect(invalid.errors.join(" ")).toMatch(/command is not an editable/);
  });

  it("renders only supported commit-message tokens", () => {
    expect(
      renderVisualDeltaCommitMessage(
        "Visual Delta: {action} {scope} ({count}) {unknown}",
        {
          action: "update baseline",
          scope: "Dialog",
          count: 1,
        },
      ),
    ).toBe("Visual Delta: update baseline Dialog (1) {unknown}");
  });

  it("auto-accepts only fresh pass classifications when explicitly enabled", () => {
    const enabled = {
      ...BUILTIN_VISUAL_DELTA_WORKFLOW,
      autoAcceptLiveStoryComparisons: true,
    };
    expect(shouldAutoAcceptLiveStoryComparison(enabled, "passed")).toBe(true);
    expect(
      shouldAutoAcceptLiveStoryComparison(enabled, "changed-within-tolerance"),
    ).toBe(true);
    for (const outcome of [
      "mismatch",
      "missing-baseline",
      "error",
      "skipped",
    ] as const) {
      expect(shouldAutoAcceptLiveStoryComparison(enabled, outcome)).toBe(false);
    }
    expect(
      shouldAutoAcceptLiveStoryComparison(
        BUILTIN_VISUAL_DELTA_WORKFLOW,
        "passed",
      ),
    ).toBe(false);
  });
});
