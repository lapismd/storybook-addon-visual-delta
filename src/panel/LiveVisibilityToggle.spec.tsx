import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveVisibilityToggle } from "./LiveVisibilityToggle.js";
import { renderWithTheme } from "../test/render.js";

describe("LiveVisibilityToggle", () => {
  it("toggles into image-only mode", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderWithTheme(
      <LiveVisibilityToggle liveVisible onToggle={onToggle} />,
    );

    await user.click(
      screen.getByRole("switch", { name: "Image only (hide live story)" }),
    );
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("shows Image only hint when live is hidden", () => {
    renderWithTheme(
      <LiveVisibilityToggle liveVisible={false} onToggle={vi.fn()} />,
    );
    expect(screen.getByText("Image only")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", {
        name: "Exit image only (show live story)",
      }),
    ).toBeInTheDocument();
  });
});
