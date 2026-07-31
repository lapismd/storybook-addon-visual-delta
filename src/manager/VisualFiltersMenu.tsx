import React, { useState } from "react";
import { DeleteIcon, FilterIcon } from "@storybook/icons";
import {
  ActionList,
  Button,
  Form,
  PopoverProvider,
  ScrollArea,
} from "storybook/internal/components";
import { styled } from "storybook/theming";
import {
  VISUAL_FILTER_GROUPS,
  VISUAL_QUICK_FILTER_IDS,
  filterSelectionState,
  invertFilterPolarity,
  toggleFilterCheckbox,
} from "./visual-filters.js";

const FilterButton = styled(Button)({
  position: "relative",
  minWidth: 28,
  width: 28,
  height: 28,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "visible",
  "& svg": { width: 14, height: 14 },
});

const Count = styled.span(({ theme }) => ({
  position: "absolute",
  zIndex: 1,
  top: -8,
  right: -8,
  width: 18,
  height: 18,
  border: `2px solid ${theme.background.content}`,
  borderRadius: "50%",
  boxSizing: "border-box",
  background: theme.color.secondary,
  color: theme.color.lightest,
  fontSize: 9,
  fontWeight: theme.typography.weight.bold,
  lineHeight: "14px",
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
  pointerEvents: "none",
}));

const MenuScrollArea = styled(ScrollArea)({
  width: 310,
  height: "min(620px, calc(100vh - 80px))",
});

const Menu = styled.div(({ theme }) => ({
  padding: 8,
  color: theme.color.defaultText,
  background: theme.background.content,
}));

const Section = styled.fieldset(({ theme }) => ({
  border: 0,
  borderTop: `1px solid ${theme.appBorderColor}`,
  margin: "8px 0 0",
  padding: "8px 0 0",
  minWidth: 0,
}));

const Legend = styled.legend(({ theme }) => ({
  padding: "0 4px 0 0",
  fontSize: theme.typography.size.s1 - 1,
  fontWeight: theme.typography.weight.bold,
  color: theme.textMutedColor,
}));

const FilterActionList = styled(ActionList)({
  padding: 0,
  margin: 0,
  "& + *": {
    borderTop: "none",
  },
});

const MutedText = styled.span(({ theme }) => ({
  color: theme.textMutedColor,
}));

/** One child of ActionList.Text — its default column layout stacks sibling spans. */
const FilterLabelRow = styled.div({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  width: "100%",
  minWidth: 0,
});

const FilterLabel = styled.span({
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const OptionCount = styled.span(({ theme }) => ({
  fontVariantNumeric: "tabular-nums",
  color: theme.textMutedColor,
  flexShrink: 0,
  minWidth: 18,
  textAlign: "right",
}));

const QuickViews = styled.div({
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 4,
});

const QuickButton = styled(Button)({
  justifyContent: "space-between",
  width: "100%",
});

const QuickCount = styled.span(({ theme }) => ({
  fontVariantNumeric: "tabular-nums",
  color: theme.textMutedColor,
  fontSize: theme.typography.size.s1 - 1,
  marginLeft: 8,
}));

const Footer = styled.div({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 8,
  paddingTop: 8,
});

const Note = styled.div(({ theme }) => ({
  fontSize: theme.typography.size.s1 - 2,
  lineHeight: 1.35,
  color: theme.textMutedColor,
  padding: "6px 4px 0",
}));

const Summary = styled.div(({ theme }) => ({
  fontSize: theme.typography.size.s1 - 1,
  lineHeight: 1.35,
  color: theme.color.defaultText,
  padding: "8px 4px 0",
  fontVariantNumeric: "tabular-nums",
}));

const LABELS: Record<string, string> = {
  "quick.needs-attention": "Needs attention",
  "quick.review-queue": "Review queue",
  "quick.coverage-gaps": "Coverage gaps",
  "review.ready": "Ready for review",
  "review.pending": "Pending review",
  "review.approved": "Approved",
  "review.failed": "Failed / rejected",
  "review.unreviewed": "Unreviewed",
  "result.mismatch": "Baseline mismatch",
  "result.changed-within-tolerance": "Changed within tolerance",
  "result.passed": "Passed",
  "result.error": "Visual run error",
  "result.not-run": "Not run in latest run",
  "coverage.present": "Has primary baseline",
  "coverage.missing": "Missing primary baseline",
  "coverage.unresolved": "Unresolved baseline path",
  "inclusion.skipped": "Visually skipped",
};

const GROUP_LABELS = {
  review: "Review",
  result: "Latest result",
  coverage: "Coverage",
  inclusion: "Inclusion",
};

export type VisualFiltersMenuProps = {
  activeIds: readonly string[];
  resultFiltersEnabled: boolean;
  alwaysVisibleErrorCount?: number;
  /** Per filter-id story population counts. */
  optionCounts?: Readonly<Record<string, number>>;
  /** Stories matching the current selection vs catalog total. */
  matchingSummary?: { matching: number; total: number };
  onChange: (ids: string[]) => void;
};

export function VisualFiltersMenu({
  activeIds,
  resultFiltersEnabled,
  alwaysVisibleErrorCount = 0,
  optionCounts = {},
  matchingSummary,
  onChange,
}: VisualFiltersMenuProps) {
  const [open, setOpen] = useState(false);
  const activeCount = activeIds.length;

  return (
    <PopoverProvider
      ariaLabel="Filter visual stories"
      placement="bottom-end"
      padding={0}
      visible={open}
      onVisibleChange={setOpen}
      popover={() => (
        <MenuScrollArea vertical scrollPadding={8}>
          <Menu role="dialog" aria-label="Visual story filters">
            <QuickViews aria-label="Quick views">
              {VISUAL_QUICK_FILTER_IDS.map((id) => {
                const selected = activeIds.includes(id);
                const count = optionCounts[id] ?? 0;
                return (
                  <QuickButton
                    key={id}
                    size="small"
                    variant={selected ? "solid" : "ghost"}
                    ariaLabel={false}
                    onClick={() => onChange(selected ? [] : [id])}
                  >
                    <span>{LABELS[id]}</span>
                    <QuickCount aria-hidden="true">{count}</QuickCount>
                  </QuickButton>
                );
              })}
            </QuickViews>
            {(
              Object.entries(VISUAL_FILTER_GROUPS) as Array<
                [keyof typeof VISUAL_FILTER_GROUPS, readonly string[]]
              >
            ).map(([group, ids]) => {
              const disabled = group === "result" && !resultFiltersEnabled;
              return (
                <Section key={group}>
                  <Legend>{GROUP_LABELS[group]}</Legend>
                  <FilterActionList aria-label={GROUP_LABELS[group]}>
                    {ids.map((id) => {
                      const state = filterSelectionState(activeIds, id);
                      const excluded = state === "excluded";
                      const checked = state !== "off";
                      const count = optionCounts[id] ?? 0;
                      const invertLabel = excluded ? "Include" : "Exclude";
                      const targetId = `visual-filter-${id}`;
                      return (
                        <ActionList.HoverItem key={id} targetId={targetId}>
                          <ActionList.Action
                            as="label"
                            ariaLabel={false}
                            tabIndex={-1}
                          >
                            <ActionList.Icon>
                              {excluded ? <DeleteIcon aria-hidden /> : null}
                              <Form.Checkbox
                                name={LABELS[id]}
                                aria-label={
                                  excluded
                                    ? `${LABELS[id]} (excluded)`
                                    : LABELS[id]
                                }
                                checked={checked}
                                disabled={disabled}
                                onChange={() =>
                                  onChange(toggleFilterCheckbox(activeIds, id))
                                }
                              />
                            </ActionList.Icon>
                            <ActionList.Text>
                              <FilterLabelRow>
                                <FilterLabel>
                                  {LABELS[id]}
                                  {excluded ? (
                                    <MutedText> (excluded)</MutedText>
                                  ) : null}
                                </FilterLabel>
                                <OptionCount
                                  data-testid={`visual-filter-option-count-${id}`}
                                  aria-hidden="true"
                                >
                                  {excluded ? <s>{count}</s> : count}
                                </OptionCount>
                              </FilterLabelRow>
                            </ActionList.Text>
                          </ActionList.Action>
                          <ActionList.Button
                            data-target-id={targetId}
                            size="small"
                            disabled={disabled}
                            ariaLabel={false}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onChange(invertFilterPolarity(activeIds, id));
                            }}
                          >
                            <span style={{ minWidth: 45 }}>{invertLabel}</span>
                          </ActionList.Button>
                        </ActionList.HoverItem>
                      );
                    })}
                  </FilterActionList>
                  {disabled ? (
                    <Note>Run visual tests once to enable result filters.</Note>
                  ) : null}
                </Section>
              );
            })}
            {matchingSummary && activeCount > 0 ? (
              <Summary data-testid="visual-filter-match-summary" role="status">
                Showing {matchingSummary.matching} of {matchingSummary.total}{" "}
                {matchingSummary.total === 1 ? "story" : "stories"}
              </Summary>
            ) : null}
            {alwaysVisibleErrorCount > 0 && activeCount > 0 ? (
              <Note role="status">
                {alwaysVisibleErrorCount} Storybook error{" "}
                {alwaysVisibleErrorCount === 1
                  ? "story remains"
                  : "stories remain"}{" "}
                visible so failures cannot be hidden.
              </Note>
            ) : null}
            <Footer>
              <Note>
                Includes OR within a group; excludes AND. Groups combine with
                AND. Exclude uses <code>!</code> in the URL.
              </Note>
              <Button
                size="small"
                variant="ghost"
                ariaLabel={false}
                disabled={!activeCount}
                onClick={() => onChange([])}
              >
                Clear
              </Button>
            </Footer>
          </Menu>
        </MenuScrollArea>
      )}
    >
      <FilterButton
        size="small"
        variant={activeCount ? "solid" : "ghost"}
        ariaLabel={
          activeCount
            ? `Filter visual stories, ${activeCount} active`
            : "Filter visual stories"
        }
        title="Filter visual stories"
      >
        <FilterIcon />
        {activeCount ? (
          <Count aria-hidden="true" data-testid="visual-filter-count">
            {activeCount}
          </Count>
        ) : null}
      </FilterButton>
    </PopoverProvider>
  );
}
