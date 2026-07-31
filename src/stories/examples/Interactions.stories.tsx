import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { DemoDisclosure, ExampleStage } from "./demo-subjects.js";
import {
  EXAMPLE_SIZES,
  exampleBaseline,
  exampleVisualDelta,
} from "./example-sizes.js";

function InteractiveDisclosure() {
  const [open, setOpen] = useState(false);
  const size = open
    ? EXAMPLE_SIZES.interactionsOpen
    : EXAMPLE_SIZES.interactionsIdle;

  return (
    <ExampleStage {...size}>
      <DemoDisclosure open={open} onToggle={() => setOpen((v) => !v)} />
    </ExampleStage>
  );
}

const meta = {
  title: "Examples/Interactions",
  tags: ["visual-delta-examples"],
  parameters: {
    docs: {
      description: {
        component: `
Interaction baselines: primary **idle** image, plus a mid-play **Opened details** image after the play function parks.

Stage height grows when details open so the opened baseline’s CSS size matches the live subject (no geometry warning when that interaction baseline is selected). Uses Story canvas alignment for component-sized captures.
`,
      },
    },
    visualDelta: exampleVisualDelta({
      images: [
        exampleBaseline("/visual-baselines/examples/interactions/idle.png"),
      ],
      interactions: [
        {
          id: "opened-details",
          label: "Opened details",
          src: exampleBaseline(
            "/visual-baselines/examples/interactions/opened.png",
          ),
        },
      ],
    }),
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const WithInteractionBaseline: Story = {
  name: "With interaction baseline",
  parameters: {
    docs: {
      description: {
        story:
          "Play opens the disclosure. Use Visual Delta’s interaction step control to compare the opened baseline against the parked live UI. Idle primary image matches the closed stage; after open, select the interaction baseline (not the idle primary) to avoid a geometry warning.",
      },
    },
  },
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
