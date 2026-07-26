import React from "react";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithTheme } from "../test/render.js";
import { VisualFiltersMenu } from "./VisualFiltersMenu.js";

beforeEach(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VisualFiltersMenu", () => {
  it("applies quick views and clears active filters", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = renderWithTheme(
      <VisualFiltersMenu
        activeIds={[]}
        resultFiltersEnabled
        onChange={onChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Filter visual stories" }),
    );
    expect(
      screen
        .getByRole("dialog", { name: "Visual story filters" })
        .closest("[data-radix-scroll-area-viewport]"),
    ).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Needs attention" }));
    expect(onChange).toHaveBeenLastCalledWith(["quick.needs-attention"]);

    rerender(
      <VisualFiltersMenu
        activeIds={["review.ready"]}
        resultFiltersEnabled
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId("visual-filter-count")).toHaveTextContent("1");
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("disables result facets until a completed run exists", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <VisualFiltersMenu
        activeIds={[]}
        resultFiltersEnabled={false}
        onChange={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Filter visual stories" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Baseline mismatch" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Run visual tests once to enable result filters."),
    ).toBeInTheDocument();
  });

  it("discloses Storybook errors that filters cannot hide", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <VisualFiltersMenu
        activeIds={["coverage.present"]}
        resultFiltersEnabled
        alwaysVisibleErrorCount={2}
        onChange={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Filter visual stories, 1 active",
      }),
    );
    expect(
      screen.getByText(/2 Storybook error stories remain visible/),
    ).toBeInTheDocument();
  });
});
