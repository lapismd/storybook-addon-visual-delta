import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { DemoModeBlock, ExampleStage } from "./demo-subjects.js";
import {
  EXAMPLE_SIZES,
  exampleBaseline,
  exampleVisualDelta,
} from "./example-sizes.js";

const meta = {
  title: "Examples/Modes",
  tags: ["visual-delta-examples"],
  parameters: {
    docs: {
      description: {
        component: `
Named **Compact** mode baseline alongside the Default primary image.

The story reads the \`exampleDensity\` global so switching Visual Delta modes remounts a Compact-sized subject that matches the Compact baseline geometry. Uses Story canvas alignment for component-sized captures.
`,
      },
    },
    visualDelta: exampleVisualDelta({
      images: [
        exampleBaseline("/visual-baselines/examples/modes/default.png"),
      ],
      modes: {
        Compact: {
          globals: { exampleDensity: "compact" },
          src: exampleBaseline(
            "/visual-baselines/examples/modes/compact.png",
          ),
        },
      },
    }),
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const DefaultAndCompact: Story = {
  name: "Default and compact",
  parameters: {
    docs: {
      description: {
        story:
          "Default mode uses the larger stage. Select Compact in Visual Delta to remount with `exampleDensity: compact` — stage shrinks to match the Compact baseline.",
      },
    },
  },
  render: (_args, { globals }) => {
    const compact = globals.exampleDensity === "compact";
    const size = compact ? EXAMPLE_SIZES.modesCompact : EXAMPLE_SIZES.modes;
    return (
      <ExampleStage {...size}>
        <DemoModeBlock compact={compact} />
      </ExampleStage>
    );
  },
};
