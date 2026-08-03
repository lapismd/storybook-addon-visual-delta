import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiveVisibilityToggle } from "./LiveVisibilityToggle.js";
import { renderWithTheme } from "../test/render.js";

describe("LiveVisibilityToggle", () => {
  it("toggles into Captured mode", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderWithTheme(<LiveVisibilityToggle liveVisible onToggle={onToggle} />);

    await user.click(
      screen.getByRole("switch", { name: "Show captured actual" }),
    );
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("keeps Captured state accessible without a duplicate visible hint", () => {
    renderWithTheme(
      <LiveVisibilityToggle liveVisible={false} onToggle={vi.fn()} />,
    );
    expect(screen.queryByText("Image only")).not.toBeInTheDocument();
    expect(
      screen.getByRole("switch", {
        name: "Show live component",
      }),
    ).toBeInTheDocument();
  });
});
