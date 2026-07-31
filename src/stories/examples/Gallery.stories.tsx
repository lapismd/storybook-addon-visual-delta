import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { DemoFrame, DemoGalleryCard } from "./demo-subjects.js";

const meta = {
  title: "Examples/Gallery",
  tags: ["skip-visual"],
  parameters: {
    docs: {
      description: {
        component:
          "Multiple wired baselines in one story gallery (Default, Compact, Accent).",
      },
    },
    visualDelta: {
      images: [
        "/visual-baselines/examples/gallery/default.png",
        "/visual-baselines/examples/gallery/compact.png",
        "/visual-baselines/examples/gallery/accent.png",
      ],
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const MultipleImages: Story = {
  name: "Multiple images",
  render: () => (
    <DemoFrame>
      <DemoGalleryCard label="Default gallery" />
    </DemoFrame>
  ),
};

export const CompactVariant: Story = {
  name: "Compact variant",
  parameters: {
    visualDelta: {
      images: ["/visual-baselines/examples/gallery/compact.png"],
    },
  },
  render: () => (
    <DemoFrame>
      <DemoGalleryCard compact label="Compact gallery" />
    </DemoFrame>
  ),
};
