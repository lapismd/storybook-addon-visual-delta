import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { API_HashEntry } from "storybook/internal/types";
import {
  experimental_getStatusStore,
  experimental_getTestProviderStore,
  experimental_useStatusStore,
  experimental_useTestProviderStore,
  useStorybookApi,
  useStorybookState,
} from "storybook/manager-api";
import {
  PANEL_ID,
  STATUS_TYPE_ID_VISUAL,
  TEST_PROVIDER_ID,
} from "../constants.js";
import {
  baselineWriteRowLabel,
  loadBaselineWriteMode,
  saveBaselineWriteMode,
  type BaselineWriteMode,
} from "./VisualBaselineSplitButton.js";
import { VisualTestModuleUI } from "./VisualTestModuleUI.js";
import {
  applyPendingVisualStatuses,
  applyVisualRunResults,
  applyVisualStatuses,
  cancelVisualRun,
  clearVisualStatuses,
  formatVisualProgressLabel,
  postVisualCreateBaselinesForStoryIds,
  postVisualReviewStatusesFromResults,
  postVisualRun,
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
import {
  CREATE_BASELINES_KEY,
  RUN_VISUAL_KEY,
  UPDATE_STATUS_KEY,
  anyModuleActionSelected,
  loadCreateBaselinesEnabled,
  loadModuleBaselineWriteMode,
  loadRunVisualEnabled,
  loadUpdateStatusEnabled,
  writeBoolFlag,
} from "./visual-test-module-prefs.js";

type ChipStatus = "positive" | "negative" | "critical" | "warning" | "unknown";

const statusStore = experimental_getStatusStore(STATUS_TYPE_ID_VISUAL);
const testProviderStore = experimental_getTestProviderStore(TEST_PROVIDER_ID);

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

/** One shared status line for Testing Module actions. */
export function moduleDescription(
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
  scopeIds?: string[],
): VisualRunResultItem[] {
  const allow = scopeIds?.length ? new Set(scopeIds) : null;
  const results: VisualRunResultItem[] = [];
  for (const [storyId, byType] of Object.entries(allStatuses)) {
    if (allow && !allow.has(storyId)) continue;
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
  const [runVisualEnabled, setRunVisualEnabled] = useState(loadRunVisualEnabled);
  const [createBaselinesEnabled, setCreateBaselinesEnabled] = useState(
    loadCreateBaselinesEnabled,
  );
  const [updateStatusEnabled, setUpdateStatusEnabled] = useState(
    loadUpdateStatusEnabled,
  );
  const [baselineMode, setBaselineMode] = useState<BaselineWriteMode>(() =>
    loadModuleBaselineWriteMode(),
  );
  const isWritingBaselines = Boolean(createProgress?.running);
  const sidebarStoryIds = useMemo(
    () => sidebarLeafStoryIds(storybookState),
    [storybookState.filteredIndex, storybookState.index],
  );

  const anyActionSelected = anyModuleActionSelected({
    runVisualEnabled,
    createBaselinesEnabled,
    updateStatusEnabled,
  });

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

  const latestResultsRef = useRef<VisualRunResultItem[] | undefined>(undefined);
  const allStatusesRef = useRef(allStatuses);
  allStatusesRef.current = allStatuses;
  const entryStoryIdsRef = useRef(entryStoryIds);
  entryStoryIdsRef.current = entryStoryIds;
  const sidebarStoryIdsRef = useRef(sidebarStoryIds);
  sidebarStoryIdsRef.current = sidebarStoryIds;

  const runSelectedActions = useCallback(
    async (scopedIds?: string[]) => {
      const runVisual = loadRunVisualEnabled();
      const writeBaselines = loadCreateBaselinesEnabled();
      const updateStatus = loadUpdateStatusEnabled();
      if (!runVisual && !writeBaselines && !updateStatus) {
        return;
      }

      const scope =
        scopedIds ??
        (entryStoryIdsRef.current?.length
          ? entryStoryIdsRef.current
          : undefined);
      const writeTargets = scope?.length
        ? scope
        : sidebarStoryIdsRef.current;
      const compareScope: VisualRunScope = scope?.length
        ? scope.length === 1
          ? "story"
          : "component"
        : "all";

      await testProviderStore.runWithState(async () => {
        if (writeBaselines) {
          if (!writeTargets.length) {
            throw new Error(
              scope?.length
                ? "No stories in this scope to write baselines for"
                : "No stories in the sidebar to write baselines for",
            );
          }
          const mode = loadBaselineWriteMode();
          if (mode === "rewrite") {
            await postVisualUpdateBaselinesForStoryIds(api, writeTargets);
          } else {
            await postVisualCreateBaselinesForStoryIds(api, writeTargets);
          }
        }

        let results: VisualRunResultItem[] | undefined;
        if (runVisual) {
          results = await runCompareRef.current(
            compareScope,
            scope?.length ? scope : undefined,
          );
        }

        if (updateStatus) {
          setIsUpdatingStatus(true);
          try {
            const source =
              results ??
              (latestResultsRef.current
                ? scope?.length
                  ? latestResultsRef.current.filter((item) =>
                      scope.includes(item.storyId),
                    )
                  : latestResultsRef.current
                : undefined) ??
              resultsFromStatusStore(allStatusesRef.current, scope);
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
    },
    [api],
  );

  const runSelectedRef = useRef(runSelectedActions);
  runSelectedRef.current = runSelectedActions;

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
    return subscribeVisualCreateProgress(setCreateProgress);
  }, []);

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
  const statusLine = moduleDescription(
    isRunning,
    isWritingBaselines,
    isUpdatingStatus,
    progress,
    createProgress,
    lastRun,
    anyActionSelected,
  );

  const baselineStatus = baselineChipStatus(isWritingBaselines, createProgress);
  const baselineRowLabel = baselineWriteRowLabel(baselineMode);
  const baselineChipTooltip = isWritingBaselines
    ? (createProgress?.label ?? "Writing…")
    : createProgress?.error
      ? createProgress.error
      : createProgress?.label
        ? createProgress.label
        : entry
          ? entryStoryIds?.length
            ? `${baselineRowLabel} for this ${entry.type === "story" ? "story" : "component"}`
            : "No stories in this scope"
          : sidebarStoryIds.length
            ? `${baselineRowLabel} for stories in the sidebar`
            : "No stories in the sidebar";

  const statusChipStatus: ChipStatus = isUpdatingStatus
    ? "warning"
    : statusUpdateLabel?.includes("failed")
      ? "negative"
      : statusUpdateLabel
        ? "positive"
        : "unknown";

  const runnerBusy = isRunning || isWritingBaselines || isUpdatingStatus;
  const openResults = () => {
    openVisualPanel(
      api,
      statusIds.failedIds[0] ?? statusIds.passedIds[0] ?? entryStoryIds?.[0],
    );
  };

  return (
    <VisualTestModuleUI
      variant={entry ? "context" : "global"}
      statusLine={statusLine}
      runVisualEnabled={runVisualEnabled}
      createBaselinesEnabled={createBaselinesEnabled}
      updateStatusEnabled={updateStatusEnabled}
      baselineMode={baselineMode}
      runnerBusy={runnerBusy}
      anyActionSelected={anyActionSelected}
      compareChipStatus={chipStatus}
      compareChipLabel={label}
      compareChipCount={chipCount}
      compareChipDisabled={!hasResults && !crashed && !isRunning}
      baselineChipStatus={baselineStatus}
      baselineChipTooltip={baselineChipTooltip}
      statusChipStatus={statusChipStatus}
      statusChipLabel={statusUpdateLabel}
      isWritingBaselines={isWritingBaselines}
      isUpdatingStatus={isUpdatingStatus}
      isCompareRunning={isRunning}
      onRunVisualChange={(next) => {
        setRunVisualEnabled(next);
        writeBoolFlag(RUN_VISUAL_KEY, next);
      }}
      onCreateBaselinesChange={(next) => {
        setCreateBaselinesEnabled(next);
        writeBoolFlag(CREATE_BASELINES_KEY, next);
      }}
      onUpdateStatusChange={(next) => {
        setUpdateStatusEnabled(next);
        writeBoolFlag(UPDATE_STATUS_KEY, next);
      }}
      onBaselineModeChange={(next) => {
        setBaselineMode(next);
        saveBaselineWriteMode(next);
      }}
      onRun={() => {
        if (entry) {
          if (!entryStoryIds?.length) return;
          void runSelectedRef.current(entryStoryIds);
          return;
        }
        void runSelectedRef.current();
      }}
      onStop={() => void cancelVisualRun()}
      onOpenCompareResults={openResults}
      onOpenBaselineStatus={openResults}
      onOpenStatusResults={openResults}
    />
  );
}
