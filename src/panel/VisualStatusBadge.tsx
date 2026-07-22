import React, { memo } from "react";
import { TooltipNote, WithTooltip } from "storybook/internal/components";
import { styled, typography } from "storybook/theming";

export type VisualBadgeStatus = "pass" | "fail";

const StatusColorMapping = {
  pass: "positive",
  fail: "negative",
} as const;

const StatusTextMapping = {
  pass: "Pass",
  fail: "Fail",
} as const;

const StatusNoteMapping = {
  pass: "Live compare is within the pass threshold",
  fail: "Live compare exceeds the pass threshold",
} as const;

/** Shared chip typography — PASS badge and Diff action. */
export const badgeChipStyles = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "4px 6px 4px 8px",
  borderRadius: "4px",
  color: "white",
  fontFamily: typography.fonts.base,
  textTransform: "uppercase" as const,
  fontSize: typography.size.s1,
  letterSpacing: 3,
  fontWeight: typography.weight.bold,
  minWidth: 65,
  textAlign: "center" as const,
  border: "none",
  lineHeight: 1.2,
};

const StyledBadge = styled.div<{ status: VisualBadgeStatus }>(
  ({ theme, status }) => ({
    ...badgeChipStyles,
    backgroundColor: theme.color[StatusColorMapping[status]],
  }),
);

/** Action chip matching PASS/FAIL typography (e.g. Diff). */
export const BadgeActionButton = styled.button(({ theme }) => ({
  ...badgeChipStyles,
  backgroundColor: theme.color.secondary,
  cursor: "pointer",
  "&:hover:not(:disabled)": {
    filter: "brightness(1.05)",
  },
  "&:disabled": {
    opacity: 0.5,
    cursor: "not-allowed",
  },
}));

export const VisualStatusBadge = memo(function VisualStatusBadge({
  status,
}: {
  status: VisualBadgeStatus;
}) {
  const badgeText = StatusTextMapping[status];
  const badgeNote = StatusNoteMapping[status];

  return (
    <WithTooltip
      hasChrome={false}
      placement="top"
      trigger="hover"
      tooltip={<TooltipNote note={badgeNote} />}
    >
      <StyledBadge aria-label={`Visual status: ${badgeText}`} status={status}>
        {badgeText}
      </StyledBadge>
    </WithTooltip>
  );
});
