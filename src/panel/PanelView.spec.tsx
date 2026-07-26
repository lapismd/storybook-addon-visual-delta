import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithTheme } from "../test/render.js";
import { PanelView, type PanelViewHeaderProps } from "./PanelView.js";

const noop = () => undefined;
const header: PanelViewHeaderProps = {
  badgeStatus: null,
  empty: true,
  busy: false,
  storyMissing: false,
  isDiffing: false,
  isRunning: false,
  diffProgressLabel: null,
  runProgressLabel: null,
  createLabel: "Create baseline",
  reviewStatus: null,
  skipVisual: false,
  onDiff: noop,
  onRun: noop,
  diffEngine: "html",
  onDiffEngineChange: noop,
  onCreate: noop,
  onUpdateBaselines: noop,
  onRebuildStatic: noop,
  onResetSettings: noop,
  onStopDiff: noop,
  onStopRun: noop,
  onReviewStatus: noop,
  onAccept: noop,
  onUnaccept: noop,
  onToggleSkipVisual: noop,
  onOpenConfiguration: noop,
  isUpdating: false,
  isRebuilding: false,
};

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

describe("PanelView", () => {
  it("renders the shared summary and content surface", () => {
    renderWithTheme(
      <PanelView
        standalone
        header={header}
        summary={<div>Passed summary</div>}
        content={<div>Real panel content</div>}
        status={{ running: false, label: null, log: null, error: null }}
      />,
    );

    expect(screen.getByTestId("visual-delta-panel")).toBeInTheDocument();
    expect(screen.getByText("Passed summary")).toBeInTheDocument();
    expect(screen.getByText("Real panel content")).toBeInTheDocument();
  });

  it("prioritises configuration and recovers to content on rerender", () => {
    const view = renderWithTheme(
      <PanelView
        standalone
        header={header}
        summary={<div>Summary</div>}
        configuration={<div>Structured configuration</div>}
        content={<div>Panel content</div>}
        status={{ running: false, label: null, log: null, error: null }}
      />,
    );

    expect(screen.getByText("Structured configuration")).toBeInTheDocument();
    expect(screen.queryByText("Panel content")).toBeNull();

    view.rerender(
      <PanelView
        standalone
        header={header}
        summary={<div>Summary</div>}
        content={<div>Panel content</div>}
        status={{ running: false, label: null, log: null, error: null }}
      />,
    );
    expect(screen.getByText("Panel content")).toBeInTheDocument();
  });
});
