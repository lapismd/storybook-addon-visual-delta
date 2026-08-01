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
    const onCreate = vi.fn();
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
        onCreate={onCreate}
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
    const expandedBody = document.querySelector(
      '[data-visual-delta-accordion-body="default"]',
    );
    expect(expandedBody).toBeInstanceOf(HTMLElement);
    expect(getComputedStyle(expandedBody as HTMLElement).minHeight).toBe(
      "400px",
    );
    expect(
      document.querySelector("[data-visual-delta-scroll-tail]"),
    ).toHaveAttribute("aria-hidden", "true");

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

    await user.click(
      screen.getByRole("button", {
        name: "Opens chooser No baseline yet · opens",
      }),
    );
    expect(onExpand).toHaveBeenCalledWith("opens");

    const interactionMenu = screen.getByRole("button", {
      name: "More Opens chooser baseline actions",
    });
    await user.click(interactionMenu);
    await user.click(
      screen.getByRole("button", {
        name: "Create Opens chooser baseline (opens)",
      }),
    );
    expect(onCreate).toHaveBeenCalledWith({
      callId: "c1",
      label: "Opens chooser",
      stepId: "opens",
    });
  });

  it("renders resolved call syntax and toggles hidden interactions", async () => {
    const user = userEvent.setup();
    const onToggleInteractions = vi.fn();
    renderWithTheme(
      <BaselineAccordion
        sections={[
          {
            id: "assertion",
            label: "toBeInTheDocument",
            hint: "No baseline yet · assertion",
            step: {
              callId: "c2",
              label: "toBeInTheDocument",
              stepId: "assertion",
              syntax: {
                text: "expect(<div.panel-shell>).toBeInTheDocument()",
                tokens: [
                  { kind: "method", text: "expect" },
                  { kind: "base", text: "(" },
                  { kind: "base", text: "<" },
                  { kind: "tag", text: "div" },
                  { kind: "tag-suffix", text: ".panel-shell" },
                  { kind: "base", text: ">)." },
                  { kind: "method", text: "toBeInTheDocument" },
                  { kind: "base", text: "()" },
                ],
              },
            },
          },
        ]}
        expandedId={null}
        busy={false}
        showDistribution={false}
        showAllInteractions={false}
        hiddenInteractionCount={1}
        onExpand={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onUpdateDefault={vi.fn()}
        onDelete={vi.fn()}
        onToggleDistribution={vi.fn()}
        onToggleInteractions={onToggleInteractions}
        renderBody={() => null}
      />,
    );

    expect(
      screen.getByTitle("expect(<div.panel-shell>).toBeInTheDocument()"),
    ).toHaveTextContent("expect(<div.panel-shell>).toBeInTheDocument()");
    await user.click(
      screen.getByRole("switch", { name: "Show all interactions" }),
    );
    expect(onToggleInteractions).toHaveBeenCalledOnce();
  });

  it("renders missing Default and interaction targets as accordion rows", async () => {
    const user = userEvent.setup();
    const onCreateDefault = vi.fn();
    const onCreate = vi.fn();
    const step = {
      callId: "story [1] click",
      captureCallId: "story [1] click",
      label: "userEvent.click",
      stepId: "interaction-1-click",
      syntax: {
        text: 'userEvent.click(getByRole("combobox"))',
        tokens: [
          { kind: "method" as const, text: "userEvent.click" },
          { kind: "base" as const, text: '(getByRole("combobox"))' },
        ],
      },
    };

    renderWithTheme(
      <BaselineAccordion
        sections={[
          {
            id: "default",
            label: "Default",
            hint: "No baseline yet · end of play",
          },
          {
            id: step.stepId,
            label: step.label,
            hint: `No baseline yet · ${step.stepId}`,
            step,
          },
        ]}
        expandedId={null}
        busy={false}
        showDistribution={false}
        onExpand={vi.fn()}
        onCreateDefault={onCreateDefault}
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onUpdateDefault={vi.fn()}
        onDelete={vi.fn()}
        onToggleDistribution={vi.fn()}
        renderBody={() => null}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Create Default baseline" }),
    );
    expect(onCreateDefault).toHaveBeenCalledOnce();
    expect(onCreate).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {
        name: 'Create userEvent.click(getByRole("combobox")) baseline (interaction-1-click)',
      }),
    );
    expect(onCreate).toHaveBeenCalledWith(step);
  });
});
