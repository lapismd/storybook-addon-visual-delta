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

function renderCompare() {
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
      defaultZoom="fit"
      resultKey="fixture"
    />,
  );
}

describe("CompareView zoom and coordinates", () => {
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
});
