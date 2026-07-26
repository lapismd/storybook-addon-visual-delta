import React from "react";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithTheme } from "../test/render.js";
import { ImageLightbox } from "./ImageLightbox.js";

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

describe("ImageLightbox", () => {
  it("opens at native size, centers by axis, and closes accessibly", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithTheme(
      <ImageLightbox
        image={{
          src: "baseline.png",
          label: "Baseline",
          width: 1280,
          height: 900,
        }}
        onClose={onClose}
      />,
    );

    expect(
      await screen.findByRole("dialog", { name: "Baseline full image" }),
    ).toBeVisible();
    expect(screen.getByTestId("image-lightbox")).toHaveAttribute(
      "data-zoom-mode",
      "custom",
    );
    expect(screen.getByTestId("image-lightbox")).toHaveAttribute(
      "data-zoom-scale",
      "1.0000",
    );
    expect(screen.getByAltText("Baseline full image")).toHaveStyle({
      width: "1280px",
      height: "900px",
    });
    expect(screen.getByTestId("image-lightbox-centerer")).toHaveStyle({
      minWidth: "100%",
      minHeight: "100%",
    });

    const zoom = screen.getByLabelText("Image zoom percentage");
    await user.clear(zoom);
    await user.type(zoom, "137{Enter}");
    expect(screen.getByTestId("image-lightbox")).toHaveAttribute(
      "data-zoom-scale",
      "1.3700",
    );

    await user.click(screen.getByRole("button", { name: "Close modal" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("measures the painted viewport before applying explicit Fit", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <ImageLightbox
        image={{
          src: "baseline.png",
          label: "Baseline",
          width: 1280,
          height: 900,
        }}
        onClose={vi.fn()}
      />,
    );

    const viewport = await screen.findByTestId("image-lightbox-viewport");
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 640,
      bottom: 450,
      width: 640,
      height: 450,
      toJSON: () => ({}),
    });
    await user.click(screen.getByRole("switch", { name: /Fit full image/ }));

    expect(screen.getByTestId("image-lightbox")).toHaveAttribute(
      "data-zoom-mode",
      "fit",
    );
    expect(screen.getByTestId("image-lightbox")).toHaveAttribute(
      "data-zoom-scale",
      "0.5000",
    );
    expect(screen.getByAltText("Baseline full image")).toHaveStyle({
      width: "640px",
      height: "450px",
    });
  });
});
