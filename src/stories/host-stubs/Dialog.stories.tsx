import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { expect, userEvent, within } from "storybook/test";
import { StubSubject } from "./StubSubject.js";

const meta = {
  title: "Shadcn/Overlays/Dialog",
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
        "/visual-baselines/shadcn/dialog/open-dialog-chromium-darwin.png",
      ],
      interactions: [
        {
          id: "interaction-1-click",
          label: "userEvent.click",
          src: "/visual-baselines/shadcn/dialog/opens-and-closes--interaction-1-click-chromium-darwin.png",
        },
        {
          id: "interaction-5-toHaveAttribute",
          label: "toHaveAttribute",
          src: "/visual-baselines/shadcn/dialog/opens-and-closes--interaction-5-toHaveAttribute-chromium-darwin.png",
        },
      ],
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const OpensAndCloses: Story = {
  name: "Opens and closes",
  render: () => <StubSubject label="Dialog stub" width={360} height={200} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId("host-product-stub"));
    await expect(canvas.getByText("Dialog stub")).toBeInTheDocument();
  },
};
