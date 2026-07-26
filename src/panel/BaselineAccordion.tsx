import React, { memo, useMemo } from "react";
import {
  AddIcon,
  CheckIcon,
  ChevronSmallDownIcon,
  CrossIcon,
  GraphBarIcon,
  SyncIcon,
} from "@storybook/icons";
import { Button, ToggleButton } from "storybook/internal/components";
import { styled } from "storybook/theming";
import type { VisualDeltaInteraction } from "../constants.js";
import type { PlayStepInfo } from "./usePlaySteps.js";
import { VD_HEADER_STICKY_TOP_VAR, panelCanvasBackground } from "./styled.js";

const List = styled.div({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  marginBottom: "0.5rem",
});

/** Per-section wrapper so sticky summaries are constrained to their body. */
const Section = styled.div<{ $expanded?: boolean }>(({ $expanded }) => ({
  display: "flex",
  flexDirection: "column",
  // Expanded section consumes remaining panel height; collapsed stays content-sized.
  ...($expanded ? { flex: 1, minHeight: 0 } : null),
}));

const SummaryRow = styled.div<{ $expanded?: boolean }>(
  ({ theme, $expanded }) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    minHeight: 32,
    textAlign: "left",
    border: "none",
    borderBottom: `1px solid ${theme.appBorderColor}`,
    background: $expanded
      ? theme.background.hoverable
      : panelCanvasBackground(theme),
    color: theme.color.defaultText,
    padding: "4px 12px 4px 0",
    position: "sticky",
    // Only pins when the live panel publishes `--vd-header-sticky-top`.
    // No fallback: unset → `top: auto` → behaves like relative, so docs /
    // catalog scrolls don't glue summaries over SectionBody padding.
    top: `var(${VD_HEADER_STICKY_TOP_VAR})`,
    zIndex: 1,
    "&:hover": {
      background: theme.background.hoverable,
    },
  }),
);

const SummaryButton = styled.button({
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  minHeight: 24,
  flex: 1,
  alignSelf: "stretch",
  border: "none",
  background: "transparent",
  color: "inherit",
  padding: "0 0 0 12px",
  cursor: "pointer",
  font: "inherit",
  textAlign: "left",
  "& *": {
    cursor: "inherit",
  },
});

const Chevron = styled.span<{ $expanded?: boolean }>(
  ({ theme, $expanded }) => ({
    display: "inline-flex",
    flexShrink: 0,
    width: 12,
    color: theme.textMutedColor,
    transform: $expanded ? "rotate(0deg)" : "rotate(-90deg)",
    transition: "transform 120ms ease",
    "& svg": { width: 12, height: 12 },
  }),
);

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
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: "12px 16px 16px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: panelCanvasBackground(theme),
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
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
  onUpdateDefault,
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
  /** Rewrite the story's primary (Default) baseline. */
  onUpdateDefault: () => void;
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
          <Section key={section.id} $expanded={expanded}>
            {/*
              Avoid Storybook Collapsible’s opacity/translate transition —
              swapping sections animated both collapse + expand and felt like
              the whole Visual Delta panel flickering.
            */}
            <SummaryRow $expanded={expanded}>
              <SummaryButton
                type="button"
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
                <SummaryRight>
                  {section.stats ? <Stats>{section.stats}</Stats> : null}
                </SummaryRight>
              </SummaryButton>
              <SummaryActions>
                {expanded && hasDiff ? (
                  <ToggleButton
                    size="small"
                    padding="small"
                    pressed={showDistribution}
                    onClick={onToggleDistribution}
                    ariaLabel="Difference distribution"
                    title="Difference distribution"
                    aria-expanded={showDistribution}
                  >
                    <GraphBarIcon />
                  </ToggleButton>
                ) : null}
                {section.id === "default" || section.wired ? (
                  <Button
                    size="small"
                    variant="ghost"
                    padding="small"
                    disabled={busy}
                    ariaLabel="Update baseline"
                    title="Update baseline"
                    onClick={() => {
                      if (section.id === "default") {
                        onUpdateDefault();
                        return;
                      }
                      if (section.step) onUpdate(section.step);
                    }}
                  >
                    <SyncIcon />
                  </Button>
                ) : section.step ? (
                  <Button
                    size="small"
                    variant="ghost"
                    padding="small"
                    disabled={busy}
                    ariaLabel="Create baseline"
                    title="Create baseline"
                    onClick={() => onCreate(section.step!)}
                  >
                    <AddIcon />
                  </Button>
                ) : null}
              </SummaryActions>
            </SummaryRow>
            {expanded ? <SectionBody>{renderBody(section)}</SectionBody> : null}
          </Section>
        );
      })}
    </List>
  );
});
