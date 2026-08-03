import React from "react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CircleIcon,
  UndoIcon,
} from "@storybook/icons";
import { ToggleButton } from "storybook/internal/components";
import { styled } from "storybook/theming";
import type { PlacementMode } from "../constants.js";

const Pad = styled.div(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(3, 22px)",
  gridTemplateRows: "repeat(3, 22px)",
  gap: 2,
  padding: 3,
  flex: "0 0 auto",
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: theme.appBorderRadius ?? 4,
  background: theme.background.content,
}));

const Cell = styled.div({
  width: 22,
  height: 22,
});

const PadButton = styled(ToggleButton)({
  width: 22,
  height: 22,
  minWidth: 22,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  "& svg": {
    width: 12,
    height: 12,
  },
});

type PlacementPadProps = {
  value: PlacementMode;
  /** Whether a baseline overlay is currently shown. */
  active: boolean;
  onToggle: (placement: PlacementMode) => void;
  /** Reset a manually dragged overlay to its configured origin. */
  onReset?: () => void;
  /** The surface whose position is described by each Baseline control. */
  comparisonTarget?: "live" | "actual";
  disabled?: boolean;
};

const BUTTONS: Array<{
  placement: PlacementMode;
  relation: string;
  row: number;
  col: number;
  icon: React.ReactNode;
}> = [
  {
    placement: "above",
    relation: "above",
    row: 1,
    col: 2,
    icon: <ArrowUpIcon />,
  },
  {
    placement: "left",
    relation: "left of",
    row: 2,
    col: 1,
    icon: <ArrowLeftIcon />,
  },
  {
    placement: "center",
    relation: "centered over",
    row: 2,
    col: 2,
    icon: <CircleIcon />,
  },
  {
    placement: "right",
    relation: "right of",
    row: 2,
    col: 3,
    icon: <ArrowRightIcon />,
  },
  {
    placement: "below",
    relation: "below",
    row: 3,
    col: 2,
    icon: <ArrowDownIcon />,
  },
];

export function PlacementPad({
  value,
  active,
  onToggle,
  onReset,
  comparisonTarget = "live",
  disabled,
}: PlacementPadProps) {
  return (
    <Pad
      role="group"
      aria-label={
        comparisonTarget === "actual"
          ? "Baseline position relative to actual"
          : "Baseline position"
      }
    >
      {Array.from({ length: 9 }, (_, i) => {
        const row = Math.floor(i / 3) + 1;
        const col = (i % 3) + 1;
        const btn = BUTTONS.find((b) => b.row === row && b.col === col);
        if (!btn && row === 3 && col === 3 && onReset) {
          const label = "Reset overlay position after drag";
          return (
            <PadButton
              key="reset"
              size="small"
              variant="ghost"
              padding="none"
              pressed={false}
              disabled={disabled}
              ariaLabel={label}
              tooltip={label}
              onClick={onReset}
            >
              <UndoIcon />
            </PadButton>
          );
        }
        if (!btn) return <Cell key={`empty-${i}`} />;
        const pressed = active && value === btn.placement;
        const placementLabel = `Baseline ${btn.relation} ${comparisonTarget}`;
        const label = pressed
          ? `Hide overlay (${placementLabel})`
          : placementLabel;
        return (
          <PadButton
            key={btn.placement}
            size="small"
            variant="ghost"
            padding="none"
            pressed={pressed}
            disabled={disabled}
            ariaLabel={label}
            title={label}
            onClick={() => onToggle(btn.placement)}
          >
            {btn.icon}
          </PadButton>
        );
      })}
    </Pad>
  );
}
