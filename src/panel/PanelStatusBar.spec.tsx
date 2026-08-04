import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  it("keeps Stop reachable in the persistent footer outside the log popover", () => {
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
    const onStop = vi.fn();

    renderWithTheme(
      <PanelStatusBar
        container={container}
        running
        label="Testing…"
        log="running"
        onStop={onStop}
      />,
    );

    const stop = screen.getByRole("button", { name: "Stop visual run" });
    expect(stop.closest('[data-testid="status-popover"]')).toBeNull();
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledOnce();

    container.remove();
    vi.unstubAllGlobals();
  });

  it("renders safe ANSI in the footer and full ANSI in the copied log", async () => {
    class ResizeObserverStub {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 200 });
    container.getBoundingClientRect = () =>
      ({ right: 800, bottom: 600, width: 400 }) as DOMRect;
    document.body.appendChild(container);

    renderWithTheme(
      <PanelStatusBar
        container={container}
        running
        label="Working…"
        log={
          "\u001b]8;;https://example.invalid\u0007plain <script>safe</script>\u001b]8;;\u0007\n" +
          "\u001b[31;42;1;7mFailed safely\u001b[0m"
        }
        error={null}
      />,
    );

    const logButton = screen.getByRole("button", {
      name: "Progress: Failed safely",
    });
    expect(logButton.textContent).not.toContain("\u001b");
    const compactFailure = within(logButton).getByText("Failed safely");
    expect(compactFailure).toHaveAttribute(
      "data-ansi-foreground",
      "standard-1",
    );
    expect(compactFailure.style.color).not.toBe("");
    expect(compactFailure.style.backgroundColor).toBe("");
    expect(compactFailure).toHaveStyle({ fontWeight: "700" });
    fireEvent.click(logButton);

    const popover = screen.getByTestId("popover");
    const terminalFailure = within(popover).getByText("Failed safely");
    expect(terminalFailure).toHaveAttribute(
      "data-ansi-foreground",
      "standard-1",
    );
    expect(terminalFailure).toHaveStyle({
      color: "#98c379",
      backgroundColor: "#e06c75",
      fontWeight: "700",
    });
    expect(popover).not.toHaveTextContent("example.invalid");
    expect(popover.textContent).not.toContain("\u001b");
    expect(popover.querySelector("script")).toBeNull();
    expect(popover).toHaveTextContent("plain <script>safe</script>");

    fireEvent.click(within(popover).getByRole("button", { name: "Copy log" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "plain <script>safe</script>\nFailed safely",
      ),
    );

    container.remove();
    vi.unstubAllGlobals();
  });

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
    const status = screen.getByRole("status");
    const computedStatus = getComputedStyle(status);
    expect(status.style.width).toBe("400px");
    expect(computedStatus.borderLeftStyle).toBe("none");
    expect(Number.parseFloat(computedStatus.borderTopLeftRadius)).toBe(0);
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
    const status = screen.getByRole("status");
    const computedStatus = getComputedStyle(status);
    expect(status.style.width).toBe("400px");
    expect(status.style.pointerEvents).toBe("auto");
    expect(computedStatus.borderLeftStyle).toBe("none");
    expect(Number.parseFloat(computedStatus.borderTopLeftRadius)).toBe(0);

    view.rerender(
      <PanelStatusBar
        container={container}
        running={false}
        label={null}
        log={null}
        error={null}
      />,
    );
    expect(status.style.pointerEvents).toBe("none");

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

  it("surfaces a read-only Profile-left and Browser-right split control", () => {
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

    renderWithTheme(
      <PanelStatusBar
        container={container}
        running={false}
        environment={{
          browser: "chromium",
          browsers: [
            { value: "chromium", label: "Chromium" },
            { value: "webkit", label: "WebKit (view only)" },
          ],
          onBrowserChange,
        }}
      />,
    );

    const environmentGroup = screen.getByRole("group", {
      name: "Visual baseline target",
    });
    const environmentButtons = within(environmentGroup).getAllByRole("button");
    const profile = within(environmentGroup).getByLabelText(
      "Canonical capture profile: Linux ARM64",
    );
    expect(profile).toHaveTextContent("Linux · ARM64");
    expect(profile.querySelector("svg")).not.toBeNull();
    expect(environmentButtons[0]).toHaveAccessibleName(
      "Visual baseline browser",
    );
    expect(environmentButtons[0]).toHaveTextContent("Chromium");
    expect(environmentButtons[0]?.querySelector("svg")).not.toBeNull();

    fireEvent.click(environmentButtons[0]!);
    fireEvent.click(
      screen.getByRole("button", { name: "WebKit (view only)" }),
    );
    expect(onBrowserChange).toHaveBeenCalledWith("webkit");
    expect(screen.getByRole("status")).toHaveStyle({ width: "400px" });

    container.remove();
    vi.unstubAllGlobals();
  });
});
