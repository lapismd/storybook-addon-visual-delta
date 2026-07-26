import React, { memo } from "react";
import { Badge } from "storybook/internal/components";
import { useAddonState, useStorybookApi } from "storybook/manager-api";
import { ADDON_ID, PANEL_ID } from "../constants.js";

export type VisualDeltaAddonState = {
  /** Wired baseline screenshots for the current story (primary + interactions). */
  imageCount: number;
};

export const DEFAULT_ADDON_STATE: VisualDeltaAddonState = { imageCount: 0 };

/**
 * Panel tab label with a compact count badge — same pattern as Actions /
 * Accessibility.
 */
export const PanelTitle = memo(function PanelTitle() {
  const selectedPanel = useStorybookApi().getSelectedPanel();
  const [{ imageCount }] = useAddonState<VisualDeltaAddonState>(
    ADDON_ID,
    DEFAULT_ADDON_STATE,
  );
  const suffix =
    imageCount === 0 ? null : (
      <Badge compact status={selectedPanel === PANEL_ID ? "active" : "neutral"}>
        {imageCount}
      </Badge>
    );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span>Visual Delta</span>
      {suffix}
    </div>
  );
});
