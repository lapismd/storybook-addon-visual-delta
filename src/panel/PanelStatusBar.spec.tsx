import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithTheme } from "../test/render.js";
import {
  lastMeaningfulLogLine,
  PanelStatusBar,
} from "./PanelStatusBar.js";

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
    }: {
      children: React.ReactNode;
      popover: () => React.ReactNode;
      visible?: boolean;
      ariaLabel?: string;
    }) => (
      <div data-testid="status-popover" data-aria-label={ariaLabel}>
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
      />,
    );

    expect(
      screen.getByRole("button", {
        name: /Progress: ✓ shadcn-disclosure-accordion--opens-a-section \(1\/2\)/,
      }),
    ).toBeTruthy();
    expect(screen.getByTestId("status-popover")).toHaveAttribute(
      "data-aria-label",
      "Visual Delta progress log",
    );

    container.remove();
    vi.unstubAllGlobals();
  });
});
