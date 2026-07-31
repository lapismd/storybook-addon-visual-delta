import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { DemoFilterChip, DemoFrame } from "./demo-subjects.js";

const meta = {
  title: "Examples/Filter Chip",
  tags: ["skip-visual"],
  parameters: {
    visualDelta: {
      images: ["/visual-baselines/examples/filter-chip/default.png"],
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Default: Story = {
  name: "Default",
  render: () => (
    <DemoFrame>
      <DemoFilterChip />
    </DemoFrame>
  ),
};
