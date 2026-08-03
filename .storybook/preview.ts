import type { Preview } from "@storybook/react-vite";
import React from "react";
import { withVisualDeltaTheme } from "../src/stories/theme";

const preview: Preview = {
  // Apply manager Nunito Sans / createReset to every preview story. ThemeHost
  // alone is not enough for stories that skip it, and ThemeProvider without
  // Global leaves the iframe on the browser default font.
  decorators: [
    (Story) => withVisualDeltaTheme(React.createElement(Story)),
    (Story, context) => {
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle(
          "dark",
          context.globals.colorMode === "dark",
        );
      }
      return React.createElement(Story);
    },
  ],
  initialGlobals: {
    colorMode: "light",
    // Visual Delta's Compact example updates this through Storybook's manager
    // API. Storybook rejects globals absent from initialGlobals/globalTypes.
    exampleDensity: "default",
  },
  parameters: {
    layout: "fullscreen",
    // Host-stub manager acceptance needs the Controls tab (arg edits).
    controls: { disable: false },
    a11y: { test: "todo" },
  },
};

export default preview;
