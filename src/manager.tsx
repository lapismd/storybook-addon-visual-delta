import React from "react";
import {
  addons,
  experimental_getStatusStore,
  types,
} from "storybook/manager-api";
import { Addon_TypesEnum, type API_HashEntry } from "storybook/internal/types";
import {
  ADDON_ID,
  HIGHLIGHT_IGNORE_TOOL_ID,
  PANEL_ID,
  STATUS_TYPE_ID_VISUAL,
  TEST_PROVIDER_ID,
  TOOL_ID,
} from "./constants.js";
import { HighlightIgnoreTool } from "./manager/HighlightIgnoreTool.js";
import { PanelTitle } from "./manager/PanelTitle.js";
import { ReviewLayoutTool } from "./manager/ReviewLayoutTool.js";
import { VisualTestProviderRender } from "./manager/VisualTestProvider.js";
import { Panel } from "./panel/Panel.js";

addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: () => <PanelTitle />,
    match: ({ viewMode }) => viewMode === "story",
    render: ({ active }) => <Panel active={active} />,
  });

  addons.add(TOOL_ID, {
    type: types.TOOL,
    title: "Visual Delta review layout",
    match: ({ viewMode, tabId }) => viewMode === "story" && !tabId,
    render: () => <ReviewLayoutTool />,
  });

  addons.add(HIGHLIGHT_IGNORE_TOOL_ID, {
    type: types.TOOL,
    title: "Highlight ignored regions",
    match: ({ viewMode, tabId }) => viewMode === "story" && !tabId,
    render: () => <HighlightIgnoreTool />,
  });

  // Local Playwright visual suite — only available while the Storybook
  // Vite dev server can shell out via middleware.
  const configType = (globalThis as typeof globalThis & { CONFIG_TYPE?: string })
    .CONFIG_TYPE;
  if (configType === "DEVELOPMENT") {
    const statusStore = experimental_getStatusStore(STATUS_TYPE_ID_VISUAL);
    addons.add(TEST_PROVIDER_ID, {
      type: Addon_TypesEnum.experimental_TEST_PROVIDER,
      clear: () => {
        statusStore.unset();
      },
      render: () => <VisualTestProviderRender />,
      sidebarContextMenu: ({ context }: { context: API_HashEntry }) => {
        if (context.type === "docs") return null;
        return <VisualTestProviderRender entry={context} />;
      },
    });
  }
});
