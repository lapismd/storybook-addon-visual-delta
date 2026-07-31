import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import OverlayChipDemo from "./OverlayChipDemo.svelte";
import OverlaySessionDemo from "./OverlaySessionDemo.svelte";
import SplitInsetDemo from "./SplitInsetDemo.svelte";
import { isPreviewChipVisible } from "../shared/preview-chip.js";
import { SvelteHost } from "./SvelteHost.js";

const meta = {
  title: "Visual Delta/Compare Alignment",
  tags: ["skip-visual"],
  parameters: {
    docs: {
      description: {
        component:
          "Regression fixtures for Visual Delta split inset sync and overlay session behaviour. Tagged skip-visual (meta tooling, not product UI).",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const SubjectWithVerticalMargin: Story = {
  name: "Subject with vertical margin",
  render: () => (
    <SvelteHost
      component={SplitInsetDemo}
      props={{ subjectMarginYPx: 8, canvasPaddingPx: 24 }}
    />
  ),
  play: async ({ canvas }) => {
    const demo = await waitFor(() => canvas.getByTestId("split-inset-demo"));
    await waitFor(() => {
      expect(demo.getAttribute("data-pane-padding-top")).toBe("32px");
    });
    await waitFor(() => {
      const delta = Number(demo.getAttribute("data-delta-top"));
      expect(Math.abs(delta)).toBeLessThan(0.75);
    });
    await expect(canvas.getByTestId("pane-padding-top")).toHaveTextContent(
      "32px",
    );
  },
};

export const SubjectWithoutMargin: Story = {
  name: "Subject without margin",
  render: () => (
    <SvelteHost
      component={SplitInsetDemo}
      props={{ subjectMarginYPx: 0, canvasPaddingPx: 24 }}
    />
  ),
  play: async ({ canvas }) => {
    const demo = await waitFor(() => canvas.getByTestId("split-inset-demo"));
    await waitFor(() => {
      expect(demo.getAttribute("data-pane-padding-top")).toBe("24px");
    });
    await waitFor(() => {
      const delta = Number(demo.getAttribute("data-delta-top"));
      expect(Math.abs(delta)).toBeLessThan(0.75);
    });
  },
};

export const SoftHideKeepsSelection: Story = {
  name: "Soft hide keeps selection",
  render: () => <SvelteHost component={OverlaySessionDemo} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("overlay-on")).toHaveTextContent("true");
    await expect(canvas.getByTestId("placement")).toHaveTextContent("left");
    await expect(canvas.getByTestId("index")).toHaveTextContent("0");

    await userEvent.click(canvas.getByTestId("place-left"));
    await expect(canvas.getByTestId("overlay-on")).toHaveTextContent("false");
    await expect(canvas.getByTestId("index")).toHaveTextContent("0");
    await expect(canvas.getByTestId("last-action")).toHaveTextContent(
      "soft-hide",
    );

    await userEvent.click(canvas.getByTestId("place-left"));
    await expect(canvas.getByTestId("overlay-on")).toHaveTextContent("true");
    await expect(canvas.getByTestId("placement")).toHaveTextContent("left");

    await userEvent.click(canvas.getByTestId("reveal-center"));
    await expect(canvas.getByTestId("overlay-on")).toHaveTextContent("true");
    await expect(canvas.getByTestId("placement")).toHaveTextContent("center");
    await expect(canvas.getByTestId("index")).toHaveTextContent("0");
  },
};

export const BaselineChipOnOverlayPlacements: Story = {
  name: "Baseline chip on overlay placements",
  render: () => <SvelteHost component={OverlayChipDemo} />,
  play: async ({ canvas }) => {
    const demo = await waitFor(() => canvas.getByTestId("overlay-chip-demo"));
    const scope = within(demo);

    await waitFor(() => {
      expect(demo.getAttribute("data-visible-chips")).toBe("5");
    });
    await expect(scope.getByTestId("visible-chip-count")).toHaveTextContent(
      "5",
    );

    for (const placement of ["above", "left", "center", "right", "below"]) {
      const cell = scope.getByTestId(`chip-placement-${placement}`);
      const overlay = within(cell).getByTestId(`demo-overlay-${placement}`);
      const chip = within(overlay).getByTestId("baseline-overlay-chip");
      await expect(chip).toHaveTextContent("Baseline");
      expect(chip.parentElement).toBe(overlay);
      expect(isPreviewChipVisible(chip)).toBe(true);
      const chipRect = chip.getBoundingClientRect();
      const imageRect = within(overlay)
        .getByText("Baseline PNG")
        .getBoundingClientRect();
      expect(chipRect.top).toBeGreaterThanOrEqual(imageRect.top);
      expect(chipRect.bottom).toBeLessThanOrEqual(imageRect.bottom);
      if (placement !== "center") {
        const pane = within(cell).getByTestId(
          `demo-baseline-pane-${placement}`,
        );
        expect(pane.contains(overlay)).toBe(true);
      }
    }
  },
};

export const BaselineChipProjectOffsets: Story = {
  name: "Baseline chip project offsets",
  render: () => (
    <SvelteHost
      component={OverlayChipDemo}
      props={{
        placements: ["right"],
        baselineLabelOffset: { x: 12, y: -4 },
      }}
    />
  ),
  play: async ({ canvas }) => {
    const demo = await waitFor(() => canvas.getByTestId("overlay-chip-demo"));
    const overlay = within(demo).getByTestId("demo-overlay-right");
    const chip = within(overlay).getByTestId("baseline-overlay-chip");
    const image = within(overlay).getByText("Baseline PNG");
    await waitFor(() => {
      expect(chip.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        image.getBoundingClientRect().top,
      );
    });
    await expect(chip).toHaveStyle({ left: "18px" });
  },
};
