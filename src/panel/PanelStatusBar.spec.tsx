import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
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
    expect(screen.getByRole("status")).toHaveStyle({
      width: "400px",
      borderLeft: "none",
      borderTopLeftRadius: "0",
    });
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
    expect(screen.getByRole("status")).toHaveStyle({
      width: "400px",
      borderLeft: "none",
      borderTopLeftRadius: "0",
      pointerEvents: "auto",
    });

    view.rerender(
      <PanelStatusBar
        container={container}
        running={false}
        label={null}
        log={null}
        error={null}
      />,
    );
    expect(screen.getByRole("status")).toHaveStyle({
      pointerEvents: "none",
    });

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

  it("surfaces an icon-led OS-left and Browser-right split control", () => {
    class ResizeObserverStub {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 200 });
    container.getBoundingClientRect = () =>
      ({ right: 800, bottom: 600, width: 400 }) as DOMRect;
    document.body.appendChild(container);
    const onBrowserChange = vi.fn();
    const onPlatformChange = vi.fn();

    renderWithTheme(
      <PanelStatusBar
        container={container}
        running={false}
        environment={{
          browser: "chromium",
          platform: "darwin",
          browsers: [
            { value: "chromium", label: "Chromium" },
            { value: "webkit", label: "WebKit (view only)" },
          ],
          platforms: [
            { value: "darwin", label: "macOS" },
            { value: "linux", label: "Linux (view only)" },
          ],
          onBrowserChange,
          onPlatformChange,
        }}
      />,
    );

    const environmentGroup = screen.getByRole("group", {
      name: "Visual baseline environment",
    });
    const environmentButtons = within(environmentGroup).getAllByRole("button");
    expect(environmentButtons[0]).toHaveAccessibleName(
      "Visual baseline operating system",
    );
    expect(environmentButtons[0]).toHaveTextContent("macOS");
    expect(environmentButtons[0]?.querySelector("svg")).not.toBeNull();
    expect(environmentButtons[1]).toHaveAccessibleName(
      "Visual baseline browser",
    );
    expect(environmentButtons[1]).toHaveTextContent("Chromium");
    expect(environmentButtons[1]?.querySelector("svg")).not.toBeNull();

    fireEvent.click(environmentButtons[0]!);
    fireEvent.click(
      screen.getByRole("button", { name: "Linux (view only)" }),
    );
    fireEvent.click(environmentButtons[1]!);
    fireEvent.click(
      screen.getByRole("button", { name: "WebKit (view only)" }),
    );
    expect(onBrowserChange).toHaveBeenCalledWith("webkit");
    expect(onPlatformChange).toHaveBeenCalledWith("linux");
    expect(screen.getByRole("status")).toHaveStyle({ width: "400px" });

    container.remove();
    vi.unstubAllGlobals();
  });
});
