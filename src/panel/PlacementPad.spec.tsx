import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlacementPad } from "./PlacementPad.js";
import { renderWithTheme } from "../test/render.js";

describe("PlacementPad", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders five placement controls and toggles on click", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderWithTheme(<PlacementPad value="right" active onToggle={onToggle} />);

    expect(
      screen.getByRole("group", { name: "Baseline position" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("switch", { name: "Baseline left of live" }),
    );
    expect(onToggle).toHaveBeenCalledWith("left");

    expect(
      screen.getByRole("switch", {
        name: "Hide overlay (Baseline right of live)",
      }),
    ).toBeInTheDocument();
  });

  it("marks all switches unavailable when disabled", () => {
    renderWithTheme(
      <PlacementPad
        value="center"
        active={false}
        onToggle={vi.fn()}
        disabled
      />,
    );
    for (const control of screen.getAllByRole("switch")) {
      expect(
        control.hasAttribute("disabled") ||
          control.getAttribute("aria-disabled") === "true",
      ).toBe(true);
    }
  });

  it("describes placements relative to the captured actual", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderWithTheme(
      <PlacementPad
        value="right"
        active
        comparisonTarget="actual"
        onToggle={onToggle}
      />,
    );

    expect(
      screen.getByRole("group", {
        name: "Baseline position relative to actual",
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("switch", { name: "Baseline left of actual" }),
    );
    expect(onToggle).toHaveBeenCalledWith("left");
    expect(
      screen.getByRole("switch", {
        name: "Hide overlay (Baseline right of actual)",
      }),
    ).toBeInTheDocument();
  });

  it("shows nothing pressed when overlay is soft-hidden", () => {
    renderWithTheme(
      <PlacementPad value="center" active={false} onToggle={vi.fn()} />,
    );
    for (const control of screen.getAllByRole("switch")) {
      expect(control).toHaveAttribute("aria-checked", "false");
    }
  });
});
