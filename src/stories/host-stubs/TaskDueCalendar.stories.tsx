import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";

const meta = {
  title: "UI Forms/Form Inputs/Task Due Calendar",
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
    <div style={{ width: 264 }}>
      <div
        data-ui-component="task-due-calendar"
        data-testid="host-product-stub"
        style={{
          boxSizing: "border-box",
          height: 187,
          border: "2px solid #2563eb",
          borderRadius: 8,
          background: "#eff6ff",
        }}
      />
    </div>
  ),
};
