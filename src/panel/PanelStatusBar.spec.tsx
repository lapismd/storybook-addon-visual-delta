import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithTheme } from "../test/render.js";
import { lastMeaningfulLogLine, PanelStatusBar } from "./PanelStatusBar.js";

afterEach(() => {
  cleanup();
});

vi.mock("storybook/internal/components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("storybook/internal/components")>();
  return {
    ...actual,
    ScrollArea: ({
      children,
      ...rest
    }: {
      children: React.ReactNode;
      ref?: React.Ref<HTMLDivElement>;
    }) => (
      <div data-testid="scroll-area" {...rest}>
        {children}
      </div>
    ),
    PopoverProvider: ({
      children,
      popover,
      visible,
      ariaLabel,
      onVisibleChange,
    }: {
      children: React.ReactNode;
      popover: () => React.ReactNode;
      visible?: boolean;
      ariaLabel?: string;
      onVisibleChange?: (visible: boolean) => void;
    }) => (
      <div
        data-testid="status-popover"
        data-aria-label={ariaLabel}
        onClick={() => onVisibleChange?.(!visible)}
      >
        {children}
        {visible ? <div data-testid="popover">{popover()}</div> : null}
      </div>
    ),
  };
});

describe("lastMeaningfulLogLine", () => {
  it("returns the last non-empty line", () => {
    expect(lastMeaningfulLogLine("a\nb\n\n")).toBe("b");
    expect(lastMeaningfulLogLine("only")).toBe("only");
    expect(lastMeaningfulLogLine("\r\n  \r\n")).toBe("");
  });
});

describe("PanelStatusBar", () => {
  it("renders the clipped log line without throwing", () => {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);

    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 200 });
    container.getBoundingClientRect = () =>
      ({
        right: 800,
        bottom: 600,
        width: 400,
        height: 200,
        top: 400,
        left: 400,
        x: 400,
        y: 400,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(container);

    renderWithTheme(
      <PanelStatusBar
        container={container}
        running
        label="Working…"
        log={"starting\n✓ shadcn-disclosure-accordion--opens-a-section (1/2)\n"}
        error={null}
        progress={{ completed: 1, total: 2 }}
      />,
    );

    const logButton = screen.getByRole("button", {
      name: /Progress: ✓ shadcn-disclosure-accordion--opens-a-section \(1\/2\)/,
    });
    expect(logButton).toBeTruthy();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "1 of 2 checks complete",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveStyle({ width: "400px" });
    expect(screen.getByTestId("status-popover")).toHaveAttribute(
      "data-aria-label",
      "Visual Delta progress log",
    );
    fireEvent.click(logButton);
    expect(screen.getByTestId("popover")).toHaveTextContent("starting");

    container.remove();
    vi.unstubAllGlobals();
  });

  it("keeps idle logs compact and uses an indeterminate bar without totals", () => {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);

    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 200 });
    container.getBoundingClientRect = () =>
      ({
        right: 800,
        bottom: 600,
        width: 400,
        height: 200,
        top: 400,
        left: 400,
        x: 400,
        y: 400,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(container);

    const view = renderWithTheme(
      <PanelStatusBar
        container={container}
        running={false}
        label={null}
        log={"Visual: 2 passed\n"}
        error={null}
      />,
    );

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("status")).toHaveStyle({ width: "200px" });

    view.rerender(
      <PanelStatusBar
        container={container}
        running
        label="Preparing checks…"
        log={null}
        error={null}
        progress={{ completed: 0, total: 0 }}
      />,
    );

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).not.toHaveAttribute("aria-valuenow");
    expect(progressbar).not.toHaveAttribute("aria-valuemax");
    expect(progressbar).toHaveAttribute("aria-valuetext", "Preparing checks…");
    expect(screen.getByRole("status")).toHaveStyle({ width: "400px" });

    container.remove();
    vi.unstubAllGlobals();
  });
});
