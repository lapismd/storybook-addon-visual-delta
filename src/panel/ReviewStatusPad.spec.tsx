import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewStatusPad } from "./ReviewStatusPad.js";
import { renderWithTheme } from "../test/render.js";

describe("ReviewStatusPad", () => {
  afterEach(() => {
    cleanup();
  });

  it("selects a new review status", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithTheme(<ReviewStatusPad value={null} onSelect={onSelect} />);

    await user.click(
      screen.getByRole("switch", { name: "Approve visual baseline" }),
    );
    expect(onSelect).toHaveBeenCalledWith("approved");
  });

  it("marks the current status as unavailable", () => {
    renderWithTheme(
      <ReviewStatusPad value="pending" onSelect={vi.fn()} />,
    );
    const pending = screen.getByRole("switch", {
      name: "Pending review (current)",
    });
    expect(
      pending.hasAttribute("disabled") ||
        pending.getAttribute("aria-disabled") === "true",
    ).toBe(true);

    const approve = screen.getByRole("switch", {
      name: "Approve visual baseline",
    });
    expect(approve.getAttribute("aria-disabled")).not.toBe("true");
    expect(approve.hasAttribute("disabled")).toBe(false);
  });
});
