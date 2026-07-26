import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithTheme } from "../test/render.js";
import { PanelResultSummary } from "./PanelResultSummary.js";

afterEach(cleanup);

describe("PanelResultSummary", () => {
  it("announces aggregate mode results and completion time", () => {
    renderWithTheme(
      <PanelResultSummary
        state="failed"
        title="Visual test failed"
        detail="Pass threshold exceeded."
        modeSummary="2 passed · 1 failed"
        finishedAt={Date.UTC(2026, 6, 26, 8, 30)}
      />,
    );

    expect(
      screen.getByRole("status", {
        name: [
          "Visual test failed",
          "Pass threshold exceeded",
          "2 passed · 1 failed",
          "Finished 08:30 UTC",
        ].join(". "),
      }),
    ).toHaveAttribute("data-result-state", "failed");
  });
});
