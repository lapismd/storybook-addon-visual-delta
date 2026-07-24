import { describe, expect, it } from "vitest";
import {
  appendVisualRunLogLine,
  formatProgressFraction,
  lastMeaningfulLogLine,
  visualRunProgressLogLine,
} from "./status-log.js";

describe("status-log helpers", () => {
  it("lastMeaningfulLogLine returns the last non-empty line", () => {
    expect(lastMeaningfulLogLine("a\nb\n\n")).toBe("b");
    expect(lastMeaningfulLogLine("only")).toBe("only");
    expect(lastMeaningfulLogLine("\r\n  \r\n")).toBe("");
  });

  it("visualRunProgressLogLine formats per-story and aggregate lines", () => {
    expect(
      visualRunProgressLogLine({
        completed: 2,
        total: 5,
        storyId: "shadcn-button--default",
        status: "failed",
      }),
    ).toBe("✘ shadcn-button--default (2/5)");
    expect(
      visualRunProgressLogLine({
        completed: 0,
        total: 3,
      }),
    ).toBe("Testing... 0/3");
  });

  it("appendVisualRunLogLine replaces on start and appends thereafter", () => {
    const start = appendVisualRunLogLine(null, {
      completed: 0,
      total: 2,
    });
    expect(start).toBe("Testing... 0/2");
    const next = appendVisualRunLogLine(start, {
      completed: 1,
      total: 2,
      storyId: "a--b",
      status: "passed",
    });
    expect(next).toBe("Testing... 0/2\n✓ a--b (1/2)");
  });

  it("formatProgressFraction requires a positive total", () => {
    expect(formatProgressFraction(1, 3)).toBe("1/3");
    expect(formatProgressFraction(0, 1)).toBe("0/1");
    expect(formatProgressFraction(1, 0)).toBeNull();
    expect(formatProgressFraction(undefined, undefined)).toBeNull();
  });
});
