import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { StubSubject } from "./StubSubject.js";

const meta = {
  title: "Shadcn/Overlays/Popover",
  parameters: {
    docs: {
      description: {
        component:
          "Host stub for manager/overlay story IDs — not product documentation. See Visual Delta/Host Stubs/Guidance (`VD-HOST-006`).",
      },
    },
    visualDelta: {
      images: [
        "/visual-baselines/shadcn/popover/open-panel-chromium-darwin.png",
      ],
      cropToViewport: true,
      align: "viewport",
    },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj;
export const OpenPanel: Story = {
  name: "Open panel",
  render: () => <StubSubject label="Popover stub" width={280} height={160} />,
};
