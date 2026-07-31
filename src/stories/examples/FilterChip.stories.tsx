import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { DemoFilterChip, ExampleStage } from "./demo-subjects.js";
import {
  EXAMPLE_SIZES,
  exampleBaseline,
  exampleVisualDelta,
} from "./example-sizes.js";

const meta = {
  title: "Examples/Filter Chip",
  tags: ["visual-delta-examples"],
  parameters: {
    docs: {
      description: {
        component:
          "Lightweight filter-flavored subject. Fixed stage size matches the wired baseline CSS box (PNG at 1× device scale). Uses Story canvas alignment.",
      },
    },
    visualDelta: exampleVisualDelta({
      images: [
        exampleBaseline("/visual-baselines/examples/filter-chip/default.png"),
      ],
    }),
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
          "Chip subject for overlay / Diff HTML exploration. Geometry and alignment should be clean; Diff HTML should match the live stage at 1×.",
      },
    },
  },
  render: () => (
    <ExampleStage {...EXAMPLE_SIZES.filterChip}>
      <DemoFilterChip />
    </ExampleStage>
  ),
};
