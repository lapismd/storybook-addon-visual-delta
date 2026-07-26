import React from "react";
import { ActionList, Form } from "storybook/internal/components";
import { styled } from "storybook/theming";
import {
  VisualBaselineSplitButton,
  baselineWriteRowLabel,
  type BaselineWriteMode,
} from "./VisualBaselineSplitButton.js";
import { VisualFiltersMenu } from "./VisualFiltersMenu.js";

export type VisualModuleChipStatus =
  | "positive"
  | "negative"
  | "critical"
  | "warning"
  | "unknown";

const Container = styled.div({
  display: "flex",
  flexDirection: "column",
  paddingBottom: 1,
});

const ModuleContainer = styled(Container)({
  paddingTop: 4,
});

/** Fixed status-line width so streamed log text does not resize the popover. */
const STATUS_LINE_WIDTH = 180;

const ContextMenuContainer = styled(Container)(({ theme }) => ({
  borderTop: `1px solid ${theme.appBorderColor}`,
  paddingTop: 4,
  marginTop: 4,
  overflow: "hidden",
}));

const Heading = styled.div({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 0",
  gap: 12,
  minWidth: 0,
  width: "100%",
});

const Info = styled.div({
  display: "flex",
  flexDirection: "column",
  marginLeft: 8,
  flex: "1 1 0%",
  minWidth: 0,
  overflow: "hidden",
});

const Title = styled.div(({ theme }) => ({
  fontSize: theme.typography.size.s1,
  color: theme.color.defaultText,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const Description = styled.div(({ theme }) => ({
  fontSize: theme.typography.size.s1 - 1,
  color: theme.textMutedColor,
  width: STATUS_LINE_WIDTH,
  maxWidth: STATUS_LINE_WIDTH,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const Actions = styled.div({
  display: "flex",
  gap: 4,
  alignItems: "center",
  flexShrink: 0,
});

const StyledActionList = styled(ActionList)({
  padding: 0,
});

const RowLabel = styled.div({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  gap: 1,
});

const RowProgress = styled.small(({ theme }) => ({
  fontSize: theme.typography.size.s1 - 2,
  color: theme.textMutedColor,
  lineHeight: 1.2,
}));

const ChipProgress = styled.span(({ theme }) => ({
  fontSize: theme.typography.size.s1 - 2,
  color: theme.textMutedColor,
  fontVariantNumeric: "tabular-nums",
  marginRight: 2,
}));

const TestStatusIcon = styled.div<{
  status: VisualModuleChipStatus;
  isRunning?: boolean;
}>(({ status, isRunning, theme }) => ({
  width: 6,
  height: 6,
  margin: 4,
  borderRadius: "50%",
  background: "var(--status-color)",
  ...(isRunning
    ? { animation: `${theme.animation.glow} 1.5s ease-in-out infinite` }
    : null),
  ...(status === "positive"
    ? { "--status-color": theme.color.positive }
    : null),
  ...(status === "warning" ? { "--status-color": theme.color.gold } : null),
  ...(status === "negative"
    ? { "--status-color": theme.color.negative }
    : null),
  ...(status === "critical"
    ? { "--status-color": theme.color.defaultText }
    : null),
  ...(status === "unknown" ? { "--status-color": theme.textMutedColor } : null),
}));

export type VisualTestModuleUIProps = {
  /** Global Testing Module vs sidebar story/component context menu. */
  variant: "global" | "context";
  statusLine: React.ReactNode;
  runVisualEnabled: boolean;
  createBaselinesEnabled: boolean;
  updateStatusEnabled: boolean;
  /** Force build-storybook before create/update/compare captures. */
  rebuildStaticEnabled: boolean;
  baselineMode: BaselineWriteMode;
  runnerBusy: boolean;
  anyActionSelected: boolean;
  compareChipStatus: VisualModuleChipStatus;
  compareChipLabel: string;
  compareChipCount: number | null;
  compareChipDisabled: boolean;
  baselineChipStatus: VisualModuleChipStatus;
  baselineChipTooltip: string;
  statusChipStatus: VisualModuleChipStatus;
  statusChipLabel: string | null;
  /** Live `completed/total` under the compare checkbox while running. */
  compareRowProgress?: string | null;
  /** Live `completed/total` under the baselines checkbox while writing. */
  baselineRowProgress?: string | null;
  /** Live `completed/total` under Update status while stamping tags. */
  statusRowProgress?: string | null;
  isWritingBaselines: boolean;
  isUpdatingStatus: boolean;
  isCompareRunning: boolean;
  onRunVisualChange: (enabled: boolean) => void;
  onCreateBaselinesChange: (enabled: boolean) => void;
  onUpdateStatusChange: (enabled: boolean) => void;
  onRebuildStaticChange: (enabled: boolean) => void;
  onBaselineModeChange: (mode: BaselineWriteMode) => void;
  onRun: () => void;
  onStop: () => void;
  onOpenCompareResults: () => void;
  onOpenBaselineStatus: () => void;
  onOpenStatusResults: () => void;
  /** Development-only custom Visual Delta sidebar filters. */
  visualFilters?: {
    activeIds: readonly string[];
    resultFiltersEnabled: boolean;
    alwaysVisibleErrorCount?: number;
    onChange: (ids: string[]) => void;
  };
};

/**
 * Shared Testing Module chrome for the global runner and sidebar context menu.
 */
export function VisualTestModuleUI({
  variant,
  statusLine,
  runVisualEnabled,
  createBaselinesEnabled,
  updateStatusEnabled,
  rebuildStaticEnabled,
  baselineMode,
  runnerBusy,
  anyActionSelected,
  compareChipStatus,
  compareChipLabel,
  compareChipCount,
  compareChipDisabled,
  baselineChipStatus,
  baselineChipTooltip,
  statusChipStatus,
  statusChipLabel,
  compareRowProgress = null,
  baselineRowProgress = null,
  statusRowProgress = null,
  isWritingBaselines,
  isUpdatingStatus,
  isCompareRunning,
  onRunVisualChange,
  onCreateBaselinesChange,
  onUpdateStatusChange,
  onRebuildStaticChange,
  onBaselineModeChange,
  onRun,
  onStop,
  onOpenCompareResults,
  onOpenBaselineStatus,
  onOpenStatusResults,
  visualFilters,
}: VisualTestModuleUIProps) {
  const Root = variant === "context" ? ContextMenuContainer : ModuleContainer;
  const baselineRowLabel = baselineWriteRowLabel(baselineMode);
  const runnerChipStatus: VisualModuleChipStatus = isUpdatingStatus
    ? "warning"
    : isWritingBaselines
      ? baselineChipStatus
      : compareChipStatus;
  const compareChipValue = isCompareRunning
    ? compareRowProgress
    : compareChipCount;
  const baselineChipValue = isWritingBaselines ? baselineRowProgress : null;
  const statusChipValue = isUpdatingStatus ? statusRowProgress : null;
  const statusTitle =
    typeof statusLine === "string" && statusLine.trim()
      ? statusLine
      : undefined;

  return (
    <Root data-testid={`visual-test-module-${variant}`}>
      <Heading>
        <Info>
          <Title>Run visual tests</Title>
          <Description
            id={`visual-testing-module-description-${variant}`}
            title={statusTitle}
          >
            {statusLine}
          </Description>
        </Info>
        <Actions>
          {variant === "global" && visualFilters ? (
            <VisualFiltersMenu {...visualFilters} />
          ) : null}
          <VisualBaselineSplitButton
            status={runnerChipStatus}
            isRunning={runnerBusy}
            ariaLabel="Run selected visual actions"
            tooltip={
              anyActionSelected
                ? "Run selected actions"
                : "Select at least one action below"
            }
            mode={baselineMode}
            onModeChange={onBaselineModeChange}
            mainIcon="play"
            writeOnMainClick={false}
            disabled={!anyActionSelected || runnerBusy}
            onRun={onRun}
            onStop={onStop}
          />
        </Actions>
      </Heading>
      <StyledActionList>
        <ActionList.Item>
          <ActionList.Action as="label" ariaLabel={false}>
            <ActionList.Icon>
              <Form.Checkbox
                name="Run visual tests"
                checked={runVisualEnabled}
                disabled={runnerBusy}
                onChange={(event) => {
                  onRunVisualChange(event.currentTarget.checked);
                }}
              />
            </ActionList.Icon>
            <ActionList.Text>
              <RowLabel>
                <span>Run visual tests</span>
                {compareRowProgress ? (
                  <RowProgress data-testid="compare-row-progress">
                    {compareRowProgress}
                  </RowProgress>
                ) : null}
              </RowLabel>
            </ActionList.Text>
          </ActionList.Action>
          <ActionList.Button
            ariaLabel={
              compareRowProgress
                ? `${compareChipLabel} (${compareRowProgress})`
                : compareChipCount != null
                  ? `${compareChipLabel} (${compareChipCount} failed)`
                  : compareChipLabel
            }
            tooltip={compareChipLabel}
            disabled={compareChipDisabled}
            onClick={onOpenCompareResults}
          >
            {compareChipValue != null ? (
              <ChipProgress>{compareChipValue}</ChipProgress>
            ) : null}
            <TestStatusIcon
              status={compareChipStatus}
              isRunning={isCompareRunning}
            />
          </ActionList.Button>
        </ActionList.Item>
        <ActionList.Item>
          <ActionList.Action as="label" ariaLabel={false}>
            <ActionList.Icon>
              <Form.Checkbox
                name={baselineRowLabel}
                checked={createBaselinesEnabled}
                disabled={runnerBusy}
                onChange={(event) => {
                  onCreateBaselinesChange(event.currentTarget.checked);
                }}
              />
            </ActionList.Icon>
            <ActionList.Text>
              <RowLabel>
                <span>{baselineRowLabel}</span>
                {baselineRowProgress ? (
                  <RowProgress data-testid="baseline-row-progress">
                    {baselineRowProgress}
                  </RowProgress>
                ) : null}
              </RowLabel>
            </ActionList.Text>
          </ActionList.Action>
          <ActionList.Button
            ariaLabel={
              baselineRowProgress
                ? `${baselineChipTooltip} (${baselineRowProgress})`
                : baselineChipTooltip
            }
            tooltip={baselineChipTooltip}
            disabled={!createBaselinesEnabled && !isWritingBaselines}
            onClick={onOpenBaselineStatus}
          >
            {baselineChipValue != null ? (
              <ChipProgress>{baselineChipValue}</ChipProgress>
            ) : null}
            <TestStatusIcon
              status={baselineChipStatus}
              isRunning={isWritingBaselines}
            />
          </ActionList.Button>
        </ActionList.Item>
        <ActionList.Item>
          <ActionList.Action as="label" ariaLabel={false}>
            <ActionList.Icon>
              <Form.Checkbox
                name="Update status"
                checked={updateStatusEnabled}
                disabled={runnerBusy}
                onChange={(event) => {
                  onUpdateStatusChange(event.currentTarget.checked);
                }}
              />
            </ActionList.Icon>
            <ActionList.Text>
              <RowLabel>
                <span>Update status</span>
                {statusRowProgress ? (
                  <RowProgress data-testid="status-row-progress">
                    {statusRowProgress}
                  </RowProgress>
                ) : null}
              </RowLabel>
            </ActionList.Text>
          </ActionList.Action>
          <ActionList.Button
            ariaLabel={
              statusRowProgress
                ? `Updating review tags (${statusRowProgress})`
                : (statusChipLabel ?? "Update review tags from results")
            }
            tooltip={
              statusChipLabel ??
              "Stamp Ready / Failed from visual pass/fail (via Run tests)"
            }
            disabled={!updateStatusEnabled && !isUpdatingStatus}
            onClick={onOpenStatusResults}
          >
            {statusChipValue != null ? (
              <ChipProgress>{statusChipValue}</ChipProgress>
            ) : null}
            <TestStatusIcon
              status={statusChipStatus}
              isRunning={isUpdatingStatus}
            />
          </ActionList.Button>
        </ActionList.Item>
        <ActionList.Item>
          <ActionList.Action as="label" ariaLabel={false}>
            <ActionList.Icon>
              <Form.Checkbox
                name="Rebuild static"
                checked={rebuildStaticEnabled}
                disabled={runnerBusy}
                onChange={(event) => {
                  onRebuildStaticChange(event.currentTarget.checked);
                }}
              />
            </ActionList.Icon>
            <ActionList.Text>
              <RowLabel>
                <span>Rebuild static</span>
                <RowProgress>build-storybook before capture</RowProgress>
              </RowLabel>
            </ActionList.Text>
          </ActionList.Action>
        </ActionList.Item>
      </StyledActionList>
    </Root>
  );
}
