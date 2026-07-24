import React, { useCallback, useRef } from "react";
import { CloseIcon, ExpandIcon } from "@storybook/icons";
import { ToggleButton } from "storybook/internal/components";
import {
  useAddonState,
  useStorybookApi,
  useStorybookState,
} from "storybook/manager-api";
import { REVIEW_LAYOUT_STATE_ID } from "../constants.js";
import {
  isReviewLayoutActive,
  scheduleReviewLayoutApply,
  toggleReviewLayout,
} from "./review-layout.js";

export type ReviewLayoutAddonState = {
  active: boolean;
};

export const DEFAULT_REVIEW_LAYOUT_STATE: ReviewLayoutAddonState = {
  active: false,
};

/**
 * Shared enter/exit for toolbar + panel controls.
 * Layout mutations are deferred so Popover/ActionList teardown and Storybook
 * landmark unregister finish first.
 */
export function useReviewLayoutToggle() {
  const api = useStorybookApi();
  const { layout } = useStorybookState();
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [{ active }, setReviewState] = useAddonState<ReviewLayoutAddonState>(
    REVIEW_LAYOUT_STATE_ID,
    DEFAULT_REVIEW_LAYOUT_STATE,
  );

  const toggle = useCallback(() => {
    scheduleReviewLayoutApply(() => {
      const next = toggleReviewLayout(api, layoutRef.current);
      void setReviewState({ active: next });
    });
  }, [api, setReviewState]);

  const isActive = active || isReviewLayoutActive();

  return { active: isActive, toggle };
}

/** Storybook preview toolbar toggle for Visual Delta review layout. */
export function ReviewLayoutTool() {
  const { active, toggle } = useReviewLayoutToggle();
  const label = active ? "Exit review layout" : "Review layout";

  return (
    <ToggleButton
      key="visual-delta-review-layout"
      size="small"
      padding="small"
      variant="ghost"
      pressed={active}
      ariaLabel={label}
      title={
        active
          ? "Exit review layout (restore sidebar and panel)"
          : "Review layout — canvas on top, Visual Delta full width below"
      }
      onClick={toggle}
    >
      {active ? <CloseIcon /> : <ExpandIcon />}
    </ToggleButton>
  );
}
