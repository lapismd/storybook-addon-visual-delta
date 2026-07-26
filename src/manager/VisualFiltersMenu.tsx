import React, { useState } from "react";
import { FilterIcon } from "@storybook/icons";
import {
  Button,
  Form,
  PopoverProvider,
  ScrollArea,
} from "storybook/internal/components";
import { styled } from "storybook/theming";
import {
  VISUAL_FILTER_GROUPS,
  VISUAL_QUICK_FILTER_IDS,
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
  width: 290,
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

const CheckRow = styled.label<{ disabled?: boolean }>(
  ({ disabled, theme }) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    minHeight: 28,
    padding: "2px 4px",
    borderRadius: 4,
    cursor: disabled ? "not-allowed" : "pointer",
    color: disabled ? theme.textMutedColor : theme.color.defaultText,
    opacity: disabled ? 0.65 : 1,
    "&:hover": disabled ? {} : { background: theme.background.hoverable },
  }),
);

const QuickViews = styled.div({
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 4,
});

const QuickButton = styled(Button)({
  justifyContent: "flex-start",
  width: "100%",
});

const Footer = styled.div({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  paddingTop: 8,
});

const Note = styled.div(({ theme }) => ({
  fontSize: theme.typography.size.s1 - 2,
  lineHeight: 1.35,
  color: theme.textMutedColor,
  padding: "6px 4px 0",
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
  "inclusion.included": "Included",
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
  onChange: (ids: string[]) => void;
};

export function VisualFiltersMenu({
  activeIds,
  resultFiltersEnabled,
  alwaysVisibleErrorCount = 0,
  onChange,
}: VisualFiltersMenuProps) {
  const [open, setOpen] = useState(false);
  const active = new Set(activeIds);
  const toggleFacet = (id: string) => {
    const next = new Set(
      activeIds.filter((item) => !item.startsWith("quick.")),
    );
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

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
              {VISUAL_QUICK_FILTER_IDS.map((id) => (
                <QuickButton
                  key={id}
                  size="small"
                  variant={active.has(id) ? "solid" : "ghost"}
                  ariaLabel={false}
                  onClick={() => onChange(active.has(id) ? [] : [id])}
                >
                  {LABELS[id]}
                </QuickButton>
              ))}
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
                  {ids.map((id) => (
                    <CheckRow key={id} disabled={disabled}>
                      <Form.Checkbox
                        name={LABELS[id]}
                        checked={active.has(id)}
                        disabled={disabled}
                        onChange={() => toggleFacet(id)}
                      />
                      <span>{LABELS[id]}</span>
                    </CheckRow>
                  ))}
                  {disabled ? (
                    <Note>Run visual tests once to enable result filters.</Note>
                  ) : null}
                </Section>
              );
            })}
            {alwaysVisibleErrorCount > 0 && activeIds.length > 0 ? (
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
                Groups combine with AND; choices within a group use OR.
              </Note>
              <Button
                size="small"
                variant="ghost"
                ariaLabel={false}
                disabled={!activeIds.length}
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
        variant={activeIds.length ? "solid" : "ghost"}
        ariaLabel={
          activeIds.length
            ? `Filter visual stories, ${activeIds.length} active`
            : "Filter visual stories"
        }
        title="Filter visual stories"
      >
        <FilterIcon />
        {activeIds.length ? (
          <Count aria-hidden="true" data-testid="visual-filter-count">
            {activeIds.length}
          </Count>
        ) : null}
      </FilterButton>
    </PopoverProvider>
  );
}
