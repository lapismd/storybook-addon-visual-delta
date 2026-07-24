import React, { useCallback, useEffect, useState } from "react";
import { EyeIcon } from "@storybook/icons";
import { ToggleButton } from "storybook/internal/components";
import { useChannel, useStorybookApi } from "storybook/manager-api";
import { EVENTS } from "../constants.js";
import { resolveIgnoreSelectors } from "../shared/ignore.js";

const STORAGE_KEY = "storybook-addon-visual-delta/highlight-ignore";

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/**
 * Toolbar toggle: outline ignore regions in the preview
 * (`data-visual-delta-ignore`, Chromatic markers, CSF `ignoreSelectors`).
 */
export function HighlightIgnoreTool() {
  const api = useStorybookApi();
  const emit = useChannel({});
  const [enabled, setEnabled] = useState(loadEnabled);

  const push = useCallback(
    (on: boolean) => {
      const story = api.getCurrentStoryData();
      const params = (
        story as { parameters?: { visualDelta?: { ignoreSelectors?: string[] } } } | undefined
      )?.parameters?.visualDelta;
      const selectors = resolveIgnoreSelectors(params?.ignoreSelectors);
      emit(EVENTS.SET_HIGHLIGHT_IGNORE, { enabled: on, selectors });
    },
    [api, emit],
  );

  useEffect(() => {
    push(enabled);
  }, [enabled, push]);

  const label = enabled
    ? "Hide ignored regions highlight"
    : "Highlight ignored regions";

  return (
    <ToggleButton
      key="visual-delta-highlight-ignore"
      size="small"
      variant="ghost"
      padding="small"
      pressed={enabled}
      ariaLabel={label}
      title={label}
      onClick={() => {
        setEnabled((prev) => {
          const next = !prev;
          saveEnabled(next);
          return next;
        });
      }}
    >
      <EyeIcon />
    </ToggleButton>
  );
}
