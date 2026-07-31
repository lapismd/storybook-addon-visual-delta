import React from "react";
import { cleanup, screen, within } from "@testing-library/react";
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

const optionCounts = {
  "quick.needs-attention": 2,
  "review.ready": 1,
  "result.mismatch": 1,
};

describe("VisualFiltersMenu", () => {
  it("applies quick views and clears active filters", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = renderWithTheme(
      <VisualFiltersMenu
        activeIds={[]}
        resultFiltersEnabled
        optionCounts={optionCounts}
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
        optionCounts={optionCounts}
        matchingSummary={{ matching: 1, total: 4 }}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId("visual-filter-count")).toHaveTextContent("1");
    expect(screen.getByTestId("visual-filter-match-summary")).toHaveTextContent(
      "Showing 1 of 4 stories",
    );
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("inverts a facet to exclude and shows a struck count", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = renderWithTheme(
      <VisualFiltersMenu
        activeIds={["review.ready"]}
        resultFiltersEnabled
        optionCounts={optionCounts}
        matchingSummary={{ matching: 1, total: 4 }}
        onChange={onChange}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Filter visual stories, 1 active",
      }),
    );
    const readyCheckbox = screen.getByRole("checkbox", {
      name: "Ready for review",
    });
    const readyRow = readyCheckbox.closest("li");
    expect(readyRow).not.toBeNull();
    await user.hover(readyRow!);
    await user.click(
      within(readyRow!).getByRole("button", { name: "Exclude" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(["!review.ready"]);

    rerender(
      <VisualFiltersMenu
        activeIds={["!review.ready"]}
        resultFiltersEnabled
        optionCounts={optionCounts}
        matchingSummary={{ matching: 3, total: 4 }}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Ready for review (excluded)" }),
    ).toBeChecked();
    expect(
      screen.getByTestId("visual-filter-option-count-review.ready"),
    ).toHaveTextContent("1");
    expect(
      screen.getByTestId("visual-filter-option-count-review.ready").querySelector("s"),
    ).not.toBeNull();
    expect(screen.getByText("(excluded)", { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId("visual-filter-match-summary")).toHaveTextContent(
      "Showing 3 of 4 stories",
    );
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
        matchingSummary={{ matching: 2, total: 5 }}
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
