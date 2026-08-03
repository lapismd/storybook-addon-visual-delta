import React from "react";
import { EyeCloseIcon, EyeIcon } from "@storybook/icons";
import { ToggleButton } from "storybook/internal/components";
import { styled } from "storybook/theming";
import { ButtonGroup } from "./styled.js";

const Toggle = styled(ToggleButton)({
  width: 28,
  height: 28,
  minWidth: 28,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  "& svg": {
    width: 14,
    height: 14,
  },
});

type LiveVisibilityToggleProps = {
  /** True when the live story is shown. False = captured actual when present. */
  liveVisible: boolean;
  onToggle: (liveVisible: boolean) => void;
  disabled?: boolean;
};

/**
 * Toggle between the live story and the latest fresh captured actual. When no
 * actual exists, Captured mode retains the baseline-only fallback.
 */
export function LiveVisibilityToggle({
  liveVisible,
  onToggle,
  disabled = false,
}: LiveVisibilityToggleProps) {
  const captured = !liveVisible;
  const label = captured
    ? "Show live component"
    : "Show captured actual";
  return (
    <ButtonGroup role="group" aria-label="Live or Captured">
      <Toggle
        size="small"
        pressed={captured}
        disabled={disabled}
        ariaLabel={label}
        title={label}
        onClick={() => onToggle(!liveVisible)}
      >
        {captured ? <EyeCloseIcon /> : <EyeIcon />}
      </Toggle>
    </ButtonGroup>
  );
}
