import React from "react";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CircleIcon,
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
  disabled?: boolean;
};

const BUTTONS: Array<{
  placement: PlacementMode;
  label: string;
  row: number;
  col: number;
  icon: React.ReactNode;
}> = [
  {
    placement: "above",
    label: "Baseline above live",
    row: 1,
    col: 2,
    icon: <ArrowUpIcon />,
  },
  {
    placement: "left",
    label: "Baseline left of live",
    row: 2,
    col: 1,
    icon: <ArrowLeftIcon />,
  },
  {
    placement: "center",
    label: "Baseline centered over live",
    row: 2,
    col: 2,
    icon: <CircleIcon />,
  },
  {
    placement: "right",
    label: "Baseline right of live",
    row: 2,
    col: 3,
    icon: <ArrowRightIcon />,
  },
  {
    placement: "below",
    label: "Baseline below live",
    row: 3,
    col: 2,
    icon: <ArrowDownIcon />,
  },
];

export function PlacementPad({
  value,
  active,
  onToggle,
  disabled,
}: PlacementPadProps) {
  return (
    <Pad role="group" aria-label="Baseline position">
      {Array.from({ length: 9 }, (_, i) => {
        const row = Math.floor(i / 3) + 1;
        const col = (i % 3) + 1;
        const btn = BUTTONS.find((b) => b.row === row && b.col === col);
        if (!btn) return <Cell key={`empty-${i}`} />;
        const pressed = active && value === btn.placement;
        const label = pressed
          ? `Hide overlay (${btn.label})`
          : btn.label;
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
