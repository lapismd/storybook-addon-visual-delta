import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { StubSubject } from "./StubSubject.js";

const meta = {
  title: "Shadcn/Feedback/Empty",
  tags: ["visual-ready"],
  parameters: {
    docs: {
      description: {
        component:
          "Host stub for manager/overlay story IDs — not product documentation. See Visual Delta/Host Stubs/Guidance (`VD-HOST-006`).",
      },
    },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj;
export const Preview: Story = {
  name: "Preview",
  render: () => <StubSubject label="Empty stub" width={320} height={180} />,
};
