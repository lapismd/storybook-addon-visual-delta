import type { Preview } from "@storybook/react-vite";
import React from "react";
import { withVisualDeltaTheme } from "../src/stories/theme";

const preview: Preview = {
  // Apply manager Nunito Sans / createReset to every preview story. ThemeHost
  // alone is not enough for stories that skip it, and ThemeProvider without
  // Global leaves the iframe on the browser default font.
  decorators: [(Story) => withVisualDeltaTheme(React.createElement(Story))],
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
    a11y: { test: "todo" },
  },
};

export default preview;
