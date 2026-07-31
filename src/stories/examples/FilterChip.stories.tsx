import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { DemoFilterChip, ExampleStage } from "./demo-subjects.js";
import { EXAMPLE_SIZES, exampleBaseline } from "./example-sizes.js";

const meta = {
  title: "Examples/Filter Chip",
  tags: ["skip-visual"],
  parameters: {
    docs: {
      description: {
        component:
          "Lightweight filter-flavored subject. Fixed stage size matches the wired baseline CSS box (PNG at 1× device scale).",
      },
    },
    visualDelta: {
      images: [
        exampleBaseline("/visual-baselines/examples/filter-chip/default.png"),
      ],
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Default: Story = {
  name: "Default",
  parameters: {
    docs: {
      description: {
        story:
          "Chip subject for overlay / Diff HTML exploration. Geometry should match; PNG art is a simplified stand-in for the live chip.",
      },
    },
  },
  render: () => (
    <ExampleStage {...EXAMPLE_SIZES.filterChip}>
      <DemoFilterChip />
    </ExampleStage>
  ),
};
