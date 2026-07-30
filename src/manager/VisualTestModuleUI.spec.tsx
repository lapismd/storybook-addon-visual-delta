import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "../test/render.js";
import { VisualTestModuleUI } from "./VisualTestModuleUI.js";

afterEach(() => {
  cleanup();
});

vi.mock("storybook/internal/components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("storybook/internal/components")>();
  return {
    ...actual,
    WithTooltip: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    TooltipNote: () => null,
    PopoverProvider: ({
      children,
      popover,
      visible,
    }: {
      children: React.ReactNode;
      popover: () => React.ReactNode;
      visible?: boolean;
    }) => (
      <>
        {children}
        {visible ? <div data-testid="popover">{popover()}</div> : null}
      </>
    ),
  };
});

const baseProps = {
  statusLine: "Not run",
  runVisualEnabled: true,
  runDiffEnabled: false,
  createBaselinesEnabled: false,
  updateStatusEnabled: false,
  affectedOnlyEnabled: true,
  affectedSummaryLabel: "2 affected · 275 unchanged",
  baselineMode: "create" as const,
  runnerBusy: false,
  anyActionSelected: true,
  compareChipStatus: "unknown" as const,
  compareChipLabel: "Run tests to see results",
  compareChipCount: null,
  compareChipDisabled: true,
  baselineChipStatus: "unknown" as const,
  baselineChipTooltip: "Create missing Baselines",
  statusChipStatus: "unknown" as const,
  statusChipLabel: null,
  isWritingBaselines: false,
  isUpdatingStatus: false,
  isCompareRunning: false,
  onRunVisualChange: vi.fn(),
  onRunDiffChange: vi.fn(),
  onCreateBaselinesChange: vi.fn(),
  onUpdateStatusChange: vi.fn(),
  onAffectedOnlyChange: vi.fn(),
  onBaselineModeChange: vi.fn(),
  onRun: vi.fn(),
  onStop: vi.fn(),
  onOpenCompareResults: vi.fn(),
  onOpenBaselineStatus: vi.fn(),
  onOpenStatusResults: vi.fn(),
};

describe("VisualTestModuleUI", () => {
  it("renders global heading, Not run, and default checkbox state", () => {
    renderWithTheme(<VisualTestModuleUI variant="global" {...baseProps} />);
    const root = screen.getByTestId("visual-test-module-global");
    expect(
      root.querySelector("#visual-testing-module-description-global"),
    ).toHaveTextContent("Not run");
    expect(root.querySelector('input[name="Run visual tests"]')).toBeChecked();
    expect(root.querySelector('input[name="Run Diff"]')).not.toBeChecked();
    expect(
      root.querySelector('input[name="Create missing Baselines"]'),
    ).not.toBeChecked();
    expect(root.querySelector('input[name="Update status"]')).not.toBeChecked();
    expect(root.querySelector('input[name="Affected only"]')).toBeChecked();
    expect(screen.getByTestId("affected-run-summary")).toHaveTextContent(
      "2 affected · 275 unchanged",
    );
    expect(root.querySelector('input[name="Rebuild static"]')).toBeNull();
    expect(
      Array.from(root.querySelectorAll('input[type="checkbox"]')).map((input) =>
        input.getAttribute("name"),
      ),
    ).toEqual([
      "Create missing Baselines",
      "Run visual tests",
      "Run Diff",
      "Affected only",
      "Update status",
    ]);
  });

  it("shows Update baselines label when rewrite mode is selected", () => {
    renderWithTheme(
      <VisualTestModuleUI
        variant="context"
        {...baseProps}
        baselineMode="rewrite"
        baselineChipTooltip="Update baselines"
      />,
    );
    const root = screen.getByTestId("visual-test-module-context");
    expect(
      root.querySelector('input[name="Update baselines"]'),
    ).toBeInTheDocument();
    expect(
      Array.from(root.querySelectorAll('input[type="checkbox"]')).map((input) =>
        input.getAttribute("name"),
      ),
    ).toEqual([
      "Update baselines",
      "Run visual tests",
      "Run Diff",
      "Update status",
    ]);
    expect(root.querySelector('input[name="Rebuild static"]')).toBeNull();
  });

  it("disables play when no action is selected", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    renderWithTheme(
      <VisualTestModuleUI
        variant="global"
        {...baseProps}
        anyActionSelected={false}
        statusLine="Select at least one action"
        onRun={onRun}
      />,
    );
    const root = screen.getByTestId("visual-test-module-global");
    const scope = within(root);
    expect(scope.getByText("Select at least one action")).toBeInTheDocument();
    const play = scope.getByRole("button", {
      name: /^Run selected visual actions/,
    });
    // Storybook Button uses aria-disabled rather than the native disabled attr.
    expect(play).toHaveAttribute("aria-disabled", "true");
    await user.click(play);
    expect(onRun).not.toHaveBeenCalled();
  });

  it("runs when play is enabled", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    renderWithTheme(
      <VisualTestModuleUI variant="global" {...baseProps} onRun={onRun} />,
    );
    const root = screen.getByTestId("visual-test-module-global");
    await user.click(
      within(root).getByRole("button", {
        name: /^Run selected visual actions/,
      }),
    );
    expect(onRun).toHaveBeenCalledOnce();
  });

  it("shows custom filters only in the global module", () => {
    const filters = {
      activeIds: ["review.ready"],
      resultFiltersEnabled: true,
      onChange: vi.fn(),
    };
    const { rerender } = renderWithTheme(
      <VisualTestModuleUI
        variant="global"
        {...baseProps}
        visualFilters={filters}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Filter visual stories, 1 active",
      }),
    ).toBeInTheDocument();

    rerender(
      <VisualTestModuleUI
        variant="context"
        {...baseProps}
        visualFilters={filters}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /filter visual stories/i }),
    ).not.toBeInTheDocument();
  });

  it("shows row progress under active checkboxes and streams the title", () => {
    const statusLine = "✓ shadcn-disclosure-accordion--opens-a-section (1/2)";
    renderWithTheme(
      <VisualTestModuleUI
        variant="context"
        {...baseProps}
        statusLine={statusLine}
        createBaselinesEnabled
        updateStatusEnabled
        isCompareRunning
        isWritingBaselines
        isUpdatingStatus
        runnerBusy
        compareRowProgress="1/2"
        baselineRowProgress="1/1"
        statusRowProgress="0/2"
      />,
    );
    const root = screen.getByTestId("visual-test-module-context");
    const description = root.querySelector(
      "#visual-testing-module-description-context",
    );
    expect(description).toHaveTextContent(statusLine);
    expect(description).toHaveAttribute("title", statusLine);
    expect(description).toHaveStyle({ width: "180px", maxWidth: "180px" });
    expect(within(root).getByTestId("compare-row-progress")).toHaveTextContent(
      "1/2",
    );
    expect(within(root).getByTestId("baseline-row-progress")).toHaveTextContent(
      "1/1",
    );
    expect(within(root).getByTestId("status-row-progress")).toHaveTextContent(
      "0/2",
    );
  });

  it("shows preflight activity without presenting comparison as started", () => {
    const statusLine = "Rebuilding Storybook static… 12s";
    renderWithTheme(
      <VisualTestModuleUI
        variant="global"
        {...baseProps}
        statusLine={statusLine}
        runnerBusy
        isCompareRunning={false}
      />,
    );

    const root = screen.getByTestId("visual-test-module-global");
    expect(
      root.querySelector("#visual-testing-module-description-global"),
    ).toHaveTextContent(statusLine);
    expect(
      within(root).queryByTestId("compare-row-progress"),
    ).not.toBeInTheDocument();
    expect(
      within(root).getByRole("button", {
        name: "Run tests to see results",
      }),
    ).toBeInTheDocument();
  });
});
