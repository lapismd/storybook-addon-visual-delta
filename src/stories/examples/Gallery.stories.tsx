import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { DemoGalleryCard, ExampleStage } from "./demo-subjects.js";
import {
  EXAMPLE_SIZES,
  exampleBaseline,
  exampleVisualDelta,
} from "./example-sizes.js";

const meta = {
  title: "Examples/Gallery",
  tags: ["skip-visual"],
  parameters: {
    docs: {
      description: {
        component: `
Gallery wiring for Visual Delta.

- **Multiple images** — two same-size baselines (Default + Accent). Switch images in the panel; Accent differs in accent color (pixel delta), not geometry.
- **Compact variant** — separate story with a smaller stage so the compact baseline fits without a geometry warning.
`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const MultipleImages: Story = {
  name: "Multiple images",
  parameters: {
    docs: {
      description: {
        story:
          "Primary subject is the Default gallery card. Gallery lists Default and Accent baselines (same CSS size). Selecting Accent while viewing Default shows intentional accent-color drift — geometry and alignment stay clean.",
      },
    },
    visualDelta: exampleVisualDelta({
      images: [
        exampleBaseline("/visual-baselines/examples/gallery/default.png"),
        exampleBaseline("/visual-baselines/examples/gallery/accent.png"),
      ],
    }),
  },
  render: () => (
    <ExampleStage {...EXAMPLE_SIZES.gallery}>
      <DemoGalleryCard label="Default gallery" />
    </ExampleStage>
  ),
};

export const CompactVariant: Story = {
  name: "Compact variant",
  parameters: {
    docs: {
      description: {
        story:
          "Compact stage size matches the compact baseline PNG. Prefer this story over selecting a compact image against a Default-sized subject.",
      },
    },
    visualDelta: exampleVisualDelta({
      images: [
        exampleBaseline("/visual-baselines/examples/gallery/compact.png"),
      ],
    }),
  },
  render: () => (
    <ExampleStage {...EXAMPLE_SIZES.galleryCompact}>
      <DemoGalleryCard compact label="Compact gallery" />
    </ExampleStage>
  ),
};
