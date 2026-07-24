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

  it("selects ready for review", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithTheme(<ReviewStatusPad value={null} onSelect={onSelect} />);

    await user.click(
      screen.getByRole("switch", {
        name: "Mark visual baseline ready for review",
      }),
    );
    expect(onSelect).toHaveBeenCalledWith("ready");
  });

  it("selects failed", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithTheme(<ReviewStatusPad value="ready" onSelect={onSelect} />);

    await user.click(
      screen.getByRole("switch", { name: "Mark visual baseline failed" }),
    );
    expect(onSelect).toHaveBeenCalledWith("failed");
  });

  it("marks the current status as unavailable", () => {
    renderWithTheme(<ReviewStatusPad value="ready" onSelect={vi.fn()} />);
    const ready = screen.getByRole("switch", {
      name: "Ready for review (current)",
    });
    expect(
      ready.hasAttribute("disabled") ||
        ready.getAttribute("aria-disabled") === "true",
    ).toBe(true);

    const failed = screen.getByRole("switch", {
      name: "Mark visual baseline failed",
    });
    expect(failed.getAttribute("aria-disabled")).not.toBe("true");
    expect(failed.hasAttribute("disabled")).toBe(false);
  });

  it("does not expose pending or approved toggles", () => {
    renderWithTheme(<ReviewStatusPad value="pending" onSelect={vi.fn()} />);
    expect(
      screen.queryByRole("switch", { name: /pending/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: /approv/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("switch", {
        name: "Mark visual baseline ready for review",
      }),
    ).toBeTruthy();
  });
});
