import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { StubSubject } from "./StubSubject.js";

const meta = {
  title: "AI/Chat/Send Button",
  tags: ["skip-visual"],
  parameters: {
    visualDelta: {
      images: ["/visual-baselines/ai/send-button/states-chromium-darwin.png"],
    },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj;
export const States: Story = {
  name: "States",
  render: () => (
    <StubSubject label="Send button stub" width={200} height={48} />
  ),
};
