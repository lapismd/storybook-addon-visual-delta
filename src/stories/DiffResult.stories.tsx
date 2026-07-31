import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { DiffResultFixture } from "./DiffResultFixture.js";
import { ThemeHost } from "./ThemeHost.js";

const meta = {
  title: "Visual Delta/Diff Result",
  tags: ["test", "skip-visual", "visual-delta-self-test"],
  parameters: {
    docs: {
      description: {
        component: [
          "Deterministic real DiffResult fixtures for viewport diagnostics and responsive compare zoom.",
          "See **Diff Result/Guidance** and Spec `VD-UI-005` (Panel and preview — comparison views).",
        ].join(" "),
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

const play =
  (expectsOverflow: boolean) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByLabelText(/Visual compare/),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Capture diagnostics")).toBeInTheDocument();
    const compare = canvas.getByLabelText(/Visual compare/);
    await expect(compare).toHaveAttribute("data-zoom-mode", "custom");
    await expect(compare).toHaveAttribute("data-zoom-scale", "1.0000");
    const viewport = canvas.getByTestId("compare-scroll-viewport");
    await expect(
      Number.parseFloat(getComputedStyle(viewport).minHeight),
    ).toBeGreaterThanOrEqual(300);
    const baselinePane = canvas.getByTestId("compare-baseline-scroll");
    const newPane = canvas.getByTestId("compare-new-scroll");
    await waitFor(() => {
      expect(
        Math.abs(baselinePane.clientWidth - newPane.clientWidth),
      ).toBeLessThanOrEqual(1);
      expect(baselinePane.clientWidth).toBeGreaterThan(0);
    });
    if (expectsOverflow) {
      await waitFor(() => {
        expect(baselinePane.scrollWidth).toBeGreaterThan(
          baselinePane.clientWidth,
        );
      });
      const nextLeft = Math.min(
        80,
        baselinePane.scrollWidth - baselinePane.clientWidth,
      );
      baselinePane.scrollLeft = nextLeft;
      const EventConstructor = canvasElement.ownerDocument.defaultView?.Event;
      if (!EventConstructor) throw new Error("Story window is unavailable");
      baselinePane.dispatchEvent(new EventConstructor("scroll"));
      await waitFor(() => {
        expect(newPane.scrollLeft).toBe(nextLeft);
        expect(canvas.getByTestId("compare-shared-scroll-x").scrollLeft).toBe(
          nextLeft,
        );
      });
    }
    await userEvent.click(
      canvas.getByRole("switch", { name: "Zoom in compare view" }),
    );
    await expect(compare).toHaveAttribute("data-zoom-scale", "1.1000");
    await waitFor(() => {
      expect(
        Math.abs(baselinePane.clientWidth - newPane.clientWidth),
      ).toBeLessThanOrEqual(1);
      expect(baselinePane.clientWidth).toBeGreaterThan(0);
    });
    for (const tab of ["Swipe", "Diff", "Focus", "Blink", "2-up"]) {
      await userEvent.click(canvas.getByRole("tab", { name: tab }));
      await expect(compare).toHaveAttribute("data-zoom-scale", "1.1000");
    }
    await userEvent.click(
      canvas.getByRole("switch", {
        name: /Fit compare view/,
      }),
    );
    await expect(compare).toHaveAttribute("data-zoom-mode", "fit");

    await userEvent.click(canvas.getByRole("tab", { name: "Blink" }));
    const blinkLabel = canvas.getByTestId("blink-label-row");
    await expect(blinkLabel.nextElementSibling).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/blink image full size/),
    );

    await userEvent.click(canvas.getByRole("tab", { name: "Diff" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Open Diff full image" }),
    );
    const documentScope = within(canvasElement.ownerDocument.body);
    await expect(
      await documentScope.findByRole("dialog", { name: "Diff full image" }),
    ).toBeVisible();
    await expect(documentScope.getByTestId("image-lightbox")).toHaveAttribute(
      "data-zoom-mode",
      "custom",
    );
    await expect(documentScope.getByTestId("image-lightbox")).toHaveAttribute(
      "data-zoom-scale",
      "1.0000",
    );
    const imageZoom = documentScope.getByLabelText("Image zoom percentage");
    await userEvent.clear(imageZoom);
    await userEvent.type(imageZoom, "137{Enter}");
    await expect(documentScope.getByTestId("image-lightbox")).toHaveAttribute(
      "data-zoom-scale",
      "1.3700",
    );
    await userEvent.click(
      documentScope.getByRole("button", { name: "Close modal" }),
    );
  };

export const ComponentClippedResult: Story = {
  name: "Component clipped result",
  render: () => (
    <ThemeHost>
      <DiffResultFixture cssWidth={560} cssHeight={180} label="Component" />
    </ThemeHost>
  ),
  play: play(false),
};

export const FullViewportResult: Story = {
  name: "Full viewport result",
  render: () => (
    <ThemeHost>
      <DiffResultFixture cssWidth={1280} cssHeight={900} label="Viewport" />
    </ThemeHost>
  ),
  play: play(true),
};

export const WideResult: Story = {
  name: "Wide result",
  render: () => (
    <ThemeHost>
      <DiffResultFixture cssWidth={1440} cssHeight={480} label="Wide" />
    </ThemeHost>
  ),
  play: play(true),
};

export const TallResult: Story = {
  name: "Tall result",
  render: () => (
    <ThemeHost>
      <DiffResultFixture cssWidth={600} cssHeight={1200} label="Tall" />
    </ThemeHost>
  ),
  play: play(true),
};
