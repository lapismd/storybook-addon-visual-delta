import React from "react";
import { ActionList, Form } from "storybook/internal/components";
import { styled } from "storybook/theming";
import {
  VisualBaselineSplitButton,
  baselineWriteRowLabel,
  type BaselineWriteMode,
} from "./VisualBaselineSplitButton.js";

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

const ContextMenuContainer = styled(Container)(({ theme }) => ({
  borderTop: `1px solid ${theme.appBorderColor}`,
  paddingTop: 4,
  marginTop: 4,
}));

const Heading = styled.div({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 0",
  gap: 12,
});

const Info = styled.div({
  display: "flex",
  flexDirection: "column",
  marginLeft: 8,
  minWidth: 0,
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
  isWritingBaselines: boolean;
  isUpdatingStatus: boolean;
  isCompareRunning: boolean;
  onRunVisualChange: (enabled: boolean) => void;
  onCreateBaselinesChange: (enabled: boolean) => void;
  onUpdateStatusChange: (enabled: boolean) => void;
  onBaselineModeChange: (mode: BaselineWriteMode) => void;
  onRun: () => void;
  onStop: () => void;
  onOpenCompareResults: () => void;
  onOpenBaselineStatus: () => void;
  onOpenStatusResults: () => void;
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
  isWritingBaselines,
  isUpdatingStatus,
  isCompareRunning,
  onRunVisualChange,
  onCreateBaselinesChange,
  onUpdateStatusChange,
  onBaselineModeChange,
  onRun,
  onStop,
  onOpenCompareResults,
  onOpenBaselineStatus,
  onOpenStatusResults,
}: VisualTestModuleUIProps) {
  const Root = variant === "context" ? ContextMenuContainer : ModuleContainer;
  const baselineRowLabel = baselineWriteRowLabel(baselineMode);
  const runnerChipStatus: VisualModuleChipStatus = isUpdatingStatus
    ? "warning"
    : isWritingBaselines
      ? baselineChipStatus
      : compareChipStatus;

  return (
    <Root data-testid={`visual-test-module-${variant}`}>
      <Heading>
        <Info>
          <Title>Run visual tests</Title>
          <Description id={`visual-testing-module-description-${variant}`}>
            {statusLine}
          </Description>
        </Info>
        <Actions>
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
            <ActionList.Text>Run visual tests</ActionList.Text>
          </ActionList.Action>
          <ActionList.Button
            ariaLabel={
              compareChipCount != null
                ? `${compareChipLabel} (${compareChipCount} failed)`
                : compareChipLabel
            }
            tooltip={compareChipLabel}
            disabled={compareChipDisabled}
            onClick={onOpenCompareResults}
          >
            {compareChipCount}
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
            <ActionList.Text>{baselineRowLabel}</ActionList.Text>
          </ActionList.Action>
          <ActionList.Button
            ariaLabel={baselineChipTooltip}
            tooltip={baselineChipTooltip}
            disabled={!createBaselinesEnabled && !isWritingBaselines}
            onClick={onOpenBaselineStatus}
          >
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
            <ActionList.Text>Update status</ActionList.Text>
          </ActionList.Action>
          <ActionList.Button
            ariaLabel={statusChipLabel ?? "Update review tags from results"}
            tooltip={
              statusChipLabel ??
              "Stamp Ready / Failed from visual pass/fail (via Run tests)"
            }
            disabled={!updateStatusEnabled && !isUpdatingStatus}
            onClick={onOpenStatusResults}
          >
            <TestStatusIcon
              status={statusChipStatus}
              isRunning={isUpdatingStatus}
            />
          </ActionList.Button>
        </ActionList.Item>
      </StyledActionList>
    </Root>
  );
}
