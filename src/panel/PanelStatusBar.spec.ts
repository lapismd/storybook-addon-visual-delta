import { describe, expect, it } from "vitest";
import { lastMeaningfulLogLine } from "./PanelStatusBar.js";

describe("lastMeaningfulLogLine", () => {
  it("returns the last non-empty line", () => {
    expect(lastMeaningfulLogLine("a\nb\n\n")).toBe("b");
    expect(lastMeaningfulLogLine("only")).toBe("only");
    expect(lastMeaningfulLogLine("\r\n  \r\n")).toBe("");
  });
});
