import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { StubSubject } from "./StubSubject.js";

const meta = {
  title: "Shadcn/Overlays/Popover",
  tags: ["skip-visual"],
  parameters: {
    visualDelta: {
      images: [
        "/visual-baselines/shadcn/popover/open-panel-chromium-darwin.png",
      ],
    },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj;
export const OpenPanel: Story = {
  name: "Open panel",
  render: () => <StubSubject label="Popover stub" width={280} height={160} />,
};
