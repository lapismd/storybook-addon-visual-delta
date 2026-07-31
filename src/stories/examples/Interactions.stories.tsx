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
Interaction baselines: primary image is **end of play** (details open). The same PNG is wired as the mid-play **Opened details** interaction so parking that step stays geometry-aligned.

A closed **idle** capture remains on disk for the capture script; Default must not use it after play opens the stage. Uses Story canvas alignment for component-sized captures.
`,
      },
    },
    visualDelta: exampleVisualDelta({
      images: [
        exampleBaseline("/visual-baselines/examples/interactions/opened.png"),
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
          "Play opens the disclosure. Default (end of play) and the Opened details interaction both use the opened-stage baseline so geometry stays aligned at 300×168.",
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
