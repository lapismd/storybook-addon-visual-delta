import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIFF_THRESHOLD,
  DEFAULT_PASS_THRESHOLD_PERCENT,
} from "../constants.js";
import {
  BUILTIN_VISUAL_DELTA_DEFAULTS,
  validateVisualDeltaProjectDefaults,
} from "./project-defaults.js";

describe("Visual Delta project defaults", () => {
  it("uses 0.063 for both built-in comparison thresholds", () => {
    expect(DEFAULT_DIFF_THRESHOLD).toBe(0.063);
    expect(DEFAULT_PASS_THRESHOLD_PERCENT).toBe(0.063);
    expect(BUILTIN_VISUAL_DELTA_DEFAULTS.passThresholdPercent).toBe(0.063);
    expect(BUILTIN_VISUAL_DELTA_DEFAULTS.diffThreshold).toBe(0.063);
    expect(validateVisualDeltaProjectDefaults({}).value).toMatchObject({
      passThresholdPercent: 0.063,
      diffThreshold: 0.063,
    });
  });
});
