import React from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithTheme } from "../test/render.js";
import { RangeNumberInput } from "./RangeNumberInput.js";

afterEach(cleanup);

describe("RangeNumberInput", () => {
  it("synchronizes slider changes with the controlled value", () => {
    const onChange = vi.fn();
    renderWithTheme(
      <RangeNumberInput
        label="Threshold"
        value={1}
        min={0}
        max={2}
        step={0.05}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Threshold slider"), {
      target: { value: "1.35" },
    });
    expect(onChange).toHaveBeenCalledWith(1.35);
  });

  it("commits custom values on Enter and reverts invalid values", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(
      <RangeNumberInput
        label="Threshold"
        value={1}
        min={0}
        max={2}
        step={0.05}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Threshold");

    await user.clear(input);
    await user.type(input, "1.37{Enter}");
    expect(onChange).toHaveBeenCalledWith(1.37);

    await user.clear(input);
    await user.type(input, "3");
    await user.tab();
    expect(input).toHaveValue(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
