import { describe, expect, it } from "vitest";
import { modeActionLabel, modeActionTooltip } from "./VisualRunSplitButton.js";
import {
  diffEngineLabel,
  diffEngineTooltip,
} from "./DiffCaptureSplitButton.js";
import {
  baselineModeLabel,
  baselineWriteRowLabel,
} from "./VisualBaselineSplitButton.js";

describe("VisualRunSplitButton", () => {
  it("labels Story / Component / Affected / All", () => {
    expect(modeActionLabel("story")).toBe("Story");
    expect(modeActionLabel("component")).toBe("Component");
    expect(modeActionLabel("affected")).toBe("Affected");
    expect(modeActionLabel("all")).toBe("All");
  });

  it("tooltips describe Playwright visual runs", () => {
    expect(modeActionTooltip("story")).toMatch(/this story/i);
    expect(modeActionTooltip("component")).toMatch(/component/i);
    expect(modeActionTooltip("affected")).toMatch(/affected/i);
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

describe("VisualBaselineSplitButton labels", () => {
  it("menu labels Create missing / Rewrite existing", () => {
    expect(baselineModeLabel("create")).toBe("Create missing");
    expect(baselineModeLabel("rewrite")).toBe("Rewrite existing");
  });

  it("Testing Module row labels follow write mode", () => {
    expect(baselineWriteRowLabel("create")).toBe("Create missing Baselines");
    expect(baselineWriteRowLabel("rewrite")).toBe("Update baselines");
  });
});
