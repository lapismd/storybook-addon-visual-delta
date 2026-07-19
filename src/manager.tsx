import React from "react";
import { addons, types } from "storybook/manager-api";
import { ADDON_ID, PANEL_ID } from "./constants.js";
import { Panel } from "./panel/Panel.js";

addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: "Visual Delta",
    match: ({ viewMode }) => viewMode === "story",
    render: ({ active }) => <Panel active={active} />,
  });
});
