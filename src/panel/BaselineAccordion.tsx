import React, { memo, useMemo } from "react";
import {
  CheckIcon,
  ChevronSmallDownIcon,
  CrossIcon,
  GraphBarIcon,
} from "@storybook/icons";
import { Button, Collapsible, ToggleButton } from "storybook/internal/components";
import { styled } from "storybook/theming";
import type { VisualDeltaInteraction } from "../constants.js";
import type { PlayStepInfo } from "./usePlaySteps.js";
import { DiffToolLabel } from "./styled.js";

const List = styled.div({
  display: "flex",
  flexDirection: "column",
  marginBottom: "0.5rem",
});

const SummaryButton = styled.button<{ $expanded?: boolean }>(
  ({ theme, $expanded }) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    minHeight: 32,
    textAlign: "left",
    border: "none",
    borderBottom: `1px solid ${theme.appBorderColor}`,
    background: $expanded ? theme.background.hoverable : "transparent",
    color: theme.color.defaultText,
    padding: "4px 12px",
    cursor: "pointer",
    font: "inherit",
    "&:hover": {
      cursor: "pointer",
      background: theme.background.hoverable,
    },
    "& *": {
      cursor: "inherit",
    },
  }),
);

const Chevron = styled.span<{ $expanded?: boolean }>(({ theme, $expanded }) => ({
  display: "inline-flex",
  flexShrink: 0,
  width: 12,
  color: theme.textMutedColor,
  transform: $expanded ? "rotate(0deg)" : "rotate(-90deg)",
  transition: "transform 120ms ease",
  "& svg": { width: 12, height: 12 },
}));

const StatusSlot = styled.span({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: 14,
  height: 14,
});

const StatusIcon = styled.span<{ $passed: boolean }>(({ theme, $passed }) => ({
  display: "inline-flex",
  color: $passed ? theme.color.positive : theme.color.negative,
  "& svg": { width: 14, height: 14 },
}));

const Meta = styled.div<{ $labelWidth: string }>(({ $labelWidth }) => ({
  display: "grid",
  gridTemplateColumns: `${$labelWidth} minmax(0, 1fr)`,
  alignItems: "center",
  columnGap: 12,
  minWidth: 0,
  flex: 1,
}));

const Label = styled.span(({ theme }) => ({
  fontSize: theme.typography.size.s2,
  fontWeight: theme.typography.weight.bold,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const Hint = styled.span(({ theme }) => ({
  fontSize: theme.typography.size.s1,
  color: theme.textMutedColor,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const SummaryRight = styled.div({
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexShrink: 0,
  marginLeft: "auto",
});

const Stats = styled.span(({ theme }) => ({
  fontSize: theme.typography.size.s1,
  color: theme.textMutedColor,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
}));

const SummaryActions = styled.div({
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
});

const SectionBody = styled.div(({ theme }) => ({
  padding: "8px 12px 12px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: theme.background.content,
}));

export type BaselineSectionId = "default" | string;

export type BaselineSectionStatus = "pass" | "fail";

export type BaselineSection = {
  id: BaselineSectionId;
  label: string;
  hint: string;
  thumbSrc?: string;
  step?: PlayStepInfo;
  wired?: VisualDeltaInteraction;
  /** Live compare outcome for the currently loaded baseline, if any. */
  status?: BaselineSectionStatus | null;
  /** Compact pass/fail stats shown on the right of the accordion header. */
  stats?: string | null;
};

/** Baseline preview shown in the expanded section toolbar. */
export const SectionThumbFrame = styled.div(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 88,
  height: 56,
  flexShrink: 0,
  borderRadius: 4,
  border: `1px solid ${theme.appBorderColor}`,
  background: theme.background.app,
  overflow: "hidden",
}));

export const SectionThumb = styled.img({
  display: "block",
  maxWidth: "100%",
  maxHeight: "100%",
  width: "auto",
  height: "auto",
  objectFit: "contain",
});

export const BaselineAccordion = memo(function BaselineAccordion({
  sections,
  expandedId,
  busy,
  showDistribution,
  onExpand,
  onCreate,
  onUpdate,
  onToggleDistribution,
  renderBody,
}: {
  sections: BaselineSection[];
  expandedId: BaselineSectionId | null;
  busy: boolean;
  showDistribution: boolean;
  onExpand: (id: BaselineSectionId) => void;
  onCreate: (step: PlayStepInfo) => void;
  onUpdate: (step: PlayStepInfo) => void;
  onToggleDistribution: () => void;
  renderBody: (section: BaselineSection) => React.ReactNode;
}) {
  const labelWidth = useMemo(() => {
    const longest = sections.reduce(
      (max, section) => Math.max(max, section.label.length),
      0,
    );
    // Bold s2 labels run a bit wider than plain `ch`; pad slightly.
    return `${Math.max(longest + 1, 8)}ch`;
  }, [sections]);

  return (
    <List>
      {sections.map((section) => {
        const expanded = expandedId === section.id;
        const hasDiff = Boolean(section.status && section.stats);
        return (
          <Collapsible
            key={section.id}
            collapsed={!expanded}
            summary={() => (
              <SummaryButton
                type="button"
                $expanded={expanded}
                aria-expanded={expanded}
                onClick={() => onExpand(section.id)}
              >
                <Chevron $expanded={expanded} aria-hidden>
                  <ChevronSmallDownIcon />
                </Chevron>
                <StatusSlot>
                  {section.status ? (
                    <StatusIcon
                      $passed={section.status === "pass"}
                      aria-label={
                        section.status === "pass" ? "Passed" : "Failed"
                      }
                    >
                      {section.status === "pass" ? (
                        <CheckIcon />
                      ) : (
                        <CrossIcon />
                      )}
                    </StatusIcon>
                  ) : null}
                </StatusSlot>
                <Meta $labelWidth={labelWidth}>
                  <Label title={section.label}>{section.label}</Label>
                  <Hint title={section.hint}>{section.hint}</Hint>
                </Meta>
                <SummaryRight
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  {section.stats ? <Stats>{section.stats}</Stats> : null}
                  <SummaryActions>
                    {expanded && hasDiff ? (
                      <ToggleButton
                        size="small"
                        pressed={showDistribution}
                        onClick={onToggleDistribution}
                        aria-label="Toggle difference distribution"
                        aria-expanded={showDistribution}
                        title="Difference distribution"
                      >
                        <DiffToolLabel>
                          <GraphBarIcon />
                          Distribution
                        </DiffToolLabel>
                      </ToggleButton>
                    ) : null}
                    {section.step ? (
                      section.wired ? (
                        <Button
                          size="small"
                          disabled={busy}
                          onClick={() => onUpdate(section.step!)}
                        >
                          Update
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          disabled={busy}
                          onClick={() => onCreate(section.step!)}
                        >
                          Create
                        </Button>
                      )
                    ) : null}
                  </SummaryActions>
                </SummaryRight>
              </SummaryButton>
            )}
          >
            {expanded ? (
              <SectionBody>{renderBody(section)}</SectionBody>
            ) : null}
          </Collapsible>
        );
      })}
    </List>
  );
});
