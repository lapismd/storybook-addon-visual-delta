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
  /** True when the live story is shown (default). False = image-only. */
  liveVisible: boolean;
  onToggle: (liveVisible: boolean) => void;
  disabled?: boolean;
};

/**
 * Eye toggle for image-only mode. Unselected by default (live + gallery shown).
 * Selected = hide live story and baseline gallery; show only the PNG (center, draggable).
 */
export function LiveVisibilityToggle({
  liveVisible,
  onToggle,
  disabled = false,
}: LiveVisibilityToggleProps) {
  const imageOnly = !liveVisible;
  const label = imageOnly
    ? "Exit image only (show live story)"
    : "Image only (hide live story)";
  return (
    <ButtonGroup role="group" aria-label="Image only">
      <Toggle
        size="small"
        pressed={imageOnly}
        disabled={disabled}
        ariaLabel={label}
        title={label}
        onClick={() => onToggle(!liveVisible)}
      >
        {imageOnly ? <EyeCloseIcon /> : <EyeIcon />}
      </Toggle>
    </ButtonGroup>
  );
}
