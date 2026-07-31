import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { DemoAiReply, DemoFrame } from "./demo-subjects.js";

const meta = {
  title: "Examples/AI Reply",
  tags: ["skip-visual"],
  parameters: {
    visualDelta: {
      images: ["/visual-baselines/examples/ai-reply/default.png"],
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Default: Story = {
  name: "Default",
  render: () => (
    <DemoFrame>
      <DemoAiReply />
    </DemoFrame>
  ),
};
