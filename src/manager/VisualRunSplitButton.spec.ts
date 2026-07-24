import { describe, expect, it } from "vitest";
import {
  modeActionLabel,
  modeActionTooltip,
} from "./VisualRunSplitButton.js";
import {
  diffEngineLabel,
  diffEngineTooltip,
} from "./DiffCaptureSplitButton.js";

describe("VisualRunSplitButton", () => {
  it("labels Story / Component / All", () => {
    expect(modeActionLabel("story")).toBe("Story");
    expect(modeActionLabel("component")).toBe("Component");
    expect(modeActionLabel("all")).toBe("All");
  });

  it("tooltips describe Playwright visual runs", () => {
    expect(modeActionTooltip("story")).toMatch(/this story/i);
    expect(modeActionTooltip("component")).toMatch(/component/i);
    expect(modeActionTooltip("all")).toMatch(/all/i);
  });
});

describe("DiffCaptureSplitButton", () => {
  it("labels HTML and Chromium Diff distinctly", () => {
    expect(diffEngineLabel("html")).toBe("Diff HTML");
    expect(diffEngineLabel("chromium")).toBe("Diff Chromium");
  });

  it("tooltips explain the capture engines", () => {
    expect(diffEngineTooltip("html")).toMatch(/html-to-image/i);
    expect(diffEngineTooltip("chromium")).toMatch(/Chromium/i);
  });
});
