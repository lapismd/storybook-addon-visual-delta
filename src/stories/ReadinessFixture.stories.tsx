import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { expect, within } from "storybook/test";
import {
  ReadinessSubject,
  waitForReadinessRelease,
} from "./ReadinessFixture.js";

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
  render: () => <ReadinessSubject />,
  play: async ({ canvasElement }) => {
    await waitForReadinessRelease(canvasElement);
    await expect(
      within(canvasElement).getByTestId("delayed-missing-subject"),
    ).toBeInTheDocument();
  },
};
