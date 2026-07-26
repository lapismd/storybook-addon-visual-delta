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
  it("opens fitted, supports custom and 100% zoom, and closes accessibly", async () => {
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
      "fit",
    );

    const zoom = screen.getByLabelText("Image zoom percentage");
    await user.clear(zoom);
    await user.type(zoom, "137{Enter}");
    expect(screen.getByTestId("image-lightbox")).toHaveAttribute(
      "data-zoom-scale",
      "1.3700",
    );

    await user.click(
      screen.getByRole("switch", { name: "Show full image at 100%" }),
    );
    expect(screen.getByAltText("Baseline full image")).toHaveStyle({
      width: "1280px",
      height: "900px",
    });

    await user.click(screen.getByRole("button", { name: "Close modal" }));
    expect(onClose).toHaveBeenCalled();
  });
});
