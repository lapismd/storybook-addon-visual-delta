import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { StubSubject } from "./StubSubject.js";

const meta = {
  title: "AI/Chat/Send Button",
  tags: ["skip-visual"],
  parameters: {
    docs: {
      description: {
        component:
          "Host stub for manager/overlay story IDs — not product documentation. See Visual Delta/Host Stubs/Guidance (`VD-HOST-006`).",
      },
    },
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
