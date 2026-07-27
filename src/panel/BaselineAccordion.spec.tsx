import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BaselineAccordion } from "./BaselineAccordion.js";
import { renderWithTheme } from "../test/render.js";

describe("BaselineAccordion", () => {
  it("expands sections and renders body content", async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    const onOpenHistory = vi.fn();
    const onUpdateDefault = vi.fn();
    const onDelete = vi.fn();
    renderWithTheme(
      <BaselineAccordion
        sections={[
          {
            id: "default",
            label: "Default",
            hint: "End of play · primary baseline",
            thumbSrc: "/visual-baselines/forms/default.png",
            status: "pass",
            stats: "0%",
            history: {
              path: "forms/default.png",
              label: "Default",
            },
          },
          {
            id: "opens",
            label: "Opens chooser",
            hint: "No baseline yet · opens",
            step: { callId: "c1", label: "Opens chooser", stepId: "opens" },
          },
        ]}
        expandedId="default"
        busy={false}
        showDistribution={false}
        onExpand={onExpand}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onUpdateDefault={onUpdateDefault}
        onDelete={onDelete}
        onToggleDistribution={vi.fn()}
        onOpenHistory={onOpenHistory}
        renderBody={(section) => <div>Body for {section.label}</div>}
      />,
    );

    expect(screen.getByText("Body for Default")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();

    const moreButton = screen.getByRole("button", {
      name: "More Default baseline actions",
    });
    expect(moreButton).toHaveTextContent("");
    expect(moreButton).toHaveAttribute(
      "title",
      "More Default baseline actions",
    );
    await user.click(moreButton);
    const historyButton = screen.getByRole("button", {
      name: "Open Default baseline history",
    });
    await user.click(historyButton);
    expect(onOpenHistory).toHaveBeenCalledWith({
      path: "forms/default.png",
      label: "Default",
    });
    expect(onExpand).not.toHaveBeenCalled();

    await user.click(moreButton);
    await user.click(
      screen.getByRole("button", { name: "Update Default baseline" }),
    );
    expect(onUpdateDefault).toHaveBeenCalledTimes(1);

    await user.click(moreButton);
    await user.click(
      screen.getByRole("button", { name: "Delete Default screenshot" }),
    );
    expect(onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "default", label: "Default" }),
    );

    await user.click(screen.getByRole("button", { name: /Opens chooser/i }));
    expect(onExpand).toHaveBeenCalledWith("opens");
  });
});
