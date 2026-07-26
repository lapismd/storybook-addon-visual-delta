import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithTheme } from "../test/render.js";
import { CompareView } from "./CompareView.js";

beforeEach(() => {
  class ResizeObserverStub {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
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
    const swipe = screen.getByRole("img", { name: /Swipe comparison/ });
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
      screen.getByRole("img", {
        name: "Swipe comparison, 25% baseline revealed",
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
});
