import React from "react";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithTheme } from "../test/render.js";
import { ModeSelector } from "./ModeSelector.js";

describe("ModeSelector", () => {
  afterEach(() => cleanup());

  it("uses thumbnail-backed names without a separate Mode label", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithTheme(
      <ModeSelector
        modeNames={["Compact"]}
        value={null}
        onChange={onChange}
        previewSources={{
          Default: "/default.png",
          Compact: "/compact.png",
        }}
      />,
    );

    expect(screen.queryByText("Mode", { exact: true })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", {
      name: "Visual mode: Default, not run",
    });
    expect(trigger.querySelector("img")).toHaveAttribute("src", "/default.png");

    await user.click(trigger);
    const compact = await screen.findByRole("button", {
      name: "Compact mode, not run",
    });
    expect(compact.querySelector("img")).toHaveAttribute(
      "src",
      "/compact.png",
    );
    await user.click(compact);

    expect(onChange).toHaveBeenCalledWith("Compact");
  });
});
