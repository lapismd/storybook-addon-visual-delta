import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PlayHollowIcon, StopAltIcon } from "@storybook/icons";
import { ActionList, Button, Form } from "storybook/internal/components";
import type { API_HashEntry } from "storybook/internal/types";
import {
  experimental_getStatusStore,
  experimental_getTestProviderStore,
  experimental_useStatusStore,
  experimental_useTestProviderStore,
  useStorybookApi,
  useStorybookState,
} from "storybook/manager-api";
import { styled } from "storybook/theming";
import {
  PANEL_ID,
  STATUS_TYPE_ID_VISUAL,
  TEST_PROVIDER_ID,
} from "../constants.js";
import {
  VisualBaselineSplitButton,
  baselineWriteRowLabel,
  loadBaselineWriteMode,
  saveBaselineWriteMode,
  type BaselineWriteMode,
} from "./VisualBaselineSplitButton.js";
import {
  applyPendingVisualStatuses,
  applyVisualRunResults,
  applyVisualStatuses,
  cancelVisualRun,
  clearVisualStatuses,
  formatVisualProgressLabel,
  postVisualCreateBaseline,
  postVisualCreateBaselinesForStoryIds,
  postVisualReviewStatusesFromResults,
  postVisualRun,
  postVisualUpdateBaseline,
  postVisualUpdateBaselinesForStoryIds,
  publishVisualLastRun,
  subscribeVisualCreateProgress,
  subscribeVisualLastRun,
  subscribeVisualRunProgress,
  visualRunnableStoryIds,
  type VisualCreateProgress,
  type VisualLastRunSummary,
  type VisualRunProgress,
  type VisualRunResultItem,
  type VisualRunScope,
} from "./run-visual.js";

type ChipStatus = "positive" | "negative" | "critical" | "warning" | "unknown";

const RUN_VISUAL_KEY = "storybook-addon-visual-delta/run-visual-enabled-v1";
const CREATE_BASELINES_KEY =
  "storybook-addon-visual-delta/create-baselines-enabled-v1";
const UPDATE_STATUS_KEY =
  "storybook-addon-visual-delta/update-status-enabled-v1";

const statusStore = experimental_getStatusStore(STATUS_TYPE_ID_VISUAL);
const testProviderStore = experimental_getTestProviderStore(TEST_PROVIDER_ID);

const Container = styled.div({
  display: "flex",
  flexDirection: "column",
  paddingBottom: 1,
});

/**
 * Testing Module section (global). No top border — Vitest/a11y already provide
 * separators; only the sidebar context menu keeps a divider.
 */
const ModuleContainer = styled(Container)({
  paddingTop: 4,
});

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

/**
 * Same relative copy as Storybook’s Vitest Testing Module
 * (`just now` / `a minute ago` / …), ticking every 10s.
 */
function RelativeTime({ timestamp }: { timestamp: number }) {
  const [timeAgo, setTimeAgo] = useState<number | null>(null);
  useEffect(() => {
    setTimeAgo(Date.now() - timestamp);
    const interval = window.setInterval(() => {
      setTimeAgo(Date.now() - timestamp);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [timestamp]);
  if (timeAgo === null) return null;
  const seconds = Math.round(timeAgo / 1_000);
  if (seconds < 60) return <>just now</>;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return <>{minutes === 1 ? "a minute ago" : `${minutes} minutes ago`}</>;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return <>{hours === 1 ? "an hour ago" : `${hours} hours ago`}</>;
  }
  const days = Math.floor(hours / 24);
  return <>{days === 1 ? "yesterday" : `${days} days ago`}</>;
}

function readBoolFlag(key: string, defaultValue: boolean): boolean {
  if (typeof localStorage === "undefined") return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return raw === "1";
  } catch {
    return defaultValue;
  }
}

function writeBoolFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** One shared status line for Testing Module actions. */
function moduleDescription(
  isRunning: boolean,
  isWritingBaselines: boolean,
  isUpdatingStatus: boolean,
  progress: VisualRunProgress | null,
  createProgress: VisualCreateProgress | null,
  lastRun: VisualLastRunSummary | null,
  anyActionSelected: boolean,
): React.ReactNode {
  if (!anyActionSelected) return "Select at least one action";
  if (isUpdatingStatus) return "Updating review status…";
  if (isRunning) return formatVisualProgressLabel(progress);
  if (isWritingBaselines) {
    return createProgress?.label ?? "Writing baselines…";
  }

  const parts: React.ReactNode[] = [];
  if (lastRun) {
    const total = Math.max(
      lastRun.summary.total,
      lastRun.summary.passed +
        lastRun.summary.failed +
        lastRun.summary.skipped,
    );
    parts.push(
      <React.Fragment key="tests">
        Ran {total} {total === 1 ? "test" : "tests"}{" "}
        <RelativeTime timestamp={lastRun.finishedAt} />
      </React.Fragment>,
    );
  }
  if (createProgress?.error) {
    parts.push(
      createProgress.kind === "update"
        ? "Baselines: update failed"
        : "Baselines: create failed",
    );
  } else if (createProgress?.label && !createProgress.running) {
    parts.push(`Baselines: ${createProgress.label}`);
  }
  if (!parts.length) return "Not run";
  if (parts.length === 1) return parts[0];
  return (
    <>
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 ? " · " : null}
          {part}
        </React.Fragment>
      ))}
    </>
  );
}

const Actions = styled.div({
  display: "flex",
  gap: 4,
  alignItems: "center",
  flexShrink: 0,
});

const Trailing = styled.div({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  flexShrink: 0,
  marginLeft: "auto",
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
  ...(status === "warning" ? { "--status-color": theme.color.gold } : null),
  ...(status === "negative"
    ? { "--status-color": theme.color.negative }
    : null),
  ...(status === "critical"
    ? { "--status-color": theme.color.defaultText }
    : null),
  ...(status === "unknown" ? { "--status-color": theme.textMutedColor } : null),
}));

function openVisualPanel(
  api: ReturnType<typeof useStorybookApi>,
  storyId?: string,
) {
  if (storyId) api.selectStory(storyId);
  api.setSelectedPanel(PANEL_ID);
  api.togglePanel(true);
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

function baselineChipStatus(
  isWriting: boolean,
  createProgress: VisualCreateProgress | null,
): ChipStatus {
  if (isWriting) return "warning";
  if (createProgress?.error) return "negative";
  if (
    createProgress?.label &&
    /^(Created|Updated)/i.test(createProgress.label)
  ) {
    return "positive";
  }
  return "unknown";
}

/** Leaf story ids currently listed in the sidebar (respects search/filters). */
function sidebarLeafStoryIds(state: {
  filteredIndex?: Record<string, { type?: string; id?: string }>;
  index?: Record<string, { type?: string; id?: string }>;
}): string[] {
  const hash = state.filteredIndex ?? state.index;
  if (!hash) return [];
  const ids: string[] = [];
  for (const entry of Object.values(hash)) {
    if (entry?.type === "story" && entry.id) ids.push(entry.id);
  }
  return ids;
}

function resultsFromStatusStore(
  allStatuses: ReturnType<typeof experimental_useStatusStore>,
): VisualRunResultItem[] {
  const results: VisualRunResultItem[] = [];
  for (const [storyId, byType] of Object.entries(allStatuses)) {
    const status = byType?.[STATUS_TYPE_ID_VISUAL];
    if (!status) continue;
    if (status.value === "status-value:success") {
      results.push({ storyId, status: "passed", title: storyId });
    } else if (status.value === "status-value:error") {
      results.push({ storyId, status: "failed", title: storyId });
    }
  }
  return results;
}

export function VisualTestProviderRender({ entry }: { entry?: API_HashEntry }) {
  const api = useStorybookApi();
  const storybookState = useStorybookState() as {
    filteredIndex?: Record<string, { type?: string; id?: string }>;
    index?: Record<string, { type?: string; id?: string }>;
  };
  const testProviderState = experimental_useTestProviderStore(
    (state) => state[TEST_PROVIDER_ID] ?? "test-provider-state:pending",
  );
  const allStatuses = experimental_useStatusStore();
  const [lastRun, setLastRun] = useState<VisualLastRunSummary | null>(null);
  const [progress, setProgress] = useState<VisualRunProgress | null>(null);
  const [createProgress, setCreateProgress] =
    useState<VisualCreateProgress | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusUpdateLabel, setStatusUpdateLabel] = useState<string | null>(
    null,
  );
  const [runVisualEnabled, setRunVisualEnabled] = useState(() =>
    readBoolFlag(RUN_VISUAL_KEY, true),
  );
  const [createBaselinesEnabled, setCreateBaselinesEnabled] = useState(() =>
    readBoolFlag(CREATE_BASELINES_KEY, false),
  );
  const [updateStatusEnabled, setUpdateStatusEnabled] = useState(() =>
    readBoolFlag(UPDATE_STATUS_KEY, false),
  );
  const [baselineMode, setBaselineMode] = useState<BaselineWriteMode>(() =>
    loadBaselineWriteMode(),
  );
  const isWritingBaselines = Boolean(createProgress?.running);
  const sidebarStoryIds = useMemo(
    () => sidebarLeafStoryIds(storybookState),
    [storybookState.filteredIndex, storybookState.index],
  );

  const anyActionSelected =
    runVisualEnabled || createBaselinesEnabled || updateStatusEnabled;

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

  const runCompare = useCallback(
    async (scope: VisualRunScope, ids?: string[]) => {
      const scoped = Array.isArray(ids);
      const runnable = scoped ? visualRunnableStoryIds(api, ids) : undefined;
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
          logTail: data.logTail,
          results: data.results,
        };
        publishVisualLastRun(summary);
        throw new Error(data.error ?? "Visual test run crashed");
      }
      applyVisualRunResults(runnable, data.results);
      const summary: VisualLastRunSummary = {
        finishedAt: Date.now(),
        summary: data.summary,
        error:
          data.summary.failed > 0
            ? `${data.summary.failed} failed`
            : undefined,
        scope,
        logTail: data.logTail,
        results: data.results,
      };
      publishVisualLastRun(summary);
      return data.results;
    },
    [api],
  );

  const runCompareRef = useRef(runCompare);
  runCompareRef.current = runCompare;

  const runSelectedActions = useCallback(async () => {
    const runVisual = readBoolFlag(RUN_VISUAL_KEY, true);
    const writeBaselines = readBoolFlag(CREATE_BASELINES_KEY, false);
    const updateStatus = readBoolFlag(UPDATE_STATUS_KEY, false);
    if (!runVisual && !writeBaselines && !updateStatus) {
      return;
    }

    await testProviderStore.runWithState(async () => {
      if (writeBaselines) {
        if (!sidebarStoryIds.length) {
          throw new Error("No stories in the sidebar to write baselines for");
        }
        const mode = loadBaselineWriteMode();
        if (mode === "rewrite") {
          await postVisualUpdateBaselinesForStoryIds(api, sidebarStoryIds);
        } else {
          await postVisualCreateBaselinesForStoryIds(api, sidebarStoryIds);
        }
      }

      let results: VisualRunResultItem[] | undefined;
      if (runVisual) {
        results = await runCompareRef.current("all", undefined);
      }

      if (updateStatus) {
        setIsUpdatingStatus(true);
        try {
          const source =
            results ??
            latestResultsRef.current ??
            resultsFromStatusStore(allStatusesRef.current);
          if (!source.length) {
            throw new Error(
              "No visual results to update status from — run visual tests first",
            );
          }
          const { updated, errors } =
            await postVisualReviewStatusesFromResults(source);
          setStatusUpdateLabel(
            errors.length
              ? `Updated ${updated} · ${errors.length} failed`
              : `Updated ${updated} review tags`,
          );
          if (errors.length && updated === 0) {
            throw new Error(errors[0] ?? "Update status failed");
          }
        } finally {
          setIsUpdatingStatus(false);
        }
      }
    });
  }, [api, sidebarStoryIds]);

  const runSelectedRef = useRef(runSelectedActions);
  runSelectedRef.current = runSelectedActions;

  const latestResultsRef = useRef<VisualRunResultItem[] | undefined>(undefined);
  const allStatusesRef = useRef(allStatuses);
  allStatusesRef.current = allStatuses;

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
    return subscribeVisualLastRun((next) => {
      setLastRun(next);
      latestResultsRef.current = next?.results;
    });
  }, []);

  useEffect(() => {
    // Include create + update so Testing Module status covers rewrite too.
    return subscribeVisualCreateProgress(setCreateProgress);
  }, []);

  const createBaseline = useCallback(async () => {
    if (!entryStoryIds?.length) return;
    const runnable = visualRunnableStoryIds(api, entryStoryIds);
    const storyId = runnable[0] ?? entryStoryIds[0];
    if (!storyId) return;
    try {
      await postVisualCreateBaseline({ storyId });
    } catch {
      // Progress/error surfaces via subscribeVisualCreateProgress.
    }
  }, [api, entryStoryIds]);

  const rewriteBaseline = useCallback(async () => {
    if (!entryStoryIds?.length) return;
    const runnable = visualRunnableStoryIds(api, entryStoryIds);
    const storyId = runnable[0] ?? entryStoryIds[0];
    if (!storyId) return;
    try {
      await postVisualUpdateBaseline({ storyId });
    } catch {
      // Progress/error surfaces via subscribeVisualCreateProgress.
    }
  }, [api, entryStoryIds]);

  useEffect(() => {
    if (entry) return;
    const offRunAll = testProviderStore.onRunAll(() => {
      void runSelectedRef.current();
    });
    const offClear = testProviderStore.onClearAll(() => {
      clearVisualStatuses();
      publishVisualLastRun(null);
      setProgress(null);
      setStatusUpdateLabel(null);
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
  const moduleStatusLine = moduleDescription(
    isRunning,
    isWritingBaselines,
    isUpdatingStatus,
    progress,
    createProgress,
    lastRun,
    anyActionSelected,
  );
  // Context menu always has an explicit Play — never show "select an action".
  const contextStatusLine = moduleDescription(
    isRunning,
    isWritingBaselines,
    isUpdatingStatus,
    progress,
    createProgress,
    lastRun,
    true,
  );

  // Sidebar context menu: run + create/rewrite for that story/component
  if (entry) {
    const canPlay = Boolean(entryStoryIds?.length);
    const baselineDescription = isWritingBaselines
      ? (createProgress?.label ?? "Writing…")
      : createProgress?.error
        ? "Write failed"
        : createProgress?.label === "Created" ||
            createProgress?.label === "Updated"
          ? createProgress.label
          : createProgress?.label
            ? createProgress.label
            : "Ready";
    return (
      <ContextMenuContainer>
        <Heading>
          <Info>
            <Title>Run visual tests</Title>
            <Description>{contextStatusLine}</Description>
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
                disabled={!canPlay || isWritingBaselines}
                onClick={() => {
                  if (!entryStoryIds?.length) return;
                  void testProviderStore.runWithState(async () => {
                    await runCompare(
                      entry.type === "story" ? "story" : "component",
                      entryStoryIds,
                    );
                  });
                }}
              >
                <PlayHollowIcon />
              </Button>
            )}
          </Actions>
        </Heading>
        <Heading>
          <Info>
            <Title>Create / rewrite baselines</Title>
            <Description>{baselineDescription}</Description>
          </Info>
          <Actions>
            <VisualBaselineSplitButton
              status={baselineChipStatus(isWritingBaselines, createProgress)}
              isRunning={isWritingBaselines}
              ariaLabel={baselineDescription}
              tooltip={baselineDescription}
              disabled={!canPlay || isRunning}
              writeOnMainClick
              onCreateMissing={() => void createBaseline()}
              onRewriteExisting={() => void rewriteBaseline()}
              onStop={() => void cancelVisualRun()}
            />
          </Actions>
        </Heading>
      </ContextMenuContainer>
    );
  }

  const baselineStatus = baselineChipStatus(isWritingBaselines, createProgress);
  const baselineRowLabel = baselineWriteRowLabel(baselineMode);
  const baselineChipTooltip = isWritingBaselines
    ? (createProgress?.label ?? "Writing…")
    : createProgress?.error
      ? createProgress.error
      : createProgress?.label
        ? createProgress.label
        : sidebarStoryIds.length
          ? `${baselineRowLabel} for stories in the sidebar (via Run tests)`
          : "No stories in the sidebar";

  const statusChipStatus: ChipStatus = isUpdatingStatus
    ? "warning"
    : statusUpdateLabel?.includes("failed")
      ? "negative"
      : statusUpdateLabel
        ? "positive"
        : "unknown";

  // Global Testing Module: checklist rows + shared status line
  return (
    <ModuleContainer>
      <Description
        id="visual-testing-module-description"
        style={{ margin: "4px 0 4px 8px" }}
      >
        {moduleStatusLine}
      </Description>
      <StyledActionList>
        <ActionList.Item>
          <ActionList.Action as="label" ariaLabel={false}>
            <ActionList.Icon>
              <Form.Checkbox
                name="Run visual tests"
                checked={runVisualEnabled}
                disabled={isRunning || isWritingBaselines || isUpdatingStatus}
                onChange={(event) => {
                  const next = event.currentTarget.checked;
                  setRunVisualEnabled(next);
                  writeBoolFlag(RUN_VISUAL_KEY, next);
                }}
              />
            </ActionList.Icon>
            <ActionList.Text>Run visual tests</ActionList.Text>
          </ActionList.Action>
          <Trailing>
            <ActionList.Button
              ariaLabel={
                chipCount != null ? `${label} (${chipCount} failed)` : label
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
            <VisualBaselineSplitButton
              status={baselineStatus}
              isRunning={isWritingBaselines}
              ariaLabel={baselineChipTooltip}
              tooltip={baselineChipTooltip}
              mode={baselineMode}
              onModeChange={(next) => {
                setBaselineMode(next);
                saveBaselineWriteMode(next);
              }}
              writeOnMainClick={false}
              disabled={isRunning || isUpdatingStatus}
              onStop={() => void cancelVisualRun()}
            />
          </Trailing>
        </ActionList.Item>
        <ActionList.Item>
          <ActionList.Action as="label" ariaLabel={false}>
            <ActionList.Icon>
              <Form.Checkbox
                name={baselineRowLabel}
                checked={createBaselinesEnabled}
                disabled={isWritingBaselines || isRunning || isUpdatingStatus}
                onChange={(event) => {
                  const next = event.currentTarget.checked;
                  setCreateBaselinesEnabled(next);
                  writeBoolFlag(CREATE_BASELINES_KEY, next);
                }}
              />
            </ActionList.Icon>
            <ActionList.Text>{baselineRowLabel}</ActionList.Text>
          </ActionList.Action>
          <ActionList.Button
            ariaLabel={baselineChipTooltip}
            tooltip={baselineChipTooltip}
            disabled={!createBaselinesEnabled && !isWritingBaselines}
            onClick={() => {
              openVisualPanel(
                api,
                statusIds.failedIds[0] ?? statusIds.passedIds[0],
              );
            }}
          >
            <TestStatusIcon
              status={baselineStatus}
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
                disabled={isRunning || isWritingBaselines || isUpdatingStatus}
                onChange={(event) => {
                  const next = event.currentTarget.checked;
                  setUpdateStatusEnabled(next);
                  writeBoolFlag(UPDATE_STATUS_KEY, next);
                }}
              />
            </ActionList.Icon>
            <ActionList.Text>Update status</ActionList.Text>
          </ActionList.Action>
          <ActionList.Button
            ariaLabel={statusUpdateLabel ?? "Update review tags from results"}
            tooltip={
              statusUpdateLabel ??
              "Stamp Ready / Failed from visual pass/fail (via Run tests)"
            }
            disabled={!updateStatusEnabled && !isUpdatingStatus}
            onClick={() => {
              openVisualPanel(
                api,
                statusIds.failedIds[0] ?? statusIds.passedIds[0],
              );
            }}
          >
            <TestStatusIcon
              status={statusChipStatus}
              isRunning={isUpdatingStatus}
            />
          </ActionList.Button>
        </ActionList.Item>
      </StyledActionList>
    </ModuleContainer>
  );
}
