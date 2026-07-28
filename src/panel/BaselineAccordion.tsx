import React, { memo, useMemo, useState } from "react";
import {
  AddIcon,
  CheckIcon,
  ChevronSmallDownIcon,
  CommitIcon,
  CrossIcon,
  EllipsisIcon,
  GraphBarIcon,
  SyncIcon,
  TrashIcon,
} from "@storybook/icons";
import {
  ActionList,
  Button,
  PopoverProvider,
  ToggleButton,
} from "storybook/internal/components";
import { styled, type Theme } from "storybook/theming";
import type { VisualDeltaInteraction } from "../constants.js";
import type { InteractionCallTokenKind, PlayStepInfo } from "./usePlaySteps.js";
import { VD_HEADER_STICKY_TOP_VAR, panelCanvasBackground } from "./styled.js";

const List = styled.div({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  marginBottom: "0.5rem",
});

const InteractionFilter = styled.div(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  minHeight: 32,
  padding: "4px 12px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: panelCanvasBackground(theme),
}));

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
    // Only the expanded summary pins. Stacking every collapsed row at the
    // same top coordinate makes adjacent action buttons overlap after the
    // selected interaction is scrolled into view.
    position: $expanded ? "sticky" : "relative",
    // No fallback: unset → `top: auto` → behaves like relative, so docs /
    // catalog scrolls don't glue summaries over SectionBody padding.
    top: $expanded ? `var(${VD_HEADER_STICKY_TOP_VAR})` : "auto",
    zIndex: $expanded ? 1 : "auto",
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

const SyntaxContent = styled.span(({ theme }) => ({
  fontFamily: theme.typography.fonts.mono,
  fontWeight: theme.typography.weight.regular,
}));

const syntaxColor = (theme: Theme, kind: InteractionCallTokenKind) => {
  const dark = theme.base === "dark";
  switch (kind) {
    case "method":
      return dark ? "#5EC1FF" : "#0271B6";
    case "string":
      return dark ? "#5FE584" : "#16B242";
    case "number":
      return dark ? "#6ba5ff" : "#5D40D0";
    case "boolean":
      return dark ? "#ff4191" : "#f41840";
    case "nullish":
      return dark ? "#aaa" : "#7D99AA";
    case "tag":
      return dark ? "#f57bff" : "#6F2CAC";
    case "tag-suffix":
      return dark ? "#8EB5FF" : "#1F99E5";
    case "meta":
      return dark ? "#FAD483" : "#EA7509";
    default:
      return dark ? "#eee" : "#444";
  }
};

const SyntaxToken = styled.span<{ $kind: InteractionCallTokenKind }>(
  ({ theme, $kind }) => ({
    color: syntaxColor(theme, $kind),
  }),
);

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

export type BaselineSectionHistory = {
  path: string;
  label: string;
  componentPath?: string;
};

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
  /** Development-only VCS history target for this concrete baseline. */
  history?: BaselineSectionHistory;
};

/** Baseline preview shown in the expanded section toolbar. */
export const SectionThumbFrame = styled.button(({ theme }) => ({
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
  padding: 0,
  cursor: "zoom-in",
  "&:focus-visible": {
    outline: `2px solid ${theme.color.secondary}`,
    outlineOffset: 2,
  },
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
  showAllInteractions = false,
  hiddenInteractionCount = 0,
  showInteractionFilter = false,
  onExpand,
  onCreate,
  onUpdate,
  onUpdateDefault,
  onDelete,
  onToggleDistribution,
  onToggleInteractions,
  onOpenHistory,
  renderBody,
}: {
  sections: BaselineSection[];
  expandedId: BaselineSectionId | null;
  busy: boolean;
  showDistribution: boolean;
  /** Whether capture points without a baseline are visible. */
  showAllInteractions?: boolean;
  /** Number of interaction capture points hidden by the default filter. */
  hiddenInteractionCount?: number;
  /** Keep the filter available before Storybook has replayed its call log. */
  showInteractionFilter?: boolean;
  onExpand: (id: BaselineSectionId) => void;
  onCreate: (step: PlayStepInfo) => void;
  onUpdate: (step: PlayStepInfo) => void;
  /** Rewrite the story's primary (Default) baseline. */
  onUpdateDefault: () => void;
  /** Remove this exact screenshot from CSF and local storage. */
  onDelete: (section: BaselineSection) => void;
  onToggleDistribution: () => void;
  onToggleInteractions?: () => void;
  onOpenHistory?: (target: BaselineSectionHistory) => void;
  renderBody: (section: BaselineSection) => React.ReactNode;
}) {
  const [openMenuId, setOpenMenuId] = useState<BaselineSectionId | null>(null);
  const labelWidth = useMemo(() => {
    const longest = sections.reduce(
      (max, section) =>
        Math.max(max, (section.step?.syntax?.text ?? section.label).length),
      0,
    );
    // Preserve room for the baseline hint even when a resolved expectation is
    // substantially longer than the original method-only label.
    return `min(${Math.min(Math.max(longest + 1, 8), 60)}ch, 65%)`;
  }, [sections]);

  return (
    <List>
      {(showInteractionFilter || hiddenInteractionCount > 0) &&
      onToggleInteractions ? (
        <InteractionFilter>
          <ToggleButton
            size="small"
            padding="small"
            pressed={showAllInteractions}
            onClick={onToggleInteractions}
            ariaLabel={
              showAllInteractions
                ? "Hide interactions without baselines"
                : "Show all interactions"
            }
            title={
              showAllInteractions
                ? "Show only interactions with baselines"
                : hiddenInteractionCount > 0
                  ? `Show ${hiddenInteractionCount} interaction${
                      hiddenInteractionCount === 1 ? "" : "s"
                    } without baselines`
                  : "Discover and show interactions without baselines"
            }
          >
            {showAllInteractions
              ? "Baselines only"
              : hiddenInteractionCount > 0
                ? `Show all (${hiddenInteractionCount} more)`
                : "Show all interactions"}
          </ToggleButton>
        </InteractionFilter>
      ) : null}
      {sections.map((section) => {
        const expanded = expandedId === section.id;
        const hasDiff = Boolean(section.status && section.stats);
        const hasBaseline = Boolean(section.thumbSrc || section.wired?.src);
        const hasMenu =
          hasBaseline ||
          Boolean(section.history && onOpenHistory) ||
          section.id === "default" ||
          Boolean(section.step) ||
          Boolean(section.wired);
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
                  <Label title={section.step?.syntax?.text ?? section.label}>
                    {section.step?.syntax ? (
                      <SyntaxContent>
                        {section.step.syntax.tokens.map((token, index) => (
                          <SyntaxToken
                            // Repeated punctuation is expected in call syntax.
                            key={`${token.kind}-${index}`}
                            $kind={token.kind}
                          >
                            {token.text}
                          </SyntaxToken>
                        ))}
                      </SyntaxContent>
                    ) : (
                      section.label
                    )}
                  </Label>
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
                {!hasBaseline && section.step ? (
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
                {hasMenu ? (
                  <PopoverProvider
                    ariaLabel={`More ${section.label} baseline actions`}
                    placement="bottom-end"
                    padding={0}
                    visible={openMenuId === section.id}
                    onVisibleChange={(open) =>
                      setOpenMenuId(open ? section.id : null)
                    }
                    popover={() => (
                      <div style={{ minWidth: 190 }}>
                        <ActionList>
                          {section.history && onOpenHistory ? (
                            <ActionList.Item>
                              <ActionList.Action
                                ariaLabel={`Open ${section.history.label} baseline history`}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onOpenHistory(section.history!);
                                }}
                              >
                                <ActionList.Icon>
                                  <CommitIcon />
                                </ActionList.Icon>
                                <ActionList.Text>History</ActionList.Text>
                              </ActionList.Action>
                            </ActionList.Item>
                          ) : null}
                          {!hasBaseline && section.step ? (
                            <ActionList.Item>
                              <ActionList.Action
                                ariaLabel={`Create ${section.label} baseline`}
                                disabled={busy}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onCreate(section.step!);
                                }}
                              >
                                <ActionList.Icon>
                                  <AddIcon />
                                </ActionList.Icon>
                                <ActionList.Text>
                                  Create baseline
                                </ActionList.Text>
                              </ActionList.Action>
                            </ActionList.Item>
                          ) : null}
                          {section.id === "default" || section.wired ? (
                            <ActionList.Item>
                              <ActionList.Action
                                ariaLabel={`Update ${section.label} baseline`}
                                disabled={busy}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  if (section.id === "default") {
                                    onUpdateDefault();
                                    return;
                                  }
                                  if (section.step) onUpdate(section.step);
                                }}
                              >
                                <ActionList.Icon>
                                  <SyncIcon />
                                </ActionList.Icon>
                                <ActionList.Text>
                                  Update baseline
                                </ActionList.Text>
                              </ActionList.Action>
                            </ActionList.Item>
                          ) : null}
                          {hasBaseline ? (
                            <ActionList.Item>
                              <ActionList.Action
                                ariaLabel={`Delete ${section.label} screenshot`}
                                disabled={busy}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onDelete(section);
                                }}
                              >
                                <ActionList.Icon>
                                  <TrashIcon />
                                </ActionList.Icon>
                                <ActionList.Text>
                                  Delete screenshot
                                </ActionList.Text>
                              </ActionList.Action>
                            </ActionList.Item>
                          ) : null}
                        </ActionList>
                      </div>
                    )}
                  >
                    <Button
                      size="small"
                      variant="ghost"
                      padding="small"
                      ariaLabel={`More ${section.label} baseline actions`}
                      title={`More ${section.label} baseline actions`}
                    >
                      <EllipsisIcon />
                    </Button>
                  </PopoverProvider>
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
