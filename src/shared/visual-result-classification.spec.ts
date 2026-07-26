import { describe, expect, it } from "vitest";
import { classifyVisualRunResult } from "./visual-result-classification.js";

describe("classifyVisualRunResult", () => {
  it("separates mismatches from runner errors", () => {
    expect(
      classifyVisualRunResult({
        status: "failed",
        sidecar: {
          status: "failed",
          passed: false,
          diffPixels: 25,
          diffPercent: 2,
          passThresholdPercent: 1,
        },
      }),
    ).toBe("mismatch");
    expect(
      classifyVisualRunResult({
        status: "failed",
        error: "Browser crashed during capture",
      }),
    ).toBe("error");
  });

  it("recognizes a changed image that remains within tolerance", () => {
    expect(
      classifyVisualRunResult({
        status: "passed",
        sidecar: {
          status: "passed",
          passed: true,
          diffPixels: 4,
          diffPercent: 0.4,
          passThresholdPercent: 1,
        },
      }),
    ).toBe("changed-within-tolerance");
  });

  it("recognizes missing baselines from flags, text, and modes", () => {
    expect(
      classifyVisualRunResult({
        status: "failed",
        missingBaseline: true,
      }),
    ).toBe("missing-baseline");
    expect(
      classifyVisualRunResult({
        status: "failed",
        error: "A snapshot doesn't exist at /tmp/example.png",
      }),
    ).toBe("missing-baseline");
    expect(
      classifyVisualRunResult({
        status: "failed",
        modeResults: [{ mode: "dark", status: "new" }],
      }),
    ).toBe("missing-baseline");
  });

  it("gives mode errors precedence over missing mode baselines", () => {
    expect(
      classifyVisualRunResult({
        status: "failed",
        modeResults: [
          { mode: "dark", status: "new" },
          { mode: "mobile", status: "error", error: "Capture failed" },
        ],
      }),
    ).toBe("error");
  });
});
