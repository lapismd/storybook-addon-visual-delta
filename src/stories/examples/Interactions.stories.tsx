import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { DemoDisclosure, DemoFrame } from "./demo-subjects.js";

function InteractiveDisclosure() {
  const [open, setOpen] = useState(false);
  return (
    <DemoFrame>
      <DemoDisclosure open={open} onToggle={() => setOpen((v) => !v)} />
    </DemoFrame>
  );
}

const meta = {
  title: "Examples/Interactions",
  tags: ["skip-visual"],
  parameters: {
    docs: {
      description: {
        component:
          "Primary idle baseline plus a mid-play interaction baseline after opening details.",
      },
    },
    visualDelta: {
      images: ["/visual-baselines/examples/interactions/idle.png"],
      interactions: [
        {
          id: "opened-details",
          label: "Opened details",
          src: "/visual-baselines/examples/interactions/opened.png",
        },
      ],
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const WithInteractionBaseline: Story = {
  name: "With interaction baseline",
  render: () => <InteractiveDisclosure />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step("Opened details", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: /Show details/i }),
      );
      await expect(
        canvas.getByText(/Interaction baseline captures/i),
      ).toBeInTheDocument();
    });
  },
};
