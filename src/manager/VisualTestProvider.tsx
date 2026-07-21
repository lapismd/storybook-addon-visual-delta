import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlayHollowIcon, StopAltIcon, SyncIcon } from "@storybook/icons";
import { ActionList, Button, Form } from "storybook/internal/components";
import type { API_HashEntry } from "storybook/internal/types";
import {
  experimental_getStatusStore,
  experimental_getTestProviderStore,
  experimental_useStatusStore,
  experimental_useTestProviderStore,
  useStorybookApi,
} from "storybook/manager-api";
import { styled } from "storybook/theming";
import {
  PANEL_ID,
  STATUS_TYPE_ID_VISUAL,
  TEST_PROVIDER_ID,
} from "../constants.js";
import {
  applyPendingVisualStatuses,
  applyVisualRunResults,
  applyVisualStatuses,
  cancelVisualRun,
  clearVisualStatuses,
  formatVisualProgressLabel,
  postVisualCreateBaseline,
  postVisualRun,
  publishVisualLastRun,
  subscribeVisualCreateProgress,
  subscribeVisualLastRun,
  subscribeVisualRunProgress,
  visualRunnableStoryIds,
  type VisualCreateProgress,
  type VisualLastRunSummary,
  type VisualRunProgress,
  type VisualRunScope,
} from "./run-visual.js";

type ChipStatus = "positive" | "negative" | "critical" | "warning" | "unknown";

const statusStore = experimental_getStatusStore(STATUS_TYPE_ID_VISUAL);
const testProviderStore = experimental_getTestProviderStore(TEST_PROVIDER_ID);

const Container = styled.div({
  display: "flex",
  flexDirection: "column",
  paddingBottom: 1,
});

/** Testing Module section: separate Visual Tests from Vitest / a11y above. */
const ModuleContainer = styled(Container)(({ theme }) => ({
  borderTop: `1px solid ${theme.appBorderColor}`,
  paddingTop: 8,
  marginTop: 4,
}));

/** Sidebar story/component context menu: divider above visual actions. */
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
  status: ChipStatus;
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
  ...(status === "warning"
    ? { "--status-color": theme.color.gold }
    : null),
  ...(status === "negative"
    ? { "--status-color": theme.color.negative }
    : null),
  ...(status === "critical"
    ? { "--status-color": theme.color.defaultText }
    : null),
  ...(status === "unknown"
    ? { "--status-color": theme.textMutedColor }
    : null),
}));

function openVisualPanel(
  api: ReturnType<typeof useStorybookApi>,
  storyId?: string,
) {
  if (storyId) api.selectStory(storyId);
  api.setSelectedPanel(PANEL_ID);
  api.togglePanel(true);
}

function progressDescription(
  isRunning: boolean,
  progress: VisualRunProgress | null,
  lastRun: VisualLastRunSummary | null,
): string {
  if (isRunning) return formatVisualProgressLabel(progress);
  if (lastRun) {
    const total = lastRun.summary.total;
    return `Ran ${total} ${total === 1 ? "test" : "tests"}`;
  }
  return "Not run";
}

function chipLabel(
  status: ChipStatus,
  isRunning: boolean,
  progress: VisualRunProgress | null,
  lastRun: VisualLastRunSummary | null,
  counts: { passed: number; failed: number },
): string {
  if (isRunning) {
    if (!progress || progress.total <= 0) return "Visual tests starting";
    return formatVisualProgressLabel(progress);
  }
  if (status === "critical") {
    return lastRun?.error ?? "Visual tests crashed";
  }
  if (status === "negative") {
    return `${counts.failed} failed · ${counts.passed} passed`;
  }
  if (status === "positive") {
    return `${counts.passed} passed`;
  }
  if (lastRun) {
    const { summary } = lastRun;
    return `${summary.passed} passed · ${summary.failed} failed`;
  }
  return "Run tests to see results";
}

export function VisualTestProviderRender({
  entry,
}: {
  entry?: API_HashEntry;
}) {
  const api = useStorybookApi();
  const testProviderState = experimental_useTestProviderStore(
    (state) => state[TEST_PROVIDER_ID] ?? "test-provider-state:pending",
  );
  const allStatuses = experimental_useStatusStore();
  const [lastRun, setLastRun] = useState<VisualLastRunSummary | null>(null);
  const [progress, setProgress] = useState<VisualRunProgress | null>(null);
  const [createProgress, setCreateProgress] =
    useState<VisualCreateProgress | null>(null);
  const isCreating = Boolean(createProgress?.running);

  const entryStoryIds = useMemo(() => {
    if (!entry) return undefined;
    if (entry.type === "story") return [entry.id];
    if ("id" in entry) return api.findAllLeafStoryIds(entry.id);
    return undefined;
  }, [api, entry]);

  const statusIds = useMemo(() => {
    let passedIds: string[] = [];
    let failedIds: string[] = [];
    const ids = entryStoryIds ?? Object.keys(allStatuses);
    for (const id of ids) {
      const status = allStatuses[id]?.[STATUS_TYPE_ID_VISUAL];
      if (!status) continue;
      if (status.value === "status-value:error") failedIds.push(id);
      else if (status.value === "status-value:success") passedIds.push(id);
    }
    return { passedIds, failedIds };
  }, [allStatuses, entryStoryIds]);

  const counts = {
    passed: statusIds.passedIds.length,
    failed: statusIds.failedIds.length,
  };

  const isRunning = testProviderState === "test-provider-state:running";
  const crashed = testProviderState === "test-provider-state:crashed";

  const run = useCallback(
    async (scope: VisualRunScope, ids?: string[]) => {
      await testProviderStore.runWithState(async () => {
        const scoped = Array.isArray(ids);
        const runnable = scoped
          ? visualRunnableStoryIds(api, ids)
          : undefined;
        if (scoped && !runnable?.length) {
          throw new Error(
            "No runnable visual stories in this scope (all skip-visual)",
          );
        }
        if (runnable?.length) {
          applyPendingVisualStatuses(runnable);
        } else if (!scoped) {
          clearVisualStatuses();
        }
        const data = await postVisualRun({
          storyIds: runnable,
          rebuild: false,
        });
        if (data.crashed) {
          const summary: VisualLastRunSummary = {
            finishedAt: Date.now(),
            summary: data.summary,
            error: data.error ?? "Visual test run crashed",
            scope,
          };
          publishVisualLastRun(summary);
          throw new Error(data.error ?? "Visual test run crashed");
        }
        applyVisualRunResults(runnable, data.results);
        publishVisualLastRun({
          finishedAt: Date.now(),
          summary: data.summary,
          error:
            data.summary.failed > 0
              ? `${data.summary.failed} failed`
              : undefined,
          scope,
        });
      });
    },
    [api],
  );

  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    return subscribeVisualRunProgress((next) => {
      setProgress(next);
      if (next?.storyId && next.status) {
        applyVisualStatuses([
          {
            storyId: next.storyId,
            status: next.status,
            title: next.storyId,
          },
        ]);
      }
    });
  }, []);

  useEffect(() => {
    return subscribeVisualLastRun(setLastRun);
  }, []);

  useEffect(() => {
    return subscribeVisualCreateProgress(setCreateProgress);
  }, []);

  const createBaseline = useCallback(async () => {
    const storyId = entryStoryIds?.[0];
    if (!storyId) return;
    try {
      await postVisualCreateBaseline({ storyId });
    } catch {
      // Progress/error surfaces via subscribeVisualCreateProgress.
    }
  }, [entryStoryIds]);

  useEffect(() => {
    if (entry) return;
    const offRunAll = testProviderStore.onRunAll(() => {
      void runRef.current("all", undefined);
    });
    const offClear = testProviderStore.onClearAll(() => {
      clearVisualStatuses();
      publishVisualLastRun(null);
      setProgress(null);
    });
    const offSelect = statusStore.onSelect((selected) => {
      const storyId = selected[0]?.storyId;
      openVisualPanel(api, storyId);
    });
    return () => {
      offRunAll();
      offClear();
      offSelect();
    };
  }, [api, entry]);

  const chipStatus: ChipStatus = isRunning
    ? "warning"
    : crashed
      ? "critical"
      : counts.failed > 0 || (lastRun?.summary.failed ?? 0) > 0
        ? "negative"
        : counts.passed > 0 || (lastRun?.summary.passed ?? 0) > 0
          ? "positive"
          : "unknown";

  const label = chipLabel(chipStatus, isRunning, progress, lastRun, counts);
  const failedCount = isRunning
    ? (progress?.failed ?? 0)
    : counts.failed > 0
      ? counts.failed
      : (lastRun?.summary.failed ?? 0);
  const chipCount = failedCount > 0 ? failedCount : null;
  const hasResults = counts.passed > 0 || counts.failed > 0 || Boolean(lastRun);
  const description = progressDescription(isRunning, progress, lastRun);

  // Sidebar context menu: run + create for that story/component
  if (entry) {
    const canPlay = Boolean(entryStoryIds?.length);
    const createDescription = isCreating
      ? (createProgress?.label ?? "Creating…")
      : createProgress?.error
        ? "Create failed"
        : createProgress?.label === "Created"
          ? "Created"
          : "Not run";
    return (
      <ContextMenuContainer>
        <Heading>
          <Info>
            <Title>Run visual tests</Title>
            <Description>{description}</Description>
          </Info>
          <Actions>
            {isRunning ? (
              <Button
                size="medium"
                variant="ghost"
                padding="small"
                ariaLabel="Stop visual test run"
                title="Stop visual test run"
                onClick={() => void cancelVisualRun()}
              >
                <StopAltIcon />
              </Button>
            ) : (
              <Button
                size="medium"
                variant="ghost"
                padding="small"
                ariaLabel="Run visual tests for this item"
                title="Run visual tests for this item"
                disabled={!canPlay || isCreating}
                onClick={() => {
                  if (!entryStoryIds?.length) return;
                  void run(
                    entry.type === "story" ? "story" : "component",
                    entryStoryIds,
                  );
                }}
              >
                <PlayHollowIcon />
              </Button>
            )}
          </Actions>
        </Heading>
        <Heading>
          <Info>
            <Title>Create baseline</Title>
            <Description>{createDescription}</Description>
          </Info>
          <Actions>
            {isCreating ? (
              <Button
                size="medium"
                variant="ghost"
                padding="small"
                ariaLabel="Stop baseline create"
                title="Stop baseline create"
                onClick={() => void cancelVisualRun()}
              >
                <StopAltIcon />
              </Button>
            ) : (
              <Button
                size="medium"
                variant="ghost"
                padding="small"
                ariaLabel="Create baseline for this item"
                title="Create baseline for this item"
                disabled={!canPlay || isRunning}
                onClick={() => void createBaseline()}
              >
                <SyncIcon />
              </Button>
            )}
          </Actions>
        </Heading>
      </ContextMenuContainer>
    );
  }

  // Global Testing Module: checklist row + Vitest-style `Testing... 1/N`
  return (
    <ModuleContainer>
      <Description
        id="visual-testing-module-description"
        style={{ margin: "4px 0 4px 8px" }}
      >
        {description}
      </Description>
      <StyledActionList>
        <ActionList.Item>
          <ActionList.Action as="label" readOnly ariaLabel={false}>
            <ActionList.Icon>
              <Form.Checkbox
                name="Visual Tests"
                checked
                disabled
              />
            </ActionList.Icon>
            <ActionList.Text>Visual Tests</ActionList.Text>
          </ActionList.Action>
          <ActionList.Button
            ariaLabel={
              chipCount != null
                ? `${label} (${chipCount} failed)`
                : label
            }
            tooltip={label}
            disabled={!hasResults && !crashed && !isRunning}
            onClick={() => {
              openVisualPanel(
                api,
                statusIds.failedIds[0] ?? statusIds.passedIds[0],
              );
            }}
          >
            {chipCount}
            <TestStatusIcon status={chipStatus} isRunning={isRunning} />
          </ActionList.Button>
        </ActionList.Item>
      </StyledActionList>
    </ModuleContainer>
  );
}
