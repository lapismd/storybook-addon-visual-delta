import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { StubSubject } from "./StubSubject.js";

const meta = {
  title: "Shadcn/Actions/Button",
  tags: ["skip-visual"],
  parameters: {
    docs: {
      description: {
        component:
          "Host stub for manager/overlay story IDs — not product Button docs. See Visual Delta/Host Stubs/Guidance (`VD-HOST-006`).",
      },
    },
    visualDelta: {
      images: ["/visual-baselines/shadcn/button/default-chromium-darwin.png"],
      interactions: [
        {
          id: "opened-state",
          label: "Opened state",
          src: "/visual-baselines/shadcn/button/default-chromium-darwin.png",
        },
      ],
    },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj;
export const Default: Story = {
  name: "Default",
  render: () => <StubSubject label="Button stub" width={120} height={40} />,
};
