import React from "react";
import { useStorybookApi, useStorybookState } from "storybook/manager-api";
import { VisualStatusToolbarLabel } from "./VisualStatusLabel.js";

declare global {
  // Injected by the addon preset's managerHead hook.
  var __STORYBOOK_VISUAL_DELTA_SHOW_TOOLBAR_STATUS_LABELS__:
    | boolean
    | undefined;
}

export function isVisualStatusToolbarEnabled(): boolean {
  return (
    globalThis.__STORYBOOK_VISUAL_DELTA_SHOW_TOOLBAR_STATUS_LABELS__ !== false
  );
}

export function VisualStatusToolbarTool() {
  const api = useStorybookApi();
  const { storyId } = useStorybookState();
  if (!storyId || !isVisualStatusToolbarEnabled()) return null;

  // Read the selected manager-index entry, matching the exact inherited tag
  // source used by sidebar labels. Preview-prepared story data can lag or omit
  // manager-only index tag updates.
  const story = api.getData(storyId) as
    | { tags?: readonly string[] }
    | undefined;
  return <VisualStatusToolbarLabel tags={story?.tags} />;
}
