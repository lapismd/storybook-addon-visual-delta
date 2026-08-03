import React, { useState } from "react";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { CompareZoomState } from "../shared/compare-zoom.js";
import { renderWithTheme } from "../test/render.js";
import { CompareZoomControl } from "./CompareZoomControl.js";

afterEach(cleanup);

function Harness() {
  const [value, setValue] = useState<CompareZoomState>({
    mode: "fit",
    scale: 0.8,
  });
  return (
    <>
      <CompareZoomControl value={value} onChange={setValue} />
      <output data-testid="zoom-state">
        {value.mode}:{value.scale}
      </output>
    </>
  );
}

describe("CompareZoomControl", () => {
  it("uses icon-only actions for Fit and native size", () => {
    renderWithTheme(<Harness />);

    const fit = screen.getByRole("switch", {
      name: "Fit split comparison. Current 80%",
    });
    const native = screen.getByRole("switch", {
      name: "Show split comparison at 100%",
    });
    expect(fit).toHaveTextContent("");
    expect(native).toHaveTextContent("");
    expect(fit.querySelector("svg")).not.toBeNull();
    expect(native.querySelector("svg")).not.toBeNull();
  });

  it("accepts a custom whole-number percentage", async () => {
    const user = userEvent.setup();
    renderWithTheme(<Harness />);
    const input = screen.getByLabelText("Split zoom percentage");

    expect(input).toHaveValue(80);
    await user.clear(input);
    await user.type(input, "137{Enter}");

    expect(input).toHaveValue(137);
    expect(screen.getByTestId("zoom-state")).toHaveTextContent("custom:1.37");
  });

  it("reverts blank, fractional, and out-of-range percentages", async () => {
    const user = userEvent.setup();
    renderWithTheme(<Harness />);
    const input = screen.getByLabelText("Split zoom percentage");

    for (const invalid of ["", "24", "137.5", "201"]) {
      await user.clear(input);
      if (invalid) await user.type(input, invalid);
      await user.tab();
      expect(input).toHaveValue(80);
      await user.click(input);
    }
    expect(screen.getByTestId("zoom-state")).toHaveTextContent("fit:0.8");
  });
});
