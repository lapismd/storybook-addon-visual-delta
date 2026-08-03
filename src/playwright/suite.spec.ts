import { describe, expect, it } from "vitest";
import { visualCaptureSelections } from "./suite.js";

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
