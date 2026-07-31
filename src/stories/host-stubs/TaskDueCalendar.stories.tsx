import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { StubSubject } from "./StubSubject.js";

const meta = {
  title: "UI Forms/Form Inputs/Task Due Calendar",
  tags: ["skip-visual"],
  parameters: {
    docs: {
      description: {
        component:
          "Host stub for manager/overlay story IDs — not product documentation. See Visual Delta/Host Stubs/Guidance (`VD-HOST-006`).",
      },
    },
    visualDelta: {
      images: [
        "/visual-baselines/forms/task-due-calendar/shows-a-selected-date-chromium-darwin.png",
      ],
    },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj;
export const ShowsASelectedDate: Story = {
  name: "Shows a selected date",
  render: () => (
    <StubSubject label="Task due calendar stub" width={280} height={320} />
  ),
};
