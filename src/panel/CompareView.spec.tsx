import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "../test/render.js";
import { CompareView } from "./CompareView.js";

beforeEach(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderCompare(defaultZoom: "fit" | "100%" = "fit") {
  return renderWithTheme(
    <CompareView
      baselineSrc="baseline.png"
      actualSrc="actual.png"
      diffSrc="diff.png"
      focusSrc="focus.png"
      changeBounds={{ x: 900, y: 600, width: 900, height: 600 }}
      imageWidth={3840}
      imageHeight={2700}
      deviceScaleFactor={3}
      defaultZoom={defaultZoom}
      resultKey="fixture"
    />,
  );
}

describe("CompareView zoom and coordinates", () => {
  it("opens at 100% by default and reserves a 300px compare viewport", () => {
    renderWithTheme(
      <CompareView
        baselineSrc="baseline.png"
        actualSrc="actual.png"
        diffSrc="diff.png"
        focusSrc="focus.png"
        changeBounds={null}
        imageWidth={3696}
        imageHeight={60}
        deviceScaleFactor={3}
        resultKey="wide-component"
      />,
    );

    expect(screen.getByLabelText(/Visual compare/)).toHaveAttribute(
      "data-zoom-scale",
      "1.0000",
    );
    expect(screen.getByTestId("compare-scroll-viewport")).toHaveStyle({
      minHeight: "300px",
    });
    expect(screen.getByTestId("compare-baseline-scroll")).toBeInTheDocument();
    expect(screen.getByTestId("compare-new-scroll")).toBeInTheDocument();
  });

  it("derives native CSS dimensions from device scale and retains custom zoom across tabs", async () => {
    const user = userEvent.setup();
    renderCompare();
    const compare = screen.getByLabelText(/Visual compare/);

    await user.click(
      screen.getByRole("switch", { name: "Show compare view at 100%" }),
    );
    expect(compare).toHaveAttribute("data-zoom-scale", "1.0000");
    expect(screen.getByAltText("Baseline")).toHaveStyle({
      width: "1280px",
      height: "900px",
    });

    await user.click(
      screen.getByRole("switch", { name: "Zoom in compare view" }),
    );
    expect(compare).toHaveAttribute("data-zoom-scale", "1.1000");
    for (const tab of ["Swipe", "Diff", "Focus", "Blink", "2-up"]) {
      await user.click(screen.getByRole("tab", { name: tab }));
      expect(compare).toHaveAttribute("data-zoom-scale", "1.1000");
    }
  });

  it("maps Swipe and Focus interactions in the scaled stage coordinate space", async () => {
    const user = userEvent.setup();
    renderCompare();
    await user.click(
      screen.getByRole("switch", { name: "Show compare view at 100%" }),
    );
    await user.click(screen.getByRole("tab", { name: "Swipe" }));
    const swipe = screen.getByRole("button", { name: /Swipe comparison/ });
    vi.spyOn(swipe, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 40,
      left: 100,
      top: 40,
      right: 1380,
      bottom: 940,
      width: 1280,
      height: 900,
      toJSON: () => ({}),
    });
    Object.defineProperty(swipe, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    fireEvent.pointerDown(swipe, { clientX: 420, pointerId: 1 });
    expect(
      screen.getByRole("button", {
        name: "Open Swipe comparison full image, 25% baseline revealed",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Focus" }));
    expect(screen.getByTestId("compare-stack").style.transform).toContain(
      "scale(",
    );
    await user.click(
      screen.getByRole("switch", {
        name: "Fit full image (exit zoom to change)",
      }),
    );
    expect(screen.getByTestId("compare-stack").style.transform).toBe("none");
  });

  it("opens static images in the shared lightbox", async () => {
    const user = userEvent.setup();
    renderCompare();

    const opener = screen.getByRole("button", {
      name: "Open Baseline full image",
    });
    await user.click(opener);
    expect(
      await screen.findByRole("dialog", { name: "Baseline full image" }),
    ).toBeVisible();
    expect(screen.getByAltText("Baseline full image")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close modal" }));
    await waitFor(() => expect(opener).toHaveFocus());

    await user.click(screen.getByRole("tab", { name: "Diff" }));
    await user.click(
      screen.getByRole("button", { name: "Open Diff full image" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Diff full image" }),
    ).toBeVisible();
  });

  it("opens the pre-drag Swipe source on click and suppresses opening after drag", async () => {
    const user = userEvent.setup();
    renderCompare();
    await user.click(screen.getByRole("tab", { name: "Swipe" }));
    const swipe = screen.getByRole("button", { name: /Swipe comparison/ });
    vi.spyOn(swipe, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 40,
      left: 100,
      top: 40,
      right: 1380,
      bottom: 940,
      width: 1280,
      height: 900,
      toJSON: () => ({}),
    });
    Object.defineProperties(swipe, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });

    fireEvent.pointerDown(swipe, {
      clientX: 300,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerUp(swipe, {
      clientX: 300,
      clientY: 100,
      pointerId: 1,
    });
    expect(
      await screen.findByRole("dialog", { name: "Baseline full image" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close modal" }));

    fireEvent.pointerDown(swipe, {
      clientX: 300,
      clientY: 100,
      pointerId: 2,
    });
    fireEvent.pointerMove(swipe, {
      clientX: 500,
      clientY: 100,
      pointerId: 2,
    });
    fireEvent.pointerUp(swipe, {
      clientX: 500,
      clientY: 100,
      pointerId: 2,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("places the Blink label above the image and reserves fit space", async () => {
    const user = userEvent.setup();
    renderCompare();
    await user.click(screen.getByRole("tab", { name: "Blink" }));

    const label = screen.getByTestId("blink-label-row");
    const image = screen.getByRole("button", { name: /blink image full size/ });
    expect(
      label.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(label).not.toHaveStyle({ position: "absolute" });
  });

  it("routes vertical wheel input over the tabs into the compare viewport", () => {
    renderCompare();
    const viewport = screen.getByTestId("compare-scroll-viewport");
    const toolbar = screen.getByTestId("compare-toolbar");
    expect(viewport.scrollTop).toBe(0);

    fireEvent.wheel(toolbar, { deltaY: 80, deltaX: 0 });
    expect(viewport.scrollTop).toBe(80);
  });

  it("keeps 2-up panes visible and synchronizes both scroll axes", async () => {
    renderCompare("100%");
    const waitForScrollSync = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    const baselinePane = screen.getByTestId("compare-baseline-scroll");
    const actualPane = screen.getByTestId("compare-new-scroll");
    const horizontalRail = screen.getByTestId("compare-shared-scroll-x");
    const verticalRail = screen.getByTestId("compare-shared-scroll-y");

    for (const pane of [baselinePane, actualPane]) {
      Object.defineProperties(pane, {
        clientWidth: { configurable: true, value: 320 },
        clientHeight: { configurable: true, value: 240 },
        scrollWidth: { configurable: true, value: 1280 },
        scrollHeight: { configurable: true, value: 900 },
      });
    }
    Object.defineProperties(horizontalRail, {
      clientWidth: { configurable: true, value: 652 },
      clientHeight: { configurable: true, value: 12 },
    });
    Object.defineProperties(verticalRail, {
      clientWidth: { configurable: true, value: 12 },
      clientHeight: { configurable: true, value: 264 },
    });

    fireEvent.load(screen.getByAltText("Baseline"));
    await waitFor(() =>
      expect(horizontalRail).toHaveStyle({ visibility: "visible" }),
    );
    expect(verticalRail).toHaveStyle({ visibility: "visible" });

    baselinePane.scrollLeft = 180;
    baselinePane.scrollTop = 90;
    fireEvent.scroll(baselinePane);

    expect(actualPane.scrollLeft).toBe(180);
    expect(actualPane.scrollTop).toBe(90);
    expect(horizontalRail.scrollLeft).toBe(180);
    expect(verticalRail.scrollTop).toBe(90);

    await waitForScrollSync();
    actualPane.scrollLeft = 240;
    actualPane.scrollTop = 120;
    fireEvent.scroll(actualPane);

    expect(baselinePane.scrollLeft).toBe(240);
    expect(baselinePane.scrollTop).toBe(120);
    expect(horizontalRail.scrollLeft).toBe(240);
    expect(verticalRail.scrollTop).toBe(120);

    await waitForScrollSync();
    horizontalRail.scrollLeft = 300;
    fireEvent.scroll(horizontalRail);

    expect(baselinePane.scrollLeft).toBe(300);
    expect(actualPane.scrollLeft).toBe(300);
    expect(baselinePane.scrollTop).toBe(120);
    expect(actualPane.scrollTop).toBe(120);

    await waitForScrollSync();
    verticalRail.scrollTop = 160;
    fireEvent.scroll(verticalRail);

    expect(baselinePane.scrollLeft).toBe(300);
    expect(actualPane.scrollLeft).toBe(300);
    expect(baselinePane.scrollTop).toBe(160);
    expect(actualPane.scrollTop).toBe(160);
  });
});
