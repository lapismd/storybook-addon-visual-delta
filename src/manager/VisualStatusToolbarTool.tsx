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

  const story = api.getCurrentStoryData() as
    | { tags?: readonly string[] }
    | undefined;
  return <VisualStatusToolbarLabel tags={story?.tags} />;
}
