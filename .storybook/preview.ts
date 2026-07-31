import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
    a11y: { test: "todo" },
  },
};

export default preview;
