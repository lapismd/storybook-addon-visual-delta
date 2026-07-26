import React, { useCallback, useEffect, useState } from "react";
import { EyeIcon } from "@storybook/icons";
import { ToggleButton } from "storybook/internal/components";
import {
  useChannel,
  useStorybookApi,
  useStorybookState,
} from "storybook/manager-api";
import { styled } from "storybook/theming";
import { EVENTS } from "../constants.js";
import { resolveIgnoreSelectors } from "../shared/ignore.js";

const STORAGE_KEY = "storybook-addon-visual-delta/highlight-ignore";

const CountBadge = styled.span(({ theme }) => ({
  minWidth: 14,
  height: 14,
  paddingInline: 3,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 7,
  background: theme.color.secondary,
  color: theme.color.lightest,
  fontSize: 9,
  lineHeight: 1,
  fontVariantNumeric: "tabular-nums",
}));

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
  const { storyId } = useStorybookState();
  const [count, setCount] = useState(0);
  const emit = useChannel({
    [EVENTS.IGNORE_REGIONS_STATUS]: (payload: {
      storyId?: string;
      count?: number;
    }) => {
      if (payload.storyId && payload.storyId !== storyId) return;
      setCount(Math.max(0, payload.count ?? 0));
    },
  });
  const [enabled, setEnabled] = useState(loadEnabled);

  const push = useCallback(
    (on: boolean) => {
      const story = api.getCurrentStoryData();
      const params = (
        story as
          | { parameters?: { visualDelta?: { ignoreSelectors?: string[] } } }
          | undefined
      )?.parameters?.visualDelta;
      const selectors = resolveIgnoreSelectors(params?.ignoreSelectors);
      emit(EVENTS.SET_HIGHLIGHT_IGNORE, { enabled: on, selectors });
    },
    [api, emit, storyId],
  );

  useEffect(() => {
    setCount(0);
    push(enabled);
  }, [enabled, push, storyId]);

  const label = enabled
    ? `Hide ${count} ignored region${count === 1 ? "" : "s"} highlight`
    : `Highlight ${count} ignored region${count === 1 ? "" : "s"}`;

  if (count === 0) return null;

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
      <CountBadge aria-hidden>{count}</CountBadge>
    </ToggleButton>
  );
}
