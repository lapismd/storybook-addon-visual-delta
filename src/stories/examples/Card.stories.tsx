import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { DemoCard, DemoFrame } from "./demo-subjects.js";

const meta = {
  title: "Examples/Card",
  tags: ["skip-visual"],
  parameters: {
    docs: {
      description: {
        component:
          "Realistic card subject with a matching baseline and an intentional drift story. See Examples/Guidance.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Match: Story = {
  name: "Match",
  parameters: {
    visualDelta: {
      images: ["/visual-baselines/examples/card/match.png"],
    },
  },
  render: () => (
    <DemoFrame>
      <DemoCard />
    </DemoFrame>
  ),
};

export const IntentionalDifference: Story = {
  name: "Intentional difference",
  parameters: {
    docs: {
      description: {
        story:
          "Live subject differs from the wired baseline so Diff HTML / overlay heatmap are obvious.",
      },
    },
    visualDelta: {
      // Same PNG as Match — live UI drifts so comparison shows a delta.
      images: ["/visual-baselines/examples/card/drift.png"],
    },
  },
  render: () => (
    <DemoFrame>
      <DemoCard drift />
    </DemoFrame>
  ),
};
