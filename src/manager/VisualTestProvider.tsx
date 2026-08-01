import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { API_HashEntry } from "storybook/internal/types";
import {
  addons,
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
  VISUAL_DELTA_STORY_FACTS_PATH,
  visualReviewStatusFromTags,
} from "../constants.js";
import type { AffectedVisualSummary } from "../shared/affected-types.js";
import type { VisualBaselineEnvironment } from "../shared/environments.js";
import type {
  VisualStoryDescriptor,
  VisualStoryFact,
  VisualStoryFactsResponse,
} from "../shared/story-facts.js";
import {
  baselineWriteRowLabel,
  loadBaselineWriteMode,
  saveBaselineWriteMode,
  type BaselineWriteMode,
} from "./VisualBaselineSplitButton.js";
import { VisualTestModuleUI } from "./VisualTestModuleUI.js";
import {
  abortVisualWork,
  applyPendingVisualStatuses,
  applyVisualRunResults,
  applyVisualStatuses,
  clearStaleVisualCreateProgress,
  clearVisualStatuses,
  compareExactStory,
  fetchAffectedVisualPlan,
  fetchVisualRunStatus,
  formatVisualProgressLabel,
  acceptableStoryIdsFromLastRun,
  fetchVisualConfig,
  loadPersistedVisualLastRun,
  loadPersistedVisualStatusJob,
  peekVisualCreateProgress,
  postVisualCreateBaselinesForStoryIds,
  postVisualActionScope,
  postVisualReviewStatuses,
  postVisualReviewStatusesFromResults,
  postVisualRun,
  postVisualUpdateBaselinesForStoryIds,
  publishVisualLastRun,
  reconnectVisualRun,
  resumePersistedVisualStatusJob,
  subscribeVisualCreateProgress,
  subscribeVisualLastRun,
  subscribeVisualRunLog,
  subscribeVisualRunProgress,
  visualRunnableStoryIds,
  type VisualCreateProgress,
  type VisualLastRunSummary,
  type VisualRunProgress,
  type VisualRunResultItem,
  type VisualRunScope,
} from "./run-visual.js";
import {
  executeVisualActionSequence,
  resultsForFrozenVisualScope,
  resolveVisualActionStoryIds,
  visualActionContextForSidebarEntry,
} from "../shared/action-scope.js";
import {
  appendVisualRunLogLine,
  formatProgressFraction,
  lastMeaningfulLogLine,
} from "../shared/status-log.js";
import {
  AFFECTED_ONLY_KEY,
  CREATE_BASELINES_KEY,
  RUN_DIFF_KEY,
  RUN_VISUAL_KEY,
  UPDATE_STATUS_KEY,
  anyModuleActionSelected,
  loadCreateBaselinesEnabled,
  loadAffectedOnlyEnabled,
  loadModuleBaselineWriteMode,
  loadRunDiffEnabled,
  loadRunVisualEnabled,
  loadUpdateStatusEnabled,
  writeBoolFlag,
} from "./visual-test-module-prefs.js";
import {
  buildVisualFilterOptionCounts,
  buildVisualEnvironmentFilterGroups,
  buildVisualStoryFilterFacts,
  countStoriesMatchingFilters,
  createVisualStoryFilter,
  parseVisualFilterIds,
  serializeVisualFilterIds,
  visualStoryMatchesFilters,
  VISUAL_FILTER_ADDON_ID,
  VISUAL_FILTER_QUERY_PARAM,
} from "./visual-filters.js";
import { deferUntilPreviewReady } from "./defer-until-preview-ready.js";

type ChipStatus = "positive" | "negative" | "critical" | "warning" | "unknown";

const statusStore = experimental_getStatusStore(STATUS_TYPE_ID_VISUAL);
const testProviderStore = experimental_getTestProviderStore(TEST_PROVIDER_ID);

/** Deduplicate remount recovery across provider instances after HMR. */
let visualRecoveryInFlight: Promise<void> | null = null;

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

/**
 * Live single-line status under the Testing Module title (mirrors the panel
 * status streamer: last meaningful log line, with coarse fallbacks).
 */
export function moduleStreamingDescription(
  isRunning: boolean,
  isWritingBaselines: boolean,
  isUpdatingStatus: boolean,
  progress: VisualRunProgress | null,
  createProgress: VisualCreateProgress | null,
  statusLog: string | null,
): string | null {
  if (isUpdatingStatus) {
    return lastMeaningfulLogLine(statusLog ?? "") || "Updating review status…";
  }
  if (isWritingBaselines) {
    return (
      lastMeaningfulLogLine(createProgress?.logTail ?? "") ||
      createProgress?.label ||
      "Writing baselines…"
    );
  }
  if (isRunning) {
    return (
      lastMeaningfulLogLine(statusLog ?? "") ||
      formatVisualProgressLabel(progress)
    );
  }
  return null;
}

/** Idle summary under the Testing Module title. */
export function moduleDescription(
  isRunning: boolean,
  isWritingBaselines: boolean,
  isUpdatingStatus: boolean,
  progress: VisualRunProgress | null,
  createProgress: VisualCreateProgress | null,
  lastRun: VisualLastRunSummary | null,
  anyActionSelected: boolean,
  statusLog: string | null = null,
): React.ReactNode {
  if (!anyActionSelected) return "Select at least one action";
  const streaming = moduleStreamingDescription(
    isRunning,
    isWritingBaselines,
    isUpdatingStatus,
    progress,
    createProgress,
    statusLog,
  );
  if (streaming) return streaming;

  const parts: React.ReactNode[] = [];
  if (lastRun) {
    if (lastRun.affected?.noChange) {
      parts.push("Up to date");
    }
    const total = Math.max(
      lastRun.summary.total,
      lastRun.summary.passed + lastRun.summary.failed + lastRun.summary.skipped,
    );
    if (!lastRun.affected?.noChange) {
      parts.push(
        <React.Fragment key="tests">
          Ran {total} {total === 1 ? "test" : "tests"}{" "}
          <RelativeTime timestamp={lastRun.finishedAt} />
        </React.Fragment>,
      );
    }
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
  if (lastRun?.affected?.noChange) return "Up to date";
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

export function affectedSummaryLabel(
  summary: AffectedVisualSummary | null,
): string | null {
  if (!summary) return null;
  if (summary.noChange) return "Up to date";
  const label = `${summary.selected} affected · ${summary.unchanged} unchanged`;
  return summary.fallbackReason ? `${label} · full fallback` : label;
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

type VisualStatusByStory = Record<
  string,
  Partial<Record<string, { value?: string }>>
>;

export function VisualTestProviderRender({ entry }: { entry?: API_HashEntry }) {
  const api = useStorybookApi();
  const storybookState = useStorybookState() as {
    filteredIndex?: Record<string, API_HashEntry>;
    index?: Record<string, API_HashEntry>;
    customQueryParams?: Record<string, unknown>;
    storyId?: string;
  };
  const testProviderState = experimental_useTestProviderStore(
    (state) => state[TEST_PROVIDER_ID] ?? "test-provider-state:pending",
  );
  const allStatuses = experimental_useStatusStore();
  const [lastRun, setLastRun] = useState<VisualLastRunSummary | null>(() =>
    loadPersistedVisualLastRun(),
  );
  const [progress, setProgress] = useState<VisualRunProgress | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [createProgress, setCreateProgress] =
    useState<VisualCreateProgress | null>(null);
  const [statusLog, setStatusLog] = useState<string | null>(null);
  const [statusProgress, setStatusProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusUpdateLabel, setStatusUpdateLabel] = useState<string | null>(
    null,
  );
  const [scopeMessage, setScopeMessage] = useState<string | null>(null);
  const [storyCoverage, setStoryCoverage] = useState<VisualStoryFact[]>([]);
  const [availableFilterEnvironments, setAvailableFilterEnvironments] =
    useState<VisualBaselineEnvironment[]>([]);
  const [requiredFilterEnvironments, setRequiredFilterEnvironments] =
    useState<VisualBaselineEnvironment[]>([]);
  const [visualFiltersAvailable, setVisualFiltersAvailable] = useState(false);
  const [activeVisualFilterIds, setActiveVisualFilterIds] = useState<string[]>(
    () => parseVisualFilterIds(api.getQueryParam(VISUAL_FILTER_QUERY_PARAM)),
  );
  const [runVisualEnabled, setRunVisualEnabled] =
    useState(loadRunVisualEnabled);
  const [runDiffEnabled, setRunDiffEnabled] = useState(loadRunDiffEnabled);
  const [createBaselinesEnabled, setCreateBaselinesEnabled] = useState(
    loadCreateBaselinesEnabled,
  );
  const [updateStatusEnabled, setUpdateStatusEnabled] = useState(
    loadUpdateStatusEnabled,
  );
  const [affectedOnlyEnabled, setAffectedOnlyEnabled] = useState(
    entry ? false : loadAffectedOnlyEnabled,
  );
  const [affectedSummary, setAffectedSummary] =
    useState<AffectedVisualSummary | null>(null);
  const [baselineMode, setBaselineMode] = useState<BaselineWriteMode>(() =>
    loadModuleBaselineWriteMode(),
  );
  const isWritingBaselines = Boolean(
    createProgress?.running && createProgress.kind !== "rebuild",
  );
  const sidebarStoryIds = useMemo(
    () => sidebarLeafStoryIds(storybookState),
    [storybookState.filteredIndex, storybookState.index],
  );
  const rawStoryDescriptors: VisualStoryDescriptor[] = (() => {
    const index = storybookState.index;
    if (!index) return [];
    return Object.values(index)
      .filter((item) => item.type === "story")
      .map((item) => ({
        id: item.id,
        type: item.type,
        title: "title" in item ? item.title : undefined,
        name: item.name,
        importPath: "importPath" in item ? item.importPath : undefined,
        exportName: "exportName" in item ? item.exportName : undefined,
        tags: item.tags,
      }));
  })();
  const storyDescriptorSignature = JSON.stringify(rawStoryDescriptors);
  const storyDescriptors = useMemo(
    () => rawStoryDescriptors,
    [storyDescriptorSignature],
  );
  const hasCompletedVisualRun = Boolean(
    lastRun?.results && lastRun.completed !== false,
  );
  const visualFilterFacts = useMemo(
    () =>
      buildVisualStoryFilterFacts(
        storyDescriptors,
        storyCoverage,
        lastRun?.results,
        hasCompletedVisualRun,
        requiredFilterEnvironments,
      ),
    [
      hasCompletedVisualRun,
      lastRun?.results,
      requiredFilterEnvironments,
      storyCoverage,
      storyDescriptors,
    ],
  );
  const visualEnvironmentFilterGroups = useMemo(
    () =>
      buildVisualEnvironmentFilterGroups(
        availableFilterEnvironments,
        requiredFilterEnvironments,
      ),
    [availableFilterEnvironments, requiredFilterEnvironments],
  );
  const visualFilterOptionCounts = useMemo(
    () =>
      buildVisualFilterOptionCounts(
        visualFilterFacts,
        hasCompletedVisualRun,
      ),
    [hasCompletedVisualRun, visualFilterFacts],
  );
  const visualFilterMatchingSummary = useMemo(
    () =>
      countStoriesMatchingFilters(
        visualFilterFacts,
        activeVisualFilterIds,
        hasCompletedVisualRun,
      ),
    [activeVisualFilterIds, hasCompletedVisualRun, visualFilterFacts],
  );

  const anyActionSelected = anyModuleActionSelected({
    runVisualEnabled,
    runDiffEnabled,
    createBaselinesEnabled,
    updateStatusEnabled,
  });

  const entryStoryIds = useMemo(() => {
    if (!entry) return undefined;
    if (entry.type === "story") return [entry.id];
    if ("id" in entry) return api.findAllLeafStoryIds(entry.id);
    return undefined;
  }, [api, entry]);
  const entryScope = visualActionContextForSidebarEntry(entry?.type);

  useEffect(() => {
    if (entry) return;
    const controller = new AbortController();
    const cleanup = deferUntilPreviewReady({
      channel: addons.getChannel(),
      storyId: storybookState.storyId,
      callback: () => {
        void fetchAffectedVisualPlan()
          .then((summary) => {
            if (!controller.signal.aborted) setAffectedSummary(summary);
          })
          .catch(() => {
            if (!controller.signal.aborted) setAffectedSummary(null);
          });
      },
    });
    return () => {
      controller.abort();
      cleanup();
    };
  }, [entry, storybookState.storyId]);

  const statusIds = useMemo(() => {
    let passedIds: string[] = [];
    let failedIds: string[] = [];
    const ids = entryStoryIds ?? Object.keys(allStatuses);
    for (const id of ids) {
      const status = allStatuses[id]?.[STATUS_TYPE_ID_VISUAL];
      if (!status) continue;
      if (
        status.value === "status-value:error" ||
        status.value === "status-value:warning"
      )
        failedIds.push(id);
      else if (status.value === "status-value:success") passedIds.push(id);
    }
    return { passedIds, failedIds };
  }, [allStatuses, entryStoryIds]);

  const alwaysVisibleErrorCount = useMemo(() => {
    if (!activeVisualFilterIds.length) return 0;
    let count = 0;
    for (const [storyId, byType] of Object.entries(
      allStatuses as VisualStatusByStory,
    )) {
      const status = byType?.[STATUS_TYPE_ID_VISUAL];
      if (status?.value !== "status-value:error") continue;
      const fact = visualFilterFacts.get(storyId);
      if (
        fact &&
        !visualStoryMatchesFilters(
          fact,
          activeVisualFilterIds,
          hasCompletedVisualRun,
        )
      ) {
        count++;
      }
    }
    return count;
  }, [
    activeVisualFilterIds,
    allStatuses,
    hasCompletedVisualRun,
    visualFilterFacts,
  ]);

  const counts = {
    passed: statusIds.passedIds.length,
    failed: statusIds.failedIds.length,
  };

  const isRunning = testProviderState === "test-provider-state:running";
  const crashed = testProviderState === "test-provider-state:crashed";

  const runCompare = useCallback(
    async (
      scope: VisualRunScope,
      ids: string[],
      resolvedSummary?: AffectedVisualSummary,
    ) => {
      const runnable = visualRunnableStoryIds(api, ids);
      if (!runnable.length) {
        throw new Error(
          "No runnable visual stories in this scope (all skip-visual)",
        );
      }
      applyPendingVisualStatuses(runnable);
      if (scope === "story" && runnable.length === 1) {
        const result = await compareExactStory(api, runnable[0]!, {
          onProgress: (next) => {
            setStatusLog(next.label);
          },
        });
        applyVisualRunResults(runnable, [result]);
        const outcomePassed =
          result.outcome === "passed" ||
          result.outcome === "changed-within-tolerance";
        const warning = result.policyStatus === "warning";
        const summary: VisualLastRunSummary = {
          finishedAt: Date.now(),
          summary: {
            total: 1,
            passed: outcomePassed ? 1 : 0,
            failed: outcomePassed || warning ? 0 : 1,
            skipped: 0,
            warnings: warning ? 1 : 0,
          },
          completed: true,
          error: outcomePassed || warning ? undefined : "1 failed",
          scope,
          logTail: "Live browser story comparison",
          results: [result],
        };
        publishVisualLastRun(summary);
        return [result];
      }
      const data = await postVisualRun({
        storyIds: runnable,
        selection: "selected",
      });
      if (data.crashed) {
        const summary: VisualLastRunSummary = {
          finishedAt: Date.now(),
          summary: data.summary,
          completed: false,
          error: data.error ?? "Visual test run crashed",
          scope,
          logTail: data.logTail,
          results: data.results,
          affected: resolvedSummary ?? data.affected,
        };
        publishVisualLastRun(summary);
        throw new Error(data.error ?? "Visual test run crashed");
      }
      applyVisualRunResults(runnable, data.results);
      const effectiveSummary = resolvedSummary ?? data.affected;
      const summary: VisualLastRunSummary = {
        finishedAt: Date.now(),
        summary: data.summary,
        completed: true,
        error:
          data.summary.failed > 0 ? `${data.summary.failed} failed` : undefined,
        scope,
        logTail: data.logTail,
        results: data.results,
        affected: effectiveSummary,
      };
      publishVisualLastRun(summary);
      if (effectiveSummary) setAffectedSummary(effectiveSummary);
      return data.results;
    },
    [api],
  );

  const runCompareRef = useRef(runCompare);
  runCompareRef.current = runCompare;

  const latestResultsRef = useRef<VisualRunResultItem[] | undefined>(undefined);
  const entryStoryIdsRef = useRef(entryStoryIds);
  entryStoryIdsRef.current = entryStoryIds;
  const entryScopeRef = useRef(entryScope);
  entryScopeRef.current = entryScope;
  const sidebarStoryIdsRef = useRef(sidebarStoryIds);
  sidebarStoryIdsRef.current = sidebarStoryIds;

  const runSelectedActions = useCallback(
    async (scopedIds?: string[]) => {
      const runVisual = loadRunVisualEnabled();
      const runDiff = loadRunDiffEnabled();
      const writeBaselines = loadCreateBaselinesEnabled();
      const updateStatus = loadUpdateStatusEnabled();
      const shouldCompare = runVisual || runDiff;
      if (!shouldCompare && !writeBaselines && !updateStatus) {
        return;
      }

      await testProviderStore.runWithState(async () => {
        try {
          setIsComparing(false);
          setScopeMessage(null);
          setStatusLog(null);
          setStatusProgress(null);
          const contextIds =
            scopedIds ??
            (entryStoryIdsRef.current?.length
              ? entryStoryIdsRef.current
              : undefined);
          let frozenIds: string[];
          let compareScope: VisualRunScope;
          let resolvedSummary: AffectedVisualSummary | undefined;

          if (contextIds) {
            const contextScope =
              entryScopeRef.current ??
              (contextIds.length === 1 ? "story" : "component");
            frozenIds = resolveVisualActionStoryIds({
              context: contextScope,
              contextStoryIds: contextIds,
            });
            compareScope = contextScope;
          } else {
            const visibleStoryIds = resolveVisualActionStoryIds({
              context: "global",
              visibleStoryIds: sidebarStoryIdsRef.current,
            });
            if (!visibleStoryIds.length) {
              setScopeMessage("No visible stories");
              return;
            }
            setStatusLog(
              affectedOnlyEnabled
                ? "Resolving affected scope…"
                : "Resolving visible scope…",
            );
            const resolved = await postVisualActionScope(
              {
                visibleStoryIds,
                affectedOnly: affectedOnlyEnabled,
              },
              {
                onProgress: (next) => {
                  setStatusLog(next.message);
                },
              },
            );
            frozenIds = [...resolved.storyIds];
            compareScope = affectedOnlyEnabled ? "affected" : "all";
            resolvedSummary = resolved.summary;
            setAffectedSummary(resolved.summary);
            if (!frozenIds.length) {
              setScopeMessage(
                affectedOnlyEnabled ? "Up to date" : "No visible stories",
              );
              return;
            }
          }

          await executeVisualActionSequence<VisualRunResultItem[]>({
            writeBaselines: writeBaselines
              ? async () => {
                  const mode = loadBaselineWriteMode();
                  if (mode === "rewrite") {
                    await postVisualUpdateBaselinesForStoryIds(api, frozenIds);
                  } else {
                    await postVisualCreateBaselinesForStoryIds(api, frozenIds);
                  }
                }
              : undefined,
            runVisualTests: shouldCompare
              ? async () => {
                  setIsComparing(true);
                  try {
                    return await runCompareRef.current(
                      compareScope,
                      frozenIds,
                      resolvedSummary,
                    );
                  } finally {
                    setIsComparing(false);
                  }
                }
              : undefined,
            updateStatus: updateStatus
              ? async (results) => {
                  setIsUpdatingStatus(true);
                  try {
                    const priorResults = latestResultsRef.current?.filter(
                      (item) => frozenIds.includes(item.storyId),
                    );
                    let freshPriorResults: VisualRunResultItem[] | undefined;
                    if (priorResults?.length) {
                      const requested = new Set(frozenIds);
                      const evidenceResponse = await fetch(
                        VISUAL_DELTA_STORY_FACTS_PATH,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            stories: storyDescriptors.filter((story) =>
                              requested.has(story.id),
                            ),
                          }),
                        },
                      );
                      const evidence =
                        (await evidenceResponse.json()) as VisualStoryFactsResponse;
                      if (evidenceResponse.ok && evidence.ok) {
                        const facts = new Map(
                          evidence.stories.map((fact) => [fact.storyId, fact]),
                        );
                        const matchingResults = priorResults.filter((item) => {
                          const sidecar = item.sidecar;
                          const fact = facts.get(item.storyId);
                          return Boolean(
                            sidecar?.baselineHash &&
                              sidecar.captureConfigHash &&
                              fact?.baselineHash === sidecar.baselineHash &&
                              fact.resultBaselineHash ===
                                sidecar.baselineHash &&
                              fact.resultCaptureConfigHash ===
                                sidecar.captureConfigHash,
                          );
                        });
                        freshPriorResults = resultsForFrozenVisualScope(
                          frozenIds,
                          matchingResults,
                        );
                      }
                    }
                    const source =
                      results ??
                      (freshPriorResults?.length
                        ? freshPriorResults
                        : undefined) ??
                      [];
                    if (!source.length) {
                      throw new Error(
                        "No visual results to update status from — run visual tests first",
                      );
                    }
                    setStatusProgress({ completed: 0, total: source.length });
                    setStatusLog(`Updating review status… 0/${source.length}`);
                    const { updated, errors, skippedMissingBaseline } =
                      await postVisualReviewStatusesFromResults(source, {
                        currentReviewStatus: (storyId) =>
                          visualReviewStatusFromTags(
                            api.getData(storyId)?.tags,
                          ),
                      });
                    setStatusProgress({
                      completed: source.length,
                      total: source.length,
                    });
                    const parts = [`Updated ${updated} review tags`];
                    if (skippedMissingBaseline) {
                      parts.push(
                        `${skippedMissingBaseline} skipped (no baseline)`,
                      );
                    }
                    if (errors.length) {
                      parts.push(`${errors.length} failed`);
                    }
                    const doneLabel = parts.join(" · ");
                    setStatusUpdateLabel(doneLabel);
                    setStatusLog(doneLabel);
                    if (errors.length && updated === 0) {
                      throw new Error(errors[0] ?? "Update status failed");
                    }
                  } finally {
                    setIsUpdatingStatus(false);
                    setStatusProgress(null);
                  }
                }
              : undefined,
            acceptPasses: runDiff
              ? async (results) => {
                  const config = await fetchVisualConfig();
                  if (!config.workflow.autoAcceptLiveStoryComparisons) {
                    return;
                  }
                  const source =
                    results ??
                    latestResultsRef.current?.filter((item) =>
                      frozenIds.includes(item.storyId),
                    ) ??
                    [];
                  const cleanIds = acceptableStoryIdsFromLastRun({
                    finishedAt: Date.now(),
                    summary: {
                      total: source.length,
                      passed: 0,
                      failed: 0,
                      skipped: 0,
                    },
                    completed: true,
                    results: source,
                  });
                  const acceptIds = cleanIds.filter((storyId) =>
                    config.browsers.every((browser) =>
                      source.some(
                        (item) =>
                          item.storyId === storyId &&
                          (item.environment?.browser ?? "chromium") === browser,
                      ),
                    ),
                  );
                  if (!acceptIds.length) return;
                  setIsUpdatingStatus(true);
                  try {
                    setStatusLog(
                      `Accepting ${acceptIds.length} passing stor${
                        acceptIds.length === 1 ? "y" : "ies"
                      }…`,
                    );
                    const { updated, errors } = await postVisualReviewStatuses(
                      acceptIds.map((storyId) => ({
                        storyId,
                        status: "approved",
                      })),
                    );
                    const parts = [`Accepted ${updated}`];
                    if (errors.length) {
                      parts.push(`${errors.length} failed`);
                    }
                    const doneLabel = parts.join(" · ");
                    setStatusUpdateLabel(doneLabel);
                    setStatusLog(doneLabel);
                    if (errors.length && updated === 0) {
                      throw new Error(errors[0] ?? "Accept passes failed");
                    }
                  } finally {
                    setIsUpdatingStatus(false);
                  }
                }
              : undefined,
          });
        } catch (error) {
          if (
            (error instanceof DOMException && error.name === "AbortError") ||
            (error instanceof Error && error.name === "AbortError")
          ) {
            return;
          }
          throw error;
        }
      });
    },
    [affectedOnlyEnabled, api, storyDescriptors],
  );

  const runSelectedRef = useRef(runSelectedActions);
  runSelectedRef.current = runSelectedActions;

  useEffect(() => {
    return subscribeVisualRunProgress((next) => {
      setProgress(next);
      if (next?.affected) setAffectedSummary(next.affected);
      if (next) {
        setStatusLog((prev) => appendVisualRunLogLine(prev, next));
      }
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
    if (entry) return;
    const fromUrl = parseVisualFilterIds(
      storybookState.customQueryParams?.[VISUAL_FILTER_QUERY_PARAM],
    );
    setActiveVisualFilterIds((current) =>
      serializeVisualFilterIds(current) === serializeVisualFilterIds(fromUrl)
        ? current
        : fromUrl,
    );
  }, [entry, storybookState.customQueryParams]);

  useEffect(() => {
    if (entry) return;
    const controller = new AbortController();
    void fetch(VISUAL_DELTA_STORY_FACTS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stories: storyDescriptors }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as
          | VisualStoryFactsResponse
          | { ok?: false };
        if (!response.ok || !data.ok) {
          throw new Error("Visual story facts are unavailable");
        }
        setStoryCoverage(data.stories);
        setAvailableFilterEnvironments(data.availableEnvironments ?? []);
        setRequiredFilterEnvironments(data.requiredEnvironments ?? []);
        setVisualFiltersAvailable(true);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStoryCoverage([]);
        setAvailableFilterEnvironments([]);
        setRequiredFilterEnvironments([]);
        setVisualFiltersAvailable(false);
      });
    return () => controller.abort();
  }, [entry, storyDescriptors]);

  useEffect(() => {
    if (entry || !visualFiltersAvailable) return;
    void api.experimental_setFilter(
      VISUAL_FILTER_ADDON_ID,
      createVisualStoryFilter(
        visualFilterFacts,
        activeVisualFilterIds,
        hasCompletedVisualRun,
      ),
    );
  }, [
    activeVisualFilterIds,
    api,
    entry,
    hasCompletedVisualRun,
    visualFilterFacts,
    visualFiltersAvailable,
  ]);

  useEffect(() => {
    if (entry) return;
    return () => {
      void api.experimental_setFilter(VISUAL_FILTER_ADDON_ID, () => true);
    };
  }, [api, entry]);

  useEffect(() => {
    return subscribeVisualRunLog((line) => {
      setStatusLog((prev) => (prev ? `${prev}\n${line}` : line));
    });
  }, []);

  useEffect(() => {
    return subscribeVisualLastRun((next) => {
      setLastRun(next);
      latestResultsRef.current = next?.results;
      if (!next) return;
      if (next.affected) setAffectedSummary(next.affected);
      const summaryLine = next.error
        ? `Visual: ${next.error}${next.scope ? ` (${next.scope})` : ""}`
        : next.summary.failed > 0
          ? `Visual: ${next.summary.failed} failed · ${next.summary.passed} passed${next.scope ? ` (${next.scope})` : ""}`
          : `Visual: ${next.summary.passed} passed${next.scope ? ` (${next.scope})` : ""}`;
      const logTail = next.logTail?.trim();
      setStatusLog(logTail ? `${logTail}\n${summaryLine}` : summaryLine);
    });
  }, []);

  useEffect(() => {
    return subscribeVisualCreateProgress((next) => {
      setCreateProgress(next);
      if (next?.running && next.logTail) {
        setStatusLog(next.logTail);
      } else if (next && !next.running && (next.label || next.error)) {
        setStatusLog(next.error ?? next.label);
      }
    });
  }, []);

  // After manager HMR (e.g. Update status rewriting CSF), reattach to a live
  // Playwright run and restore / resume review-status work.
  useEffect(() => {
    if (entry) return;
    let cancelled = false;
    const prior = visualRecoveryInFlight;
    const work = (async () => {
      try {
        if (prior) await prior;
      } catch {
        /* prior recovery failure must not block the next remount */
      }
      if (cancelled) return;

      const persisted = loadPersistedVisualLastRun();
      if (persisted) publishVisualLastRun(persisted);

      const hub = await fetchVisualRunStatus();
      if (cancelled) return;

      if (hub.phase !== "running") {
        setProgress(null);
        setIsComparing(false);
      }
      if (hub.phase !== "running" && !hub.childActive) {
        clearStaleVisualCreateProgress();
        // Hub idle with no writer/status job: drop orphan Testing Module
        // "Running…" left by a hung/aborted runWithState after HMR.
        if (
          !peekVisualCreateProgress()?.running &&
          !loadPersistedVisualStatusJob() &&
          testProviderStore.getState() === "test-provider-state:running"
        ) {
          testProviderStore.setState("test-provider-state:pending");
        }
      }

      if (hub.phase === "running") {
        setIsComparing(true);
        if (hub.total > 0) {
          setProgress({
            completed: hub.completed,
            total: hub.total,
            passed: hub.passed,
            failed: hub.failed,
          });
        }
        try {
          await testProviderStore.runWithState(async () => {
            const data = await reconnectVisualRun();
            if (cancelled) {
              setProgress(null);
              return;
            }
            if (data.idle || data.cancelled) {
              setProgress(null);
              return;
            }
            applyVisualRunResults(undefined, data.results);
            publishVisualLastRun({
              finishedAt: Date.now(),
              summary: data.summary,
              completed: !data.crashed,
              error: data.crashed
                ? (data.error ?? "Visual test run crashed")
                : data.summary.failed > 0
                  ? `${data.summary.failed} failed`
                  : undefined,
              logTail: data.logTail,
              results: data.results,
              affected: data.affected,
            });
            if (data.crashed) {
              throw new Error(data.error ?? "Visual test run crashed");
            }
          });
        } finally {
          setIsComparing(false);
          setProgress(null);
        }
      } else if (hub.phase === "done") {
        const data = await reconnectVisualRun();
        if (!cancelled && !data.idle && !data.cancelled) {
          applyVisualRunResults(undefined, data.results);
          publishVisualLastRun({
            finishedAt: Date.now(),
            summary: data.summary,
            completed: !data.crashed,
            error: data.crashed
              ? (data.error ?? "Visual test run crashed")
              : data.summary.failed > 0
                ? `${data.summary.failed} failed`
                : undefined,
            logTail: data.logTail,
            results: data.results,
            affected: data.affected,
          });
        }
        if (!cancelled) setProgress(null);
      }

      if (cancelled || !loadPersistedVisualStatusJob()) return;

      await testProviderStore.runWithState(async () => {
        setIsUpdatingStatus(true);
        try {
          const jobResults = loadPersistedVisualStatusJob()?.updates ?? [];
          setStatusProgress({
            completed: 0,
            total: jobResults.length,
          });
          setStatusLog(
            `Updating review status… 0/${jobResults.length} (resumed)`,
          );
          const result = await resumePersistedVisualStatusJob();
          if (!result || cancelled) return;
          setStatusProgress({
            completed: jobResults.length,
            total: jobResults.length,
          });
          const doneLabel = result.errors.length
            ? `Updated ${result.updated} · ${result.errors.length} failed`
            : `Updated ${result.updated} review tags`;
          setStatusUpdateLabel(doneLabel);
          setStatusLog(doneLabel);
        } finally {
          setIsUpdatingStatus(false);
          setStatusProgress(null);
        }
      });
    })();
    visualRecoveryInFlight = work.finally(() => {
      if (visualRecoveryInFlight === work) visualRecoveryInFlight = null;
    });

    return () => {
      cancelled = true;
    };
  }, [entry]);

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
      setScopeMessage(null);
      setStatusLog(null);
      setStatusProgress(null);
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

  const label = chipLabel(chipStatus, isComparing, progress, lastRun, counts);
  const failedCount = isComparing
    ? (progress?.failed ?? 0)
    : counts.failed > 0
      ? counts.failed
      : (lastRun?.summary.failed ?? 0);
  const chipCount = failedCount > 0 ? failedCount : null;
  const hasResults = counts.passed > 0 || counts.failed > 0 || Boolean(lastRun);
  const statusLine =
    scopeMessage ??
    moduleDescription(
      isRunning,
      isWritingBaselines,
      isUpdatingStatus,
      progress,
      createProgress,
      lastRun,
      anyActionSelected,
      statusLog,
    );
  const compareRowProgress = isComparing
    ? (formatProgressFraction(progress?.completed, progress?.total) ?? "…")
    : null;
  const baselineRowProgress = isWritingBaselines
    ? (formatProgressFraction(
        createProgress?.completed,
        createProgress?.total,
      ) ??
      createProgress?.label?.match(/(\d+)\s*\/\s*(\d+)/)?.[0] ??
      "…")
    : null;
  const statusRowProgress = isUpdatingStatus
    ? (formatProgressFraction(
        statusProgress?.completed,
        statusProgress?.total,
      ) ?? "…")
    : null;

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
      runDiffEnabled={runDiffEnabled}
      createBaselinesEnabled={createBaselinesEnabled}
      updateStatusEnabled={updateStatusEnabled}
      affectedOnlyEnabled={!entry && affectedOnlyEnabled}
      affectedSummaryLabel={affectedSummaryLabel(affectedSummary)}
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
      compareRowProgress={compareRowProgress}
      baselineRowProgress={baselineRowProgress}
      statusRowProgress={statusRowProgress}
      isWritingBaselines={isWritingBaselines}
      isUpdatingStatus={isUpdatingStatus}
      isCompareRunning={isComparing}
      onRunVisualChange={(next) => {
        setRunVisualEnabled(next);
        writeBoolFlag(RUN_VISUAL_KEY, next);
      }}
      onRunDiffChange={(next) => {
        setRunDiffEnabled(next);
        writeBoolFlag(RUN_DIFF_KEY, next);
      }}
      onCreateBaselinesChange={(next) => {
        setCreateBaselinesEnabled(next);
        writeBoolFlag(CREATE_BASELINES_KEY, next);
      }}
      onUpdateStatusChange={(next) => {
        setUpdateStatusEnabled(next);
        writeBoolFlag(UPDATE_STATUS_KEY, next);
      }}
      onAffectedOnlyChange={(next) => {
        setAffectedOnlyEnabled(next);
        writeBoolFlag(AFFECTED_ONLY_KEY, next);
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
      onStop={() => {
        void abortVisualWork().finally(() => {
          testProviderStore.setState("test-provider-state:pending");
        });
        setProgress(null);
        setIsComparing(false);
        setIsUpdatingStatus(false);
        setStatusProgress(null);
      }}
      onOpenCompareResults={openResults}
      onOpenBaselineStatus={openResults}
      onOpenStatusResults={openResults}
      visualFilters={
        !entry && visualFiltersAvailable
          ? {
              activeIds: activeVisualFilterIds,
              resultFiltersEnabled: hasCompletedVisualRun,
              alwaysVisibleErrorCount,
              optionCounts: visualFilterOptionCounts,
              matchingSummary: visualFilterMatchingSummary,
              environmentGroups: visualEnvironmentFilterGroups,
              onChange: (next) => {
                setActiveVisualFilterIds(next);
                api.applyQueryParams(
                  {
                    [VISUAL_FILTER_QUERY_PARAM]:
                      serializeVisualFilterIds(next) || null,
                  },
                  { replace: true },
                );
              },
            }
          : undefined
      }
    />
  );
}
