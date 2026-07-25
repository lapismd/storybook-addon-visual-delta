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
    WithTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
  createBaselinesEnabled: false,
  updateStatusEnabled: false,
  rebuildStaticEnabled: false,
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
  onCreateBaselinesChange: vi.fn(),
  onUpdateStatusChange: vi.fn(),
  onRebuildStaticChange: vi.fn(),
  onBaselineModeChange: vi.fn(),
  onRun: vi.fn(),
  onStop: vi.fn(),
  onOpenCompareResults: vi.fn(),
  onOpenBaselineStatus: vi.fn(),
  onOpenStatusResults: vi.fn(),
};

describe("VisualTestModuleUI", () => {
  it("renders global heading, Not run, and default checkbox state", () => {
    renderWithTheme(
      <VisualTestModuleUI variant="global" {...baseProps} />,
    );
    const root = screen.getByTestId("visual-test-module-global");
    expect(
      root.querySelector("#visual-testing-module-description-global"),
    ).toHaveTextContent("Not run");
    expect(
      root.querySelector('input[name="Run visual tests"]'),
    ).toBeChecked();
    expect(
      root.querySelector('input[name="Create missing Baselines"]'),
    ).not.toBeChecked();
    expect(
      root.querySelector('input[name="Update status"]'),
    ).not.toBeChecked();
    expect(
      root.querySelector('input[name="Rebuild static"]'),
    ).not.toBeChecked();
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

  it("shows row progress under active checkboxes and streams the title", () => {
    const statusLine =
      "✓ shadcn-disclosure-accordion--opens-a-section (1/2)";
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
});
