import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { expect, userEvent, within } from "storybook/test";
import { StubSubject } from "./StubSubject.js";

const meta = {
  title: "Filter/Power Search",
  tags: ["skip-visual"],
  args: {
    placeholder: "Filter fields",
  },
  argTypes: {
    placeholder: { control: "text" },
  },
} satisfies Meta<{ placeholder: string }>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddFilterViaCombobox: Story = {
  name: "Add filter via combobox",
  parameters: {
    visualDelta: {
      images: [
        "/visual-baselines/filter/power-search/add-filter-via-combobox-chromium-darwin.png",
      ],
      interactions: [
        {
          id: "interaction-1-click",
          label: "userEvent.click",
          src: "/visual-baselines/filter/power-search/add-filter-via-combobox--interaction-1-click-chromium-darwin.png",
        },
      ],
    },
  },
  render: ({ placeholder }) => (
    <StubSubject label={placeholder} width={480} height={120} />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId("host-product-stub"));
    await expect(canvas.getByText(args.placeholder)).toBeInTheDocument();
  },
};

export const EditRemoveAndClear: Story = {
  name: "Edit remove and clear",
  tags: ["skip-visual"],
  parameters: {
    visualDelta: {
      align: "canvas",
      delay: 5125,
      images: [
        "/visual-baselines/filter/power-search/add-filter-via-combobox-chromium-darwin.png",
      ],
      interactions: [
        {
          id: "interaction-1-click",
          label: "userEvent.click",
          src: "/visual-baselines/filter/power-search/add-filter-via-combobox--interaction-1-click-chromium-darwin.png",
        },
      ],
    },
  },
  render: ({ placeholder }) => (
    <StubSubject label={placeholder} width={480} height={120} />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId("host-product-stub"));
    await expect(canvas.getByText(args.placeholder)).toBeInTheDocument();
  },
};
