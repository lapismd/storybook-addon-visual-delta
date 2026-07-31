import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { DemoAiReply, ExampleStage } from "./demo-subjects.js";
import {
  EXAMPLE_SIZES,
  exampleBaseline,
  exampleVisualDelta,
} from "./example-sizes.js";

const meta = {
  title: "Examples/AI Reply",
  tags: ["skip-visual"],
  parameters: {
    docs: {
      description: {
        component:
          "Lightweight AI-flavored reply block. Fixed stage size matches the wired baseline CSS box (PNG at 1× device scale). Uses Story canvas alignment.",
      },
    },
    visualDelta: exampleVisualDelta({
      images: [
        exampleBaseline("/visual-baselines/examples/ai-reply/default.png"),
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
          "Reply skeleton for panel exploration. Expect clean geometry and alignment; placeholder bars approximate the live layout.",
      },
    },
  },
  render: () => (
    <ExampleStage {...EXAMPLE_SIZES.aiReply}>
      <DemoAiReply />
    </ExampleStage>
  ),
};
