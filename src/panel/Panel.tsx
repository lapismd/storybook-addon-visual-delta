import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import pixelmatch from "pixelmatch";
import {
  AddonPanel,
  Button,
  EmptyTabContent,
  ToggleButton,
} from "storybook/internal/components";
import {
  experimental_getTestProviderStore,
  useAddonState,
  useChannel,
  useStorybookApi,
  useStorybookState,
} from "storybook/manager-api";
import {
  ADDON_ID,
  DEFAULT_DIFF_THRESHOLD,
  DEFAULT_PASS_THRESHOLD_PERCENT,
  EVENTS,
  SKIP_VISUAL_TAG,
  TEST_PROVIDER_ID,
  deviceScaleFactorForImage,
  isSplitPlacement,
  viewportForImage,
  visualReviewStatusFromTags,
  type VisualDeltaInteraction,
  type VisualReviewStatus,
} from "../constants.js";
import type { AcceptScope } from "../manager/AcceptSplitButton.js";
import {
  DEFAULT_ADDON_STATE,
  type VisualDeltaAddonState,
} from "../manager/PanelTitle.js";
import {
  applyPendingVisualStatuses,
  applyVisualRunResults,
  applyVisualStatuses,
  cancelVisualRun,
  clearVisualStatuses,
  componentStoryIdsFor,
  formatVisualProgressLabel,
  fetchVisualConfig,
  postPlaywrightPassThreshold,
  postVisualCreateBaseline,
  postVisualInit,
  postVisualInteractionBaseline,
  postVisualRebuildStatic,
  postVisualReviewStatus,
  postVisualRun,
  postVisualSkipVisual,
  postVisualUpdateBaseline,
  publishVisualLastRun,
  subscribeVisualCreateProgress,
  subscribeVisualLastRun,
  subscribeVisualRunProgress,
  visualResultFromLiveDiff,
  visualRunnableStoryIds,
  type VisualCreateProgress,
  type VisualRunProgress,
} from "../manager/run-visual.js";
import { loadRebuildStaticEnabled } from "../manager/visual-test-module-prefs.js";
import {
  loadDiffCaptureEngine,
  type DiffCaptureEngine,
} from "../manager/DiffCaptureSplitButton.js";
import type { VisualRunMode } from "../manager/VisualRunSplitButton.js";
import { appendVisualRunLogLine } from "../shared/status-log.js";
import type { DiffResultData } from "../types.js";
import {
  capturePreviewSubject,
  fitImageData,
  loadImage,
  maskTransparentRegions,
  withPlaywrightPreviewViewport,
} from "./capture.js";
import { postChromiumSubjectCapture } from "./chromium-capture.js";
import { buildDiffHistogram, buildFocusAssets } from "./diff-assets.js";
import { DiffResult } from "./DiffResult.js";
import { useOverlayHidden, useOverlayInfo, useStoryData } from "./hooks.js";
import { loadPlaywrightDiffResult } from "./load-playwright-diff.js";
import { ImageGallery } from "./ImageGallery.js";
import {
  BaselineAccordion,
  SectionThumb,
  SectionThumbFrame,
  type BaselineSection,
  type BaselineSectionId,
} from "./BaselineAccordion.js";
import { LiveVisibilityToggle } from "./LiveVisibilityToggle.js";
import { PanelStatusBar } from "./PanelStatusBar.js";
import { PlacementPad } from "./PlacementPad.js";
import { ConfigurationPanel } from "./ConfigurationPanel.js";
import { ModeSelector } from "./ModeSelector.js";
import { VisualDeltaHeader } from "./VisualDeltaHeader.js";
import { baselineUrlForStoryRef } from "../shared/baseline-url.js";
import { resolveIgnoreSelectors } from "../shared/ignore.js";
import {
  endPlayDebug,
  gotoPlayStep,
  lookupPlayStepCallId,
  mergeInteractionRows,
  runUntilStep,
  setPlayParkTarget,
  usePlaySteps,
  type PlayStepInfo,
} from "./usePlaySteps.js";
import { SyncIcon } from "@storybook/icons";
import {
  ButtonGroup,
  Checkbox,
  CheckboxContainer,
  ErrorText,
  InlineControl,
  VD_HEADER_STICKY_TOP_VAR,
  VISUAL_DELTA_HEADER_HEIGHT,
  PanelBody,
  PanelScroll,
  PanelShell,
  SkeletonBone,
  SkeletonRoot,
  Slider,
  ThreshMismatchNote,
  ThreshStack,
  Toolbar as PanelToolbar,
  ToolbarRow,
  ToolbarSpacer,
  ValueDisplay,
} from "./styled.js";

const testProviderStore = experimental_getTestProviderStore(TEST_PROVIDER_ID);

export const Panel = memo(function Panel(props: { active?: boolean }) {
  const api = useStorybookApi();
  const { storyId: currentStoryId } = useStorybookState();
  const [shellEl, setShellEl] = useState<HTMLDivElement | null>(null);
  const [headerStickyTop, setHeaderStickyTop] = useState(
    VISUAL_DELTA_HEADER_HEIGHT,
  );
  const [captureError, setCaptureError] = useState<string | null>(null);
  const {
    images,
    interactions,
    modes,
    modeNames,
    selectedMode,
    index,
    overlayOn,
    storyId,
    opacity,
    colorInversion,
    placement,
    liveVisible,
    passThresholdByEngine,
    diffThreshold,
    diffIncludeAntiAliasing,
    delay,
    ignoreSelectors,
    cropToViewport,
    setIndex,
    setOpacity,
    setColorInversion,
    togglePlacement,
    setLiveVisible,
    setPassThresholdPercent,
    setSelectedMode,
    hideOverlay,
    showOverlay,
    resetOverlay,
    resetSettings,
    revealCenteredOverlay,
    hydrateBaselineImages,
    seedStoryFromManager,
    hydrateInteractions,
    selectInteractionBaseline,
    restorePrimaryBaselines,
    primaryImages,
  } = useStoryData();
  const [showConfiguration, setShowConfiguration] = useState(false);
  /** Preview decorator hasn't sent INIT_IMAGE for this story yet. */
  const storyReady = Boolean(storyId) && storyId === currentStoryId;
  const loading = !storyReady;
  const [, setAddonState] = useAddonState<VisualDeltaAddonState>(
    ADDON_ID,
    DEFAULT_ADDON_STATE,
  );
  /** Primary gallery + wired interaction PNGs — drives the panel tab badge. */
  const screenshotCount = useMemo(() => {
    if (!storyReady) return 0;
    const interactionCount = interactions.filter((item) =>
      Boolean(item.src),
    ).length;
    return primaryImages.length + interactionCount;
  }, [interactions, primaryImages.length, storyReady]);
  useEffect(() => {
    setAddonState((prev) =>
      prev.imageCount === screenshotCount
        ? prev
        : { ...prev, imageCount: screenshotCount },
    );
  }, [screenshotCount, setAddonState]);
  const { steps: playSteps } = usePlaySteps(storyId || undefined);
  const interactionSteps = useMemo(
    () => mergeInteractionRows(playSteps, interactions),
    [playSteps, interactions],
  );
  const [expandedId, setExpandedId] = useState<BaselineSectionId | null>(
    "default",
  );
  const [selectedInteractionId, setSelectedInteractionId] = useState<
    string | null
  >(null);
  /** Stem → last loaded compare; avoids blank flash when switching accordions. */
  const diffResultCacheRef = useRef(new Map<string, DiffResultData | null>());
  /** Play park currently targeted by accordion selection (`null` = Default). */
  const parkedStepRef = useRef<string | null>(null);
  const pinTimersRef = useRef<number[]>([]);
  const clearPinTimers = useCallback(() => {
    for (const timer of pinTimersRef.current) {
      window.clearTimeout(timer);
    }
    pinTimersRef.current = [];
  }, []);

  const emit = useChannel({
    [EVENTS.VISUAL_CAPTURE_PARKED]: (payload: {
      storyId?: string;
      stepId?: string;
    }) => {
      if (!payload.stepId) return;
      if (
        payload.storyId &&
        currentStoryId &&
        payload.storyId !== currentStoryId
      ) {
        return;
      }
      const wired = interactions.find((item) => item.id === payload.stepId);
      if (!wired) return;
      parkedStepRef.current = payload.stepId;
      setExpandedId(payload.stepId);
      setSelectedInteractionId(payload.stepId);
      selectInteractionBaseline(wired.src);
    },
  });

  // New story — drop park / pin bookkeeping so the next expand remounts cleanly.
  useEffect(() => {
    parkedStepRef.current = null;
    clearPinTimers();
    diffResultCacheRef.current.clear();
  }, [currentStoryId, clearPinTimers]);

  // Preview INIT_IMAGE can be missed (panel mounts before iframe, Storybook
  // restart, park remount). Retry until ready; seed from the manager index if
  // the preview channel never answers so we don't spin on Loading forever.
  useEffect(() => {
    if (storyReady || !currentStoryId) return;
    let attempts = 0;
    const requestOrSeed = () => {
      emit(EVENTS.REQUEST_INIT_IMAGE, { storyId: currentStoryId });
      attempts += 1;
      // After a few misses, unblock the panel from manager story data.
      if (attempts < 4) return;
      const entry = api.getData(currentStoryId);
      const storyName =
        entry && "name" in entry && entry.name
          ? String(entry.name)
          : currentStoryId;
      const params =
        entry && "parameters" in entry
          ? (entry.parameters as {
              visualDelta?: {
                images?: Array<string | { src?: string }>;
                interactions?: VisualDeltaInteraction[];
              };
            })
          : undefined;
      const fromParams = (params?.visualDelta?.images ?? [])
        .map((image) => (typeof image === "string" ? image : image?.src))
        .filter((src): src is string => Boolean(src));
      const fromConvention = baselineUrlForStoryRef(
        {
          id: currentStoryId,
          importPath:
            entry && "importPath" in entry
              ? String(entry.importPath)
              : undefined,
          tags: entry?.tags,
        },
        { allowSkipVisual: true },
      );
      const imageSrcs =
        fromParams.length > 0
          ? fromParams
          : fromConvention
            ? [fromConvention]
            : undefined;
      seedStoryFromManager({
        storyId: currentStoryId,
        storyName,
        imageSrcs,
      });
      const interactions = params?.visualDelta?.interactions;
      if (interactions?.length) hydrateInteractions(interactions);
    };
    const initial = window.setTimeout(requestOrSeed, 300);
    const interval = window.setInterval(requestOrSeed, 700);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [
    api,
    currentStoryId,
    emit,
    hydrateInteractions,
    seedStoryFromManager,
    storyReady,
  ]);

  const { getOverlayInfo } = useOverlayInfo();
  const { waitForOverlayHidden } = useOverlayHidden();
  const [isDiffing, setIsDiffing] = useState(false);
  const [diffProgressLabel, setDiffProgressLabel] = useState<string | null>(
    null,
  );
  const diffAbortRef = useRef<AbortController | null>(null);
  const [diffEngine, setDiffEngine] = useState<DiffCaptureEngine>(() =>
    loadDiffCaptureEngine(),
  );
  const passThresholdPercent = passThresholdByEngine[diffEngine];
  const [playwrightPassThresholdPercent, setPlaywrightPassThresholdPercent] =
    useState<number | null>(null);
  const [isUpdatingPlaywrightThreshold, setIsUpdatingPlaywrightThreshold] =
    useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [onboardingReady, setOnboardingReady] = useState<boolean | null>(null);
  const [onboardingHint, setOnboardingHint] = useState<string | null>(null);
  const [isIniting, setIsIniting] = useState(false);
  const [optimisticReview, setOptimisticReview] =
    useState<VisualReviewStatus | null>(null);
  const [optimisticSkipVisual, setOptimisticSkipVisual] = useState<
    boolean | null
  >(null);
  const [isRunningVisual, setIsRunningVisual] = useState(false);
  const [updateLog, setUpdateLog] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResultData | null>(null);
  const [showDistribution, setShowDistribution] = useState(false);
  /** Bumped after a Playwright visual run so we reload sidecar artifacts. */
  const [diffEpoch, setDiffEpoch] = useState(0);
  const [runProgress, setRunProgress] = useState<VisualRunProgress | null>(
    null,
  );
  const [baselineJob, setBaselineJob] = useState<VisualCreateProgress | null>(
    null,
  );
  const isCreating = Boolean(
    baselineJob?.running && baselineJob.kind === "create",
  );
  const isUpdating = Boolean(
    baselineJob?.running && baselineJob.kind === "update",
  );
  const isRebuilding = Boolean(
    baselineJob?.running && baselineJob.kind === "rebuild",
  );
  const isInteractionJob = Boolean(
    baselineJob?.running && baselineJob.kind === "interaction",
  );
  const createProgress = baselineJob?.kind === "create" ? baselineJob : null;
  const isSplit = isSplitPlacement(placement);
  const busy =
    isDiffing ||
    isUpdating ||
    isCreating ||
    isRebuilding ||
    isInteractionJob ||
    isRunningVisual ||
    runProgress != null ||
    isReviewing ||
    isIniting;
  const storyEntry = storyId ? api.getData(storyId) : undefined;
  const storyTagsKey = (storyEntry?.tags ?? []).join("\0");
  const reviewFromStory = visualReviewStatusFromTags(storyEntry?.tags);
  const reviewStatus = optimisticReview ?? reviewFromStory;
  const skipFromStory = (storyEntry?.tags ?? []).includes(SKIP_VISUAL_TAG);
  const skipVisual = optimisticSkipVisual ?? skipFromStory;

  useEffect(() => {
    setOptimisticReview(null);
    setOptimisticSkipVisual(null);
    setSelectedInteractionId(null);
    setExpandedId("default");
    setShowDistribution(false);
  }, [storyId, storyTagsKey]);

  useEffect(() => {
    if (diffEngine !== "chromium") return;
    let cancelled = false;
    void fetchVisualConfig()
      .then((config) => {
        if (cancelled) return;
        setPlaywrightPassThresholdPercent(
          config.playwrightPassThresholdPercent,
        );
      })
      .catch(() => {
        if (!cancelled) setPlaywrightPassThresholdPercent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [diffEngine]);

  const playwrightThresholdMismatch =
    diffEngine === "chromium" &&
    playwrightPassThresholdPercent != null &&
    Math.abs(playwrightPassThresholdPercent - passThresholdPercent) > 1e-6;

  const handleUpdatePlaywrightThreshold = useCallback(async () => {
    setIsUpdatingPlaywrightThreshold(true);
    try {
      const result = await postPlaywrightPassThreshold(passThresholdPercent);
      setPlaywrightPassThresholdPercent(result.playwrightPassThresholdPercent);
      setUpdateLog(
        `Playwright config: pass threshold ${result.playwrightPassThresholdPercent}%`,
      );
    } catch (error) {
      setCaptureError(
        error instanceof Error
          ? error.message
          : "Failed to update Playwright threshold",
      );
    } finally {
      setIsUpdatingPlaywrightThreshold(false);
    }
  }, [passThresholdPercent]);

  /** Copy package Playwright thresh into local Diff Chromium localStorage. */
  const handleResetLocalThresholdToPlaywright = useCallback(() => {
    if (playwrightPassThresholdPercent == null) return;
    setPassThresholdPercent("chromium", playwrightPassThresholdPercent);
    setUpdateLog(
      `Local thresh reset to Playwright ${playwrightPassThresholdPercent}%`,
    );
  }, [playwrightPassThresholdPercent, setPassThresholdPercent]);

  const activeSectionId: BaselineSectionId = selectedInteractionId ?? "default";
  const activeDiffMeta = useMemo(() => {
    if (!diffResult) return null;
    const threshold = diffResult.passThresholdPercent ?? 0.1;
    return {
      status: diffResult.passed ? ("pass" as const) : ("fail" as const),
      stats: `${diffResult.diffPercent.toFixed(4)}% · ${diffResult.diffPixels}/${diffResult.totalPixels} px · <${threshold}%`,
    };
  }, [diffResult]);

  const baselineSections = useMemo((): BaselineSection[] => {
    const sections: BaselineSection[] = [];
    if (primaryImages.length > 0) {
      const isActive = activeSectionId === "default";
      sections.push({
        id: "default",
        label: "Default",
        hint: "End of play · primary baseline",
        thumbSrc: primaryImages[0]?.src,
        status: isActive ? activeDiffMeta?.status : null,
        stats: isActive ? activeDiffMeta?.stats : null,
      });
    }
    for (const step of interactionSteps) {
      const wired = interactions.find((item) => item.id === step.stepId);
      const isActive = activeSectionId === step.stepId;
      sections.push({
        id: step.stepId,
        label: step.label,
        hint: wired
          ? `Baseline wired · ${step.stepId}`
          : `No baseline yet · ${step.stepId}`,
        thumbSrc: wired?.src,
        step,
        wired,
        status: isActive ? activeDiffMeta?.status : null,
        stats: isActive ? activeDiffMeta?.stats : null,
      });
    }
    return sections;
  }, [
    activeDiffMeta,
    activeSectionId,
    interactionSteps,
    interactions,
    primaryImages,
  ]);

  const selectSection = useCallback(
    (id: BaselineSectionId) => {
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(id);
      if (id === "default") {
        const alreadyDefault = parkedStepRef.current === null;
        setSelectedInteractionId(null);
        restorePrimaryBaselines();
        // Skip END remount when we're already on the primary end-of-play park.
        if (storyId && !alreadyDefault) {
          parkedStepRef.current = null;
          endPlayDebug(storyId);
        }
        return;
      }
      if (!storyId) return;
      const step = interactionSteps.find((item) => item.stepId === id);
      if (!step) return;
      setSelectedInteractionId(step.stepId);
      // Pin the interaction baseline before GOTO remount so INIT_IMAGE keeps it.
      const wired = interactions.find((item) => item.id === step.stepId);
      if (wired) {
        selectInteractionBaseline(wired.src);
      }
      // Already parked here — expand UI only; avoid FORCE_REMOUNT / GOTO flicker.
      if (parkedStepRef.current === step.stepId) {
        return;
      }
      parkedStepRef.current = step.stepId;
      // Prefer GOTO when we have a callId (single remount); otherwise FORCE_REMOUNT.
      const callId =
        step.callId || lookupPlayStepCallId(storyId, step.stepId) || "";
      if (callId) {
        setPlayParkTarget(storyId, step.stepId);
        gotoPlayStep(storyId, callId);
      } else {
        runUntilStep(storyId, step.stepId);
      }
      // Remount/GOTO tears down the preview overlay decorator — re-pin after
      // the new canvas attaches (and again after play parks).
      clearPinTimers();
      if (wired) {
        for (const delay of [400, 1000]) {
          pinTimersRef.current.push(
            window.setTimeout(() => {
              selectInteractionBaseline(wired.src);
            }, delay),
          );
        }
      }
    },
    [
      clearPinTimers,
      expandedId,
      interactionSteps,
      interactions,
      restorePrimaryBaselines,
      selectInteractionBaseline,
      storyId,
    ],
  );

  const handleCreateInteraction = useCallback(
    async (step: PlayStepInfo, overwrite: boolean) => {
      if (!storyId) {
        setCaptureError("No story selected");
        return;
      }
      setCaptureError(null);
      setUpdateLog(null);
      try {
        await postVisualInteractionBaseline({
          storyId,
          stepLabel: step.label,
          stepId: step.stepId,
          overwrite,
        });
        const bust = `t=${Date.now()}`;
        // Prefer URL from on-disk convention; CSF HMR may lag.
        const entry = api.getData(storyId);
        const primary = baselineUrlForStoryRef(
          {
            id: storyId,
            importPath:
              entry && "importPath" in entry
                ? String(entry.importPath)
                : undefined,
            tags: entry?.tags,
          },
          { allowSkipVisual: true },
        );
        const src = primary
          ? primary.replace(
              /-chromium-darwin\.png$/i,
              `--${step.stepId}-chromium-darwin.png`,
            )
          : undefined;
        if (src) {
          const nextInteractions = [
            ...interactions.filter((item) => item.id !== step.stepId),
            { id: step.stepId, label: step.label, src },
          ];
          hydrateInteractions(nextInteractions);
          selectInteractionBaseline(`${src}?${bust}`);
          setSelectedInteractionId(step.stepId);
          setExpandedId(step.stepId);
          setDiffEpoch((n) => n + 1);
        }
        revealCenteredOverlay();
      } catch (error) {
        setCaptureError(
          error instanceof Error
            ? error.message
            : "Interaction baseline failed",
        );
      }
    },
    [
      api,
      hydrateInteractions,
      interactions,
      revealCenteredOverlay,
      selectInteractionBaseline,
      storyId,
    ],
  );

  // Soft-hide may clear the preview attach while keeping gallery selection.
  // Fall back to the first baseline so DiffResult / Diff still have a stem.
  const selectedBaselineIndex =
    index >= 0 ? index : images.length > 0 ? 0 : -1;
  const baselineSrc = images[selectedBaselineIndex]?.src;
  const baselineStem = baselineSrc?.split("?")[0] ?? "";
  /** True for panel-initiated runs and sidebar / Testing Module runs. */
  const runInFlight = isRunningVisual || runProgress != null;
  const runProgressLabel = runInFlight
    ? formatVisualProgressLabel(runProgress)
    : null;
  const statusRunning =
    loading ||
    isCreating ||
    isUpdating ||
    isRebuilding ||
    isInteractionJob ||
    runInFlight ||
    isDiffing;
  const statusLabel = loading
    ? "Loading…"
    : isDiffing
      ? (diffProgressLabel ?? "Diffing…")
      : statusRunning
        ? runInFlight
          ? runProgressLabel
          : (baselineJob?.label ?? null)
        : null;

  useEffect(() => {
    setCaptureError(null);
    if (!baselineStem) {
      setDiffResult(null);
      return;
    }
    // Prefer cached compare for this stem (accordion switches). Cache miss
    // clears once; cache-bust query changes alone never wipe the view.
    const cached = diffResultCacheRef.current.get(baselineStem);
    if (cached !== undefined) {
      setDiffResult(cached);
    } else {
      setDiffResult(null);
    }
    let cancelled = false;
    void loadPlaywrightDiffResult(baselineStem, diffEpoch || Date.now())
      .then((result) => {
        if (cancelled) return;
        if (result) {
          diffResultCacheRef.current.set(baselineStem, result);
          setDiffResult(result);
          return;
        }
        // Missing on-disk artifacts must not wipe a live Diff still cached.
        const existing = diffResultCacheRef.current.get(baselineStem);
        if (existing) {
          setDiffResult(existing);
          return;
        }
        // Do not cache null — Playwright may write sidecars moments later, and
        // a poisoned null entry would skip a successful hydrate after reload.
        setDiffResult(null);
      })
      .catch(() => {
        if (cancelled) return;
        const existing = diffResultCacheRef.current.get(baselineStem);
        if (existing) {
          setDiffResult(existing);
          return;
        }
        setDiffResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [storyId, index, baselineStem, diffEpoch]);

  // Fresh visual-run artifacts invalidate the per-baseline cache.
  useEffect(() => {
    if (!diffEpoch) return;
    diffResultCacheRef.current.clear();
  }, [diffEpoch]);

  // Live progress + reload compare view when a visual run finishes.
  // Also drives the status bar for sidebar / Testing Module runs.
  useEffect(() => {
    let sawProgress = false;
    return subscribeVisualRunProgress((next) => {
      setRunProgress(next);
      if (next) {
        sawProgress = true;
        setCaptureError(null);
        setUpdateLog((prev) => appendVisualRunLogLine(prev, next));
        return;
      }
      if (sawProgress) {
        sawProgress = false;
        setDiffEpoch(Date.now());
      }
    });
  }, []);

  // Finished-run summary + log tail (sidebar and panel share this channel).
  useEffect(() => {
    return subscribeVisualLastRun((last) => {
      if (!last) return;
      const summaryLine = last.error
        ? `Visual: ${last.error}${last.scope ? ` (${last.scope})` : ""}`
        : last.summary.failed > 0
          ? `Visual: ${last.summary.failed} failed · ${last.summary.passed} passed${last.scope ? ` (${last.scope})` : ""}`
          : `Visual: ${last.summary.passed} passed${last.scope ? ` (${last.scope})` : ""}`;
      const logTail = last.logTail?.trim();
      setUpdateLog(logTail ? `${logTail}\n${summaryLine}` : summaryLine);
      if (last.error) {
        setCaptureError(last.error);
      }
    });
  }, []);

  // Create/update baseline progress — stream logs; on success show center overlay.
  useEffect(() => {
    let wasRunning = false;
    return subscribeVisualCreateProgress((next) => {
      setBaselineJob(next);
      if (next?.running) {
        wasRunning = true;
        setCaptureError(null);
        setUpdateLog(next.logTail ?? null);
        return;
      }
      if (!wasRunning || !next) return;
      wasRunning = false;
      if (next.logTail) setUpdateLog(next.logTail);
      if (next.error) {
        setCaptureError(next.error);
        return;
      }
      // Rebuild-static only refreshes storybook-static — no baseline hydrate.
      if (next.kind === "rebuild") return;
      // CSF may already be wired (no HMR) or index tags still say skip-visual —
      // hydrate from the known PNG path so the empty-state panel fills.
      const entry = currentStoryId ? api.getData(currentStoryId) : undefined;
      const url = baselineUrlForStoryRef(
        {
          id: currentStoryId,
          importPath: entry?.importPath,
          tags: entry?.tags,
        },
        { allowSkipVisual: next.kind === "create" },
      );
      if (url) {
        // Prefer hydrate over remount: remount can re-emit INIT_IMAGE with
        // stale empty parameters before CSF HMR lands and wipe the gallery.
        hydrateBaselineImages([url]);
      } else {
        revealCenteredOverlay();
      }
      setDiffResult(null);
      setDiffEpoch(Date.now());
    });
  }, [api, currentStoryId, hydrateBaselineImages, revealCenteredOverlay]);

  const handleDiff = useCallback(
    async (engine: DiffCaptureEngine = "html") => {
      const diffIndex = index >= 0 ? index : images.length > 0 ? 0 : -1;
      if (diffIndex === -1 || !images[diffIndex]) {
        setCaptureError("Please select a baseline image first");
        return;
      }
      if (!storyId && engine === "chromium") {
        setCaptureError("No story selected for Chromium Diff");
        return;
      }
      diffAbortRef.current?.abort();
      const abort = new AbortController();
      diffAbortRef.current = abort;
      setIsDiffing(true);
      setDiffProgressLabel(
        engine === "chromium" ? "Starting Chromium…" : "Diffing…",
      );
      setCaptureError(null);
      setDiffResult(null);
      try {
        const selectedImage = images[diffIndex];
        // Soft-hide clears the preview overlay attach — load from gallery src.
        const currentOverlayInfo = await getOverlayInfo().catch(() => null);
        const baselineSrcForDiff =
          currentOverlayInfo?.image?.src ?? selectedImage.src;
        if (!baselineSrcForDiff) {
          throw new Error(
            "Unable to get baseline image; make sure an image is selected",
          );
        }
        const baseline = await loadImage(baselineSrcForDiff);
        let actual: Awaited<ReturnType<typeof loadImage>>;
        let captureTag: string;

        if (engine === "chromium") {
          const capture = await postChromiumSubjectCapture(
            {
              storyId: storyId!,
              visualCaptureUntil: selectedInteractionId ?? undefined,
              viewport: viewportForImage(selectedImage),
              deviceScaleFactor: deviceScaleFactorForImage(selectedImage),
              delay,
              ignoreSelectors: resolveIgnoreSelectors(ignoreSelectors),
              cropToViewport,
            },
            {
              signal: abort.signal,
              onProgress: (progress) => {
                setDiffProgressLabel(progress.label);
              },
            },
          );
          if (abort.signal.aborted) return;
          setDiffProgressLabel("Comparing…");
          actual = await loadImage(capture.dataUrl);
          captureTag = "chromium";
        } else {
          const overlayHidden = waitForOverlayHidden();
          hideOverlay();
          await overlayHidden;
          let capture: Awaited<ReturnType<typeof capturePreviewSubject>>;
          try {
            capture = await withPlaywrightPreviewViewport(
              () =>
                capturePreviewSubject({
                  pixelRatio: deviceScaleFactorForImage(selectedImage),
                  delay,
                  ignoreSelectors: resolveIgnoreSelectors(ignoreSelectors),
                  cropToViewport,
                }),
              viewportForImage(selectedImage),
            );
          } finally {
            showOverlay();
          }
          if (abort.signal.aborted) return;
          setDiffProgressLabel("Comparing…");
          actual = await loadImage(capture.dataUrl);
          captureTag = "html-to-image";
        }

        const width = baseline.width;
        const height = baseline.height;
        const baselineData = baseline.imageData.data;
        const actualData = fitImageData(actual.imageData, width, height);
        const sizeCore =
          actual.width === width && actual.height === height
            ? `${width}×${height}`
            : `baseline ${width}×${height}, actual ${actual.width}×${actual.height} (padded/cropped)`;
        const sizeNote = `${captureTag} · ${sizeCore}`;
        const { baselineForDiff, actualForDiff, ignore } =
          maskTransparentRegions(baselineData, actualData, width, height);
        const actualMaskedCanvas = document.createElement("canvas");
        actualMaskedCanvas.width = width;
        actualMaskedCanvas.height = height;
        const actualMaskedCtx = actualMaskedCanvas.getContext("2d");
        if (!actualMaskedCtx) throw new Error("Unable to get canvas context");
        const actualMaskedImageData = actualMaskedCtx.createImageData(
          width,
          height,
        );
        actualMaskedImageData.data.set(actualData);
        for (let p = 0; p < width * height; p++) {
          if (!ignore[p]) continue;
          const i = p * 4;
          actualMaskedImageData.data[i] = 0;
          actualMaskedImageData.data[i + 1] = 0;
          actualMaskedImageData.data[i + 2] = 0;
          actualMaskedImageData.data[i + 3] = 0;
        }
        actualMaskedCtx.putImageData(actualMaskedImageData, 0, 0);
        const actualMaskedDataUrl = actualMaskedCanvas.toDataURL("image/png");
        const diffData = new Uint8ClampedArray(width * height * 4);
        const diffPixels = pixelmatch(
          actualForDiff,
          baselineForDiff,
          diffData,
          width,
          height,
          {
            threshold: diffThreshold ?? DEFAULT_DIFF_THRESHOLD,
            includeAA: diffIncludeAntiAliasing,
            alpha: 0.1,
            diffColor: [255, 0, 0],
            diffColorAlt: [0, 255, 0],
          },
        );
        const diffCanvas = document.createElement("canvas");
        diffCanvas.width = width;
        diffCanvas.height = height;
        const ctx = diffCanvas.getContext("2d");
        if (!ctx) throw new Error("Unable to get canvas context");
        const diffImageData = ctx.createImageData(width, height);
        diffImageData.data.set(diffData);
        ctx.putImageData(diffImageData, 0, 0);
        const { focusDataUrl, changeBounds } = buildFocusAssets(
          actualMaskedImageData.data,
          diffData,
          width,
          height,
        );
        const diffHistogram = buildDiffHistogram(
          baselineForDiff,
          actualForDiff,
          diffData,
          width,
          height,
        );
        const totalPixels = width * height;
        const diffPercent = (diffPixels / totalPixels) * 100;
        const threshold =
          passThresholdPercent ?? DEFAULT_PASS_THRESHOLD_PERCENT;
        const passed = diffPercent < threshold;
        const nextResult = {
          actualImage: actualMaskedDataUrl,
          diffImage: diffCanvas.toDataURL("image/png"),
          baselineImage: baseline.dataUrl,
          focusImage: focusDataUrl,
          changeBounds,
          imageWidth: width,
          imageHeight: height,
          diffPixels,
          totalPixels,
          diffPercent,
          passThresholdPercent: threshold,
          passed,
          sizeNote,
          diffHistogram,
        };
        // Cache under the gallery stem so soft-hide / reload effects keep DiffResult.
        const stemKey =
          (baselineSrcForDiff.split("?")[0] ||
            selectedImage.src.split("?")[0]) ??
          "";
        if (stemKey) {
          diffResultCacheRef.current.set(stemKey, nextResult);
        }
        setDiffResult(nextResult);
        if (storyId) {
          applyVisualStatuses([
            visualResultFromLiveDiff({
              storyId,
              diffPercent,
              diffPixels,
              totalPixels,
              passThresholdPercent: threshold,
              passed,
            }),
          ]);
        }
      } catch (error) {
        if (abort.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Diff failed";
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        if (/aborted|abort/i.test(message)) return;
        setCaptureError(message);
      } finally {
        if (diffAbortRef.current === abort) {
          diffAbortRef.current = null;
        }
        setIsDiffing(false);
        setDiffProgressLabel(null);
      }
    },
    [
      applyVisualStatuses,
      cropToViewport,
      delay,
      diffIncludeAntiAliasing,
      diffThreshold,
      getOverlayInfo,
      hideOverlay,
      ignoreSelectors,
      images,
      index,
      passThresholdPercent,
      selectedInteractionId,
      showOverlay,
      storyId,
      waitForOverlayHidden,
    ],
  );

  const handleStopDiff = useCallback(() => {
    diffAbortRef.current?.abort();
    diffAbortRef.current = null;
    setIsDiffing(false);
    setDiffProgressLabel(null);
  }, []);

  const handleUpdateBaselines = useCallback(async () => {
    if (!storyId) {
      setCaptureError("No story selected");
      return;
    }
    setCaptureError(null);
    setUpdateLog(null);
    try {
      await postVisualUpdateBaseline({
        storyId,
        rebuild: loadRebuildStaticEnabled(),
      });
    } catch {
      // Error/log surface via subscribeVisualCreateProgress.
    }
  }, [storyId]);

  const handleRebuildStatic = useCallback(async () => {
    setCaptureError(null);
    setUpdateLog(null);
    try {
      await postVisualRebuildStatic();
    } catch {
      // Error/log surface via subscribeVisualCreateProgress.
    }
  }, []);

  const handleCreateBaselines = useCallback(async () => {
    if (!storyId) {
      setCaptureError("No story selected");
      return;
    }
    setCaptureError(null);
    setUpdateLog(null);
    try {
      await postVisualCreateBaseline({
        storyId,
        rebuild: loadRebuildStaticEnabled(),
      });
    } catch {
      // Error/log surface via subscribeVisualCreateProgress.
    }
  }, [storyId]);

  const refreshOnboarding = useCallback(async () => {
    try {
      const config = await fetchVisualConfig();
      setOnboardingReady(config.onboarding.ready);
      setOnboardingHint(config.onboarding.hint);
    } catch {
      setOnboardingReady(null);
      setOnboardingHint(null);
    }
  }, []);

  const handleInitScaffold = useCallback(async () => {
    setIsIniting(true);
    setCaptureError(null);
    try {
      const result = await postVisualInit();
      setOnboardingReady(result.onboarding.ready);
      setOnboardingHint(result.onboarding.hint);
      const wrote = result.written.length
        ? `Wrote ${result.written.join(", ")}.`
        : "Scaffold files already present.";
      setUpdateLog(
        `${wrote} ${result.onboarding.ready ? "You can Create visual now." : result.onboarding.hint}`,
      );
    } catch (error) {
      setCaptureError(
        error instanceof Error ? error.message : "Visual Delta init failed",
      );
    } finally {
      setIsIniting(false);
    }
  }, []);

  const handleSetReviewStatus = useCallback(
    async (status: VisualReviewStatus) => {
      if (!storyId) {
        setCaptureError("No story selected");
        return;
      }
      setIsReviewing(true);
      setCaptureError(null);
      try {
        await postVisualReviewStatus({ storyId, status });
        setOptimisticReview(status);
        const messages: Record<VisualReviewStatus, string> = {
          pending: "Marked baseline as pending review (visual-pending).",
          approved: "Marked baseline as approved (visual-approved).",
          ready: "Marked baseline ready for review (visual-ready).",
          failed: "Marked baseline as failed (visual-failed).",
        };
        setUpdateLog(messages[status]);
      } catch (error) {
        setCaptureError(
          error instanceof Error
            ? error.message
            : "Failed to update review status",
        );
      } finally {
        setIsReviewing(false);
      }
    },
    [storyId],
  );

  const handleAcceptScope = useCallback(
    async (scope: AcceptScope) => {
      if (!storyId) {
        setCaptureError("No story selected");
        return;
      }
      setIsReviewing(true);
      setCaptureError(null);
      try {
        const ids =
          scope === "component"
            ? componentStoryIdsFor(api, storyId)
            : [storyId];
        for (const id of ids) {
          await postVisualReviewStatus({ storyId: id, status: "approved" });
        }
        setOptimisticReview("approved");
        setUpdateLog(
          scope === "component"
            ? `Accepted ${ids.length} stor${ids.length === 1 ? "y" : "ies"} (visual-approved).`
            : "Accepted story baseline (visual-approved).",
        );
      } catch (error) {
        setCaptureError(
          error instanceof Error ? error.message : "Accept failed",
        );
      } finally {
        setIsReviewing(false);
      }
    },
    [api, storyId],
  );

  const handleUnacceptScope = useCallback(
    async (scope: AcceptScope) => {
      if (!storyId) {
        setCaptureError("No story selected");
        return;
      }
      setIsReviewing(true);
      setCaptureError(null);
      try {
        const ids =
          scope === "component"
            ? componentStoryIdsFor(api, storyId)
            : [storyId];
        for (const id of ids) {
          await postVisualReviewStatus({ storyId: id, status: "pending" });
        }
        setOptimisticReview("pending");
        setUpdateLog(
          scope === "component"
            ? `Unaccepted ${ids.length} stor${ids.length === 1 ? "y" : "ies"} (visual-pending).`
            : "Unaccepted story baseline (visual-pending).",
        );
      } catch (error) {
        setCaptureError(
          error instanceof Error ? error.message : "Unaccept failed",
        );
      } finally {
        setIsReviewing(false);
      }
    },
    [api, storyId],
  );

  const handleModeChange = useCallback(
    (mode: string | null) => {
      setSelectedMode(mode);
      if (mode == null) return;
      const globals = modes[mode]?.globals;
      if (globals && typeof api.updateGlobals === "function") {
        api.updateGlobals(globals);
      }
    },
    [api, modes, setSelectedMode],
  );

  const handleToggleSkipVisual = useCallback(async () => {
    if (!storyId) {
      setCaptureError("No story selected");
      return;
    }
    const nextSkip = !skipVisual;
    setIsReviewing(true);
    setCaptureError(null);
    try {
      await postVisualSkipVisual({ storyId, skip: nextSkip });
      setOptimisticSkipVisual(nextSkip);
      if (nextSkip) setOptimisticReview(null);
      setUpdateLog(
        nextSkip
          ? "Added skip-visual — excluded from Playwright visual runs."
          : "Removed skip-visual — story is included in visual runs.",
      );
    } catch (error) {
      setCaptureError(
        error instanceof Error ? error.message : "Failed to update skip-visual",
      );
    } finally {
      setIsReviewing(false);
    }
  }, [skipVisual, storyId]);

  const handleRunVisual = useCallback(
    async (scope: "story" | "component" | "all") => {
      if (scope !== "all" && !storyId) {
        setCaptureError("No story selected");
        return;
      }
      setIsRunningVisual(true);
      setCaptureError(null);
      try {
        const storyIds =
          scope === "all"
            ? undefined
            : visualRunnableStoryIds(
                api,
                scope === "story"
                  ? [storyId!]
                  : componentStoryIdsFor(api, storyId!),
              );
        if (scope !== "all" && !storyIds?.length) {
          throw new Error(
            "No runnable visual stories in this scope (all skip-visual)",
          );
        }
        await testProviderStore.runWithState(async () => {
          if (storyIds?.length) {
            applyPendingVisualStatuses(storyIds);
          } else {
            clearVisualStatuses();
          }
          const data = await postVisualRun({
            storyIds,
            rebuild: loadRebuildStaticEnabled(),
          });
          if (data.crashed) {
            publishVisualLastRun({
              finishedAt: Date.now(),
              summary: data.summary,
              error: data.error ?? "Visual test run crashed",
              scope,
              logTail: data.logTail,
              results: data.results,
            });
            throw new Error(data.error ?? "Visual test run crashed");
          }
          applyVisualRunResults(storyIds, data.results);
          publishVisualLastRun({
            finishedAt: Date.now(),
            summary: data.summary,
            error:
              data.summary.failed > 0
                ? `${data.summary.failed} failed`
                : undefined,
            scope,
            logTail: data.logTail,
            results: data.results,
          });
          setDiffEpoch(Date.now());
          if (data.summary.failed > 0) {
            setCaptureError(
              `Visual: ${data.summary.failed} failed · ${data.summary.passed} passed`,
            );
          }
          // Status bar log is set via subscribeVisualLastRun (shared with sidebar).
        });
      } catch (error) {
        setCaptureError(
          error instanceof Error ? error.message : "Visual test run failed",
        );
      } finally {
        setIsRunningVisual(false);
      }
    },
    [api, storyId],
  );

  const handleRun = useCallback(
    (mode: VisualRunMode) => {
      void handleRunVisual(mode);
    },
    [handleRunVisual],
  );

  const isEmpty = primaryImages.length === 0 && images.length === 0;
  const needsScaffold = onboardingReady === false;

  useEffect(() => {
    if (!isEmpty || loading || skipVisual) return;
    void refreshOnboarding();
  }, [isEmpty, loading, skipVisual, refreshOnboarding]);
  const badgeStatus = diffResult
    ? diffResult.passed
      ? ("pass" as const)
      : ("fail" as const)
    : null;

  const renderSectionBody = useCallback(
    (section: BaselineSection) => (
      <>
        <PanelToolbar>
          <ToolbarRow>
            {section.thumbSrc ? (
              <SectionThumbFrame title={section.label}>
                <SectionThumb src={section.thumbSrc} alt="" />
              </SectionThumbFrame>
            ) : null}
            {section.id === "default" &&
            liveVisible &&
            primaryImages.length > 1 ? (
              <ImageGallery
                images={primaryImages}
                selectedIndex={selectedInteractionId ? 0 : Math.max(0, index)}
                onSelect={setIndex}
              />
            ) : null}
            {section.id === "default" ? (
              <ModeSelector
                modeNames={modeNames}
                value={selectedMode}
                onChange={handleModeChange}
                disabled={busy}
              />
            ) : null}
            <LiveVisibilityToggle
              liveVisible={liveVisible}
              onToggle={setLiveVisible}
              disabled={images.length === 0}
            />
            {liveVisible ? (
              <PlacementPad
                value={placement}
                active={overlayOn}
                onToggle={togglePlacement}
                disabled={images.length === 0}
              />
            ) : null}
            {index >= 0 && (!isSplit || !liveVisible) ? (
              <ButtonGroup role="group" aria-label="Overlay controls">
                <ToggleButton
                  size="small"
                  pressed={false}
                  onClick={resetOverlay}
                  ariaLabel={false}
                  title="Reset overlay position after drag"
                >
                  Reset
                </ToggleButton>
              </ButtonGroup>
            ) : null}
            <ToolbarSpacer />
            {liveVisible && index >= 0 && !isSplit ? (
              <>
                <InlineControl title="Overlay opacity">
                  <span>Opacity</span>
                  <Slider
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={opacity}
                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                  />
                  <ValueDisplay>{Math.round(opacity * 100)}%</ValueDisplay>
                </InlineControl>
                <CheckboxContainer>
                  <Checkbox
                    type="checkbox"
                    checked={colorInversion}
                    onChange={(e) => setColorInversion(e.target.checked)}
                  />
                  <span>Blend</span>
                </CheckboxContainer>
              </>
            ) : null}
            <ThreshStack>
              <InlineControl title="Pass if diff % is below this">
                <span>Thresh</span>
                <Slider
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={passThresholdPercent}
                  onChange={(e) =>
                    setPassThresholdPercent(
                      diffEngine,
                      parseFloat(e.target.value),
                    )
                  }
                />
                <ValueDisplay>{passThresholdPercent}%</ValueDisplay>
              </InlineControl>
              {playwrightThresholdMismatch ? (
                <ThreshMismatchNote title="Local Diff Chromium thresh differs from package Playwright default">
                  Playwright {playwrightPassThresholdPercent}% ≠ local{" "}
                  {passThresholdPercent}%
                </ThreshMismatchNote>
              ) : null}
            </ThreshStack>
            {playwrightThresholdMismatch ? (
              <ButtonGroup
                role="group"
                aria-label="Sync pass threshold with Playwright"
              >
                <Button
                  size="small"
                  disabled={isUpdatingPlaywrightThreshold || busy}
                  ariaLabel={false}
                  title="Write local Thresh into package Playwright config"
                  onClick={() => void handleUpdatePlaywrightThreshold()}
                >
                  {isUpdatingPlaywrightThreshold
                    ? "Updating…"
                    : "Update Playwright"}
                </Button>
                <Button
                  size="small"
                  disabled={busy || playwrightPassThresholdPercent == null}
                  ariaLabel="Reset local thresh to Playwright value"
                  title="Reset local thresh to Playwright value"
                  onClick={handleResetLocalThresholdToPlaywright}
                >
                  <SyncIcon />
                </Button>
              </ButtonGroup>
            ) : null}
          </ToolbarRow>
          {captureError ? <ErrorText>{captureError}</ErrorText> : null}
        </PanelToolbar>
        {diffResult && images.length > 0 ? (
          <DiffResult result={diffResult} showHistogram={showDistribution} />
        ) : null}
      </>
    ),
    [
      busy,
      captureError,
      colorInversion,
      diffEngine,
      diffResult,
      handleModeChange,
      handleResetLocalThresholdToPlaywright,
      handleUpdatePlaywrightThreshold,
      images.length,
      index,
      isSplit,
      isUpdatingPlaywrightThreshold,
      liveVisible,
      modeNames,
      opacity,
      overlayOn,
      passThresholdPercent,
      placement,
      playwrightPassThresholdPercent,
      playwrightThresholdMismatch,
      primaryImages,
      resetOverlay,
      selectedInteractionId,
      selectedMode,
      setColorInversion,
      setIndex,
      setLiveVisible,
      setOpacity,
      setPassThresholdPercent,
      showDistribution,
      togglePlacement,
    ],
  );

  return (
    <AddonPanel active={props.active ?? false}>
      <PanelShell ref={setShellEl}>
        <PanelScroll
          style={
            {
              [VD_HEADER_STICKY_TOP_VAR]: `${headerStickyTop}px`,
            } as React.CSSProperties
          }
        >
          <VisualDeltaHeader
            badgeStatus={loading ? null : badgeStatus}
            empty={loading ? false : isEmpty}
            busy={busy || loading}
            storyMissing={!storyId || loading}
            isDiffing={!loading && isDiffing}
            isRunning={!loading && runInFlight}
            diffProgressLabel={loading ? null : diffProgressLabel}
            runProgressLabel={loading ? null : runProgressLabel}
            createLabel={
              isCreating
                ? (createProgress?.label ?? "Creating…")
                : "Create visual"
            }
            reviewStatus={loading ? null : reviewStatus}
            skipVisual={loading ? false : skipVisual}
            onDiff={(engine) => void handleDiff(engine)}
            onRun={handleRun}
            diffEngine={diffEngine}
            onDiffEngineChange={setDiffEngine}
            onCreate={() => void handleCreateBaselines()}
            onUpdateBaselines={() => void handleUpdateBaselines()}
            onRebuildStatic={() => void handleRebuildStatic()}
            onResetSettings={resetSettings}
            onStopDiff={handleStopDiff}
            onStopRun={() => void cancelVisualRun()}
            onReviewStatus={(status) => void handleSetReviewStatus(status)}
            onAccept={(scope) => void handleAcceptScope(scope)}
            onUnaccept={(scope) => void handleUnacceptScope(scope)}
            onToggleSkipVisual={() => void handleToggleSkipVisual()}
            onOpenConfiguration={() => setShowConfiguration(true)}
            isUpdating={isUpdating}
            isRebuilding={isRebuilding}
            onHeightChange={setHeaderStickyTop}
          />
          <PanelBody>
            {showConfiguration ? (
              <ConfigurationPanel onClose={() => setShowConfiguration(false)} />
            ) : null}
            {!showConfiguration && loading ? (
              <SkeletonRoot
                role="status"
                aria-busy="true"
                aria-label="Loading Visual Delta"
              >
                <SkeletonBone width="100%" height={180} radius={8} />
                <SkeletonBone width="40%" height={12} radius={4} />
              </SkeletonRoot>
            ) : null}
            {!showConfiguration &&
            !loading &&
            isEmpty &&
            baselineSections.length === 0 ? (
              <EmptyTabContent
                title="Visual Delta"
                description={
                  skipVisual
                    ? "This story is tagged skip-visual (excluded from Playwright visual runs). Use Include in visual tests in the header to opt in, then Create visual."
                    : needsScaffold
                      ? (onboardingHint ??
                        "Set up the Playwright suite and config, then create a baseline for this story.")
                      : "Capture a Playwright baseline for this story, then compare live canvas to the PNG with overlay and diff tools. Or Skip visual tests from the header if this story should stay out of the suite."
                }
                footer={
                  needsScaffold && !skipVisual ? (
                    <Button
                      size="small"
                      ariaLabel="Set up Visual Delta Playwright suite"
                      disabled={busy}
                      onClick={() => void handleInitScaffold()}
                    >
                      {isIniting ? "Setting up…" : "Set up Visual Delta"}
                    </Button>
                  ) : skipVisual ? (
                    <Button
                      size="small"
                      ariaLabel="Include in visual tests"
                      disabled={!storyId || busy}
                      onClick={() => void handleToggleSkipVisual()}
                    >
                      Include in visual tests
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      ariaLabel="Create visual baseline"
                      disabled={!storyId || busy}
                      onClick={() => void handleCreateBaselines()}
                    >
                      {isCreating
                        ? (createProgress?.label ?? "Creating…")
                        : "Create visual"}
                    </Button>
                  )
                }
              />
            ) : null}
            {!showConfiguration &&
            !loading &&
            !(isEmpty && baselineSections.length === 0) ? (
              <BaselineAccordion
                sections={baselineSections}
                expandedId={expandedId}
                busy={busy}
                showDistribution={showDistribution}
                onExpand={selectSection}
                onCreate={(step) => void handleCreateInteraction(step, false)}
                onUpdate={(step) => void handleCreateInteraction(step, true)}
                onUpdateDefault={() => void handleUpdateBaselines()}
                onToggleDistribution={() =>
                  setShowDistribution((value) => !value)
                }
                renderBody={renderSectionBody}
              />
            ) : null}
          </PanelBody>
        </PanelScroll>
        <PanelStatusBar
          container={shellEl}
          running={statusRunning}
          label={statusLabel}
          log={updateLog}
          error={captureError}
        />
      </PanelShell>
    </AddonPanel>
  );
});
