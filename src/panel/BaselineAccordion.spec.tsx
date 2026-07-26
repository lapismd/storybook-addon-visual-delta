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
    renderWithTheme(
      <BaselineAccordion
        sections={[
          {
            id: "default",
            label: "Default",
            hint: "End of play · primary baseline",
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
        onUpdateDefault={vi.fn()}
        onToggleDistribution={vi.fn()}
        onOpenHistory={onOpenHistory}
        renderBody={(section) => <div>Body for {section.label}</div>}
      />,
    );

    expect(screen.getByText("Body for Default")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();

    const historyButton = screen.getByRole("button", {
      name: "Open Default baseline history",
    });
    expect(historyButton).toHaveTextContent("");
    expect(historyButton).toHaveAttribute(
      "title",
      "Open Default baseline history",
    );
    await user.click(historyButton);
    expect(onOpenHistory).toHaveBeenCalledWith({
      path: "forms/default.png",
      label: "Default",
    });
    expect(onExpand).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Opens chooser/i }));
    expect(onExpand).toHaveBeenCalledWith("opens");
  });
});
