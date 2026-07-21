import React from "react";
import {
  FailedIcon,
  HourglassIcon,
  VerifiedIcon,
} from "@storybook/icons";
import { ToggleButton } from "storybook/internal/components";
import { styled } from "storybook/theming";
import type { VisualReviewStatus } from "../constants.js";
import { ButtonGroup } from "./styled.js";

const ReviewButton = styled(ToggleButton)({
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

const OPTIONS: Array<{
  status: VisualReviewStatus;
  label: string;
  Icon: React.ComponentType;
}> = [
  {
    status: "pending",
    label: "Mark pending review",
    Icon: HourglassIcon,
  },
  {
    status: "approved",
    label: "Approve baseline",
    Icon: VerifiedIcon,
  },
  {
    status: "failed",
    label: "Mark baseline failed",
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
      {OPTIONS.map(({ status, label, Icon }) => {
        const pressed = value === status;
        return (
          <ReviewButton
            key={status}
            size="small"
            pressed={pressed}
            disabled={disabled || pressed}
            aria-label={label}
            title={label}
            onClick={() => onSelect(status)}
          >
            <Icon />
          </ReviewButton>
        );
      })}
    </ButtonGroup>
  );
}
