import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { DemoFormField, DemoFrame, DemoMissing } from "./demo-subjects.js";

const meta = {
  title: "Examples/Form Field",
  tags: ["skip-visual"],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const Default: Story = {
  name: "Default",
  parameters: {
    visualDelta: {
      images: ["/visual-baselines/examples/form-field/default.png"],
    },
  },
  render: () => (
    <DemoFrame>
      <DemoFormField />
    </DemoFrame>
  ),
};

export const MissingBaseline: Story = {
  name: "Missing baseline",
  parameters: {
    docs: {
      description: {
        story:
          "No visualDelta.images — demonstrates read-only empty-state messaging.",
      },
    },
  },
  render: () => (
    <DemoFrame>
      <DemoMissing />
    </DemoFrame>
  ),
};
