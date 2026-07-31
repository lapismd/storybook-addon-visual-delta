import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { DemoFrame, DemoModeBlock } from "./demo-subjects.js";

const meta = {
  title: "Examples/Modes",
  tags: ["skip-visual"],
  parameters: {
    docs: {
      description: {
        component:
          "Named mode baseline wiring (Compact) alongside the Default primary image.",
      },
    },
    visualDelta: {
      images: ["/visual-baselines/examples/modes/default.png"],
      modes: {
        Compact: {
          globals: { exampleDensity: "compact" },
          src: "/visual-baselines/examples/modes/compact.png",
        },
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const DefaultAndCompact: Story = {
  name: "Default and compact",
  render: () => (
    <DemoFrame>
      <DemoModeBlock />
    </DemoFrame>
  ),
};
