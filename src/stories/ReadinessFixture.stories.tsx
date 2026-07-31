import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { expect, within } from "storybook/test";

const meta = {
  title: "Visual Delta/Readiness Fixture",
  tags: ["test", "visual-delta-self-test"],
  parameters: {
    docs: {
      description: {
        component: [
          "Manager-only readiness fixture. It is excluded from product visual captures without supplying a provisional baseline.",
          "See **Readiness Fixture/Guidance** for Spec links (`VD-CAP-*`, `VD-UI-001` / VD-GAP-005).",
        ].join(" "),
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const DelayedMissingBaseline: Story = {
  name: "Delayed missing baseline",
  tags: ["skip-visual"],
  render: () => (
    <div data-testid="delayed-missing-subject">
      Delayed story without a baseline
    </div>
  ),
  play: async ({ canvasElement }) => {
    canvasElement.dataset.visualDeltaDelayedMissing = "pending";
    await new Promise((resolve) => window.setTimeout(resolve, 6_000));
    canvasElement.dataset.visualDeltaDelayedMissing = "complete";
    await expect(
      within(canvasElement).getByTestId("delayed-missing-subject"),
    ).toBeInTheDocument();
  },
};
