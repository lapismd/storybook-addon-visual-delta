import React from "react";
import { FailedIcon, FlagIcon } from "@storybook/icons";
import { ToggleButton } from "storybook/internal/components";
import { styled } from "storybook/theming";
import type { VisualReviewStatus } from "../constants.js";
import { ButtonGroup } from "./styled.js";

const ReviewButton = styled(ToggleButton)({
  height: 28,
  minHeight: 28,
  padding: "0 8px",
  gap: 4,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
  "& svg": {
    width: 12,
    height: 12,
    flexShrink: 0,
  },
});

/** Panel pad only exposes agent/dev signals; Accept/Unaccept cover pending/approved. */
const OPTIONS: Array<{
  status: Extract<VisualReviewStatus, "ready" | "failed">;
  label: string;
  actionLabel: string;
  currentLabel: string;
  Icon: React.ComponentType;
}> = [
  {
    status: "ready",
    label: "Ready",
    actionLabel: "Mark visual baseline ready for review",
    currentLabel: "Ready for review",
    Icon: FlagIcon,
  },
  {
    status: "failed",
    label: "Failed",
    actionLabel: "Mark visual baseline failed",
    currentLabel: "Failed",
    Icon: FailedIcon,
  },
];

type ReviewStatusPadProps = {
  value: VisualReviewStatus | null;
  onSelect: (status: VisualReviewStatus) => void;
  disabled?: boolean;
};

export function ReviewStatusPad({
  value,
  onSelect,
  disabled = false,
}: ReviewStatusPadProps) {
  return (
    <ButtonGroup role="group" aria-label="Baseline review status">
      {OPTIONS.map(({ status, label, actionLabel, currentLabel, Icon }) => {
        const pressed = value === status;
        const tip = pressed ? `${currentLabel} (current)` : actionLabel;
        return (
          <ReviewButton
            key={status}
            size="small"
            pressed={pressed}
            disabled={disabled || pressed}
            ariaLabel={tip}
            tooltip={tip}
            onClick={() => onSelect(status)}
          >
            <Icon />
            {label}
          </ReviewButton>
        );
      })}
    </ButtonGroup>
  );
}
