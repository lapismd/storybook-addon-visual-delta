import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "../test/render.js";
import { BaselineCreatePicker } from "./BaselineCreatePicker.js";

describe("BaselineCreatePicker", () => {
  it("requires an explicit Default or interaction target", async () => {
    const user = userEvent.setup();
    const onCreateDefault = vi.fn();
    const onCreateInteraction = vi.fn();
    const step = {
      callId: "call-1",
      label: "userEvent.click",
      stepId: "interaction-1-click",
      syntax: {
        text: 'userEvent.click(getByRole("button"))',
        tokens: [],
      },
    };

    renderWithTheme(
      <BaselineCreatePicker
        steps={[step]}
        busy={false}
        onCreateDefault={onCreateDefault}
        onCreateInteraction={onCreateInteraction}
      />,
    );

    expect(
      screen.getByRole("group", { name: "Choose baseline to create" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Create Default baseline" }),
    );
    expect(onCreateDefault).toHaveBeenCalledOnce();
    expect(onCreateInteraction).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: 'Create userEvent.click(getByRole("button")) baseline',
      }),
    );
    expect(onCreateInteraction).toHaveBeenCalledWith(step);
  });
});
