import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button, ToggleButton } from "storybook/internal/components";
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
  PANEL_ID,
  SKIP_VISUAL_TAG,
  TEST_PROVIDER_ID,
  VISUAL_DEVICE_SCALE_FACTOR,
  deviceScaleFactorForImage,
  isSplitPlacement,
  viewportForImage,
  visualReviewStatusFromTags,
  type VisualDeltaImage,
  type VisualDeltaInteraction,
  type VisualDeltaParams,
  type VisualReviewStatus,
} from "../constants.js";
import type { AcceptScope } from "../manager/AcceptSplitButton.js";
import { instrumenterCallIdForInteraction } from "../shared/interaction-capture.js";
import {
  DEFAULT_ADDON_STATE,
  type VisualDeltaAddonState,
} from "../manager/PanelTitle.js";
import {
  abortVisualWork,
  applyPendingVisualStatuses,
  applyVisualRunResults,
  applyVisualStatuses,
  clearVisualStatuses,
  compareExactStory,
  componentStoryIdsFor,
  formatVisualProgressLabel,
  invalidateVisualLastRun,
  fetchVisualConfig,
  loadPersistedVisualLastRun,
  postVisualCreateBaseline,
  postVisualDeleteBaseline,
  postVisualInit,
  postVisualInteractionBaseline,
  postVisualRebuildStatic,
  postVisualReviewStatus,
  postVisualReviewStatuses,
  postVisualRun,
  postVisualSkipVisual,
  postVisualUpdateBaseline,
  acceptableStoryIdsFromLastRun,
  publishVisualLastRun,
  rejectableStoryIdsFromLastRun,
  subscribeVisualCreateProgress,
  subscribeVisualLastRun,
  subscribeVisualRunProgress,
  visualCreateProgressAppliesToStory,
  visualRunnableStoryIds,
  type VisualCreateProgress,
  type VisualLastRunSummary,
  type VisualRunProgress,
} from "../manager/run-visual.js";
import {
  loadDiffCaptureEngine,
  type DiffCaptureEngine,
} from "../manager/DiffCaptureSplitButton.js";
import type { VisualRunMode } from "../manager/VisualRunSplitButton.js";
import {
  appendStatusLogChunk,
  appendVisualRunLogLine,
} from "../shared/status-log.js";
import type { DiffResultData } from "../types.js";
import {
  capturePreviewSubject,
  loadImage,
  withVerifiedPreviewViewport,
} from "./capture.js";
import { compareLoadedImages } from "./image-comparison.js";
import { DiffResult } from "./DiffResult.js";
import { useOverlayHidden, useOverlayInfo, useStoryData } from "./hooks.js";
import { loadPlaywrightDiffResult } from "./load-playwright-diff.js";
import {
  BaselineAccordion,
  SectionThumb,
  SectionThumbFrame,
  type BaselineSection,
  type BaselineSectionId,
} from "./BaselineAccordion.js";
import { LiveVisibilityToggle } from "./LiveVisibilityToggle.js";
import { PanelView, type PanelViewEmptyState } from "./PanelView.js";
import {
  PanelResultSummary,
  type PanelResultState,
} from "./PanelResultSummary.js";
import { PlacementPad } from "./PlacementPad.js";
import { CompareZoomControl } from "./CompareZoomControl.js";
import { ImageLightbox, type LightboxImage } from "./ImageLightbox.js";
import { RangeNumberInput } from "./RangeNumberInput.js";
import {
  BaselineGeometryUnavailable,
  BaselineAlignmentWarning,
  BaselineGeometryWarning,
} from "./BaselineGeometryWarning.js";
import { ConfigurationPanel } from "./ConfigurationPanel.js";
import { ChangeSetOutcomeNotice, ChangeSetsView } from "./ChangeSetsView.js";
import { ModeSelector } from "./ModeSelector.js";
import { baselineUrlForStoryRef } from "../shared/baseline-url.js";
import { resolveIgnoreSelectors } from "../shared/ignore.js";
import { BUILTIN_VISUAL_DELTA_DEFAULTS } from "../shared/project-defaults.js";
import { resolveVisualDeltaImages } from "../preview/normalize.js";
import {
  aggregateModeResultStatus,
  type VisualModeResultStatus,
} from "../shared/mode-results.js";
import {
  endPlayDebug,
  gotoPlayStep,
  lookupPlayStepCallId,
  mergeInteractionRows,
  remountStory,
  runUntilStep,
  setPlayParkTarget,
  usePlaySteps,
  type PlayStepInfo,
} from "./usePlaySteps.js";
import { baselinePathFromPublicUrl } from "../shared/baseline-history.js";
import {
  BaselineHistoryView,
  type BaselineHistoryTarget,
} from "./BaselineHistoryView.js";
import {
  ButtonGroup,
  Checkbox,
  CheckboxContainer,
  ErrorText,
  InlineControl,
  ThreshStack,
  Toolbar as PanelToolbar,
  ToolbarRow,
  ToolbarSpacer,
} from "./styled.js";
import {
  fetchVisualDeltaChangeSets,
  type VisualDeltaChangeSetMutation,
} from "../shared/change-sets.js";
import { VISUAL_DELTA_CHANGES_EVENT } from "../shared/change-events.js";
import { baselineAvailability as resolveBaselineAvailability } from "../shared/baseline-readiness.js";
import {
  baselineSourceStem,
  verifyBaselineSources,
} from "./baseline-source-availability.js";
import { resolveCapabilitiesFromEnvironment } from "../shared/capabilities.js";
import type { VisualDeltaResolvedConfig } from "../shared/config-types.js";
import { CANONICAL_VISUAL_CAPTURE_PROFILE } from "../shared/capture-profile.js";
import {
  isVisualDeltaBrowser,
  type VisualBaselineEnvironment,
  type VisualDeltaBrowser,
} from "../shared/environments.js";
import {
  baselineSourcesAllowMutation,
  discoverVisualEnvironments,
  loadVisualEnvironmentPreference,
  saveVisualEnvironmentPreference,
  sourceMatchesEnvironment,
} from "./environment-selection.js";

const testProviderStore = experimental_getTestProviderStore(TEST_PROVIDER_ID);
const panelCapabilities = resolveCapabilitiesFromEnvironment();

function baselineLightboxCssSize(
  source: VisualDeltaImage | undefined,
  thumbnail: HTMLImageElement | null,
): { width: number; height: number } {
  const scale = deviceScaleFactorForImage(source);
  if (
    thumbnail &&
    Number.isFinite(thumbnail.naturalWidth) &&
    thumbnail.naturalWidth > 0 &&
    Number.isFinite(thumbnail.naturalHeight) &&
    thumbnail.naturalHeight > 0
  ) {
    return {
      width: thumbnail.naturalWidth / scale,
      height: thumbnail.naturalHeight / scale,
    };
  }
  return viewportForImage(source);
}

function baselineUrlForComparison(source: string | undefined) {
  if (!source) return source;
  const withoutCacheBust = source.split("?")[0] ?? source;
  try {
    const resolved = new URL(withoutCacheBust, window.location.href);
    return resolved.origin === window.location.origin
      ? resolved.pathname
      : resolved.href;
  } catch {
    return withoutCacheBust;
  }
}

function normalizePanelConfig(
  config: VisualDeltaResolvedConfig,
): VisualDeltaResolvedConfig {
  return {
    ...config,
    browsers:
      Array.isArray(config.browsers) && config.browsers.length > 0
        ? config.browsers
        : ["chromium"],
    runtimePlatform: config.runtimePlatform || "linux",
    availableEnvironments: Array.isArray(config.availableEnvironments)
      ? config.availableEnvironments
      : [],
    availableBrowsers: Array.isArray(config.availableBrowsers)
      ? config.availableBrowsers
      : [],
    captureProfile: config.captureProfile ?? CANONICAL_VISUAL_CAPTURE_PROFILE,
    captureRunner: config.captureRunner ?? {
      kind: "docker",
      available: false,
      reason: "The canonical capture profile is not locked.",
    },
  };
}

export const Panel = memo(function Panel(props: { active?: boolean }) {
  const api = useStorybookApi();
  const { storyId: currentStoryId } = useStorybookState();
  const initialEnvironment = useRef(loadVisualEnvironmentPreference());
  const [resolvedConfig, setResolvedConfig] =
    useState<VisualDeltaResolvedConfig | null>(null);
  const [selectedBrowser, setSelectedBrowser] = useState<VisualDeltaBrowser>(
    isVisualDeltaBrowser(initialEnvironment.current.browser)
      ? initialEnvironment.current.browser
      : "chromium",
  );
  const [selectedPlatform, setSelectedPlatform] = useState(
    "linux",
  );
  const [captureError, setCaptureError] = useState<string | null>(null);
  const {
    images: configuredImages,
    interactions: configuredInteractions,
    modes,
    modeNames,
    selectedMode,
    index,
    overlayOn,
    storyId,
    storyName,
    renderGeneration,
    storyFinished,
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
    splitZoom,
    diffResultZoomDefault,
    baselineGeometryMismatch,
    baselineAlignmentMismatch,
    baselineGeometryUnavailable,
    setIndex,
    setOpacity,
    setColorInversion,
    setSplitZoom,
    togglePlacement,
    setLiveVisible,
    setPassThresholdPercent,
    setCapturedActual,
    setSelectedMode,
    hideOverlay,
    showOverlay,
    resetOverlay,
    resetSettings,
    clearBaselineDiagnostics,
    revealCenteredOverlay,
    hydrateBaselineImages,
    removeBaselineImage,
    seedStoryFromManager,
    hydrateInteractions,
    selectInteractionBaseline,
    restorePrimaryBaselines,
    primaryImages: configuredPrimaryImages,
  } = useStoryData(currentStoryId);
  const [unavailableBaselineSources, setUnavailableBaselineSources] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const markBaselineSourceAvailable = useCallback((source: string) => {
    const stem = baselineSourceStem(source);
    setUnavailableBaselineSources((previous) => {
      if (!previous.has(stem)) return previous;
      const next = new Set(previous);
      next.delete(stem);
      return next;
    });
  }, []);
  const images = useMemo(
    () =>
      configuredImages.filter(
        (image) =>
          sourceMatchesEnvironment(
            image.src,
            {
              browser: selectedBrowser,
              platform: selectedPlatform,
            },
            image.environment,
          ) &&
          !unavailableBaselineSources.has(baselineSourceStem(image.src)),
      ),
    [
      configuredImages,
      selectedBrowser,
      selectedPlatform,
      unavailableBaselineSources,
    ],
  );
  const primaryImages = useMemo(
    () =>
      configuredPrimaryImages.filter(
        (image) =>
          sourceMatchesEnvironment(
            image.src,
            {
              browser: selectedBrowser,
              platform: selectedPlatform,
            },
            image.environment,
          ) &&
          !unavailableBaselineSources.has(baselineSourceStem(image.src)),
      ),
    [
      configuredPrimaryImages,
      selectedBrowser,
      selectedPlatform,
      unavailableBaselineSources,
    ],
  );
  const modePreviewSources = useMemo(() => {
    const sources: Record<string, string> = {};
    const defaultImage = primaryImages.find((image) => !image.mode);
    if (defaultImage) sources.Default = defaultImage.src;
    for (const image of primaryImages) {
      if (image.mode) sources[image.mode] = image.src;
    }
    return sources;
  }, [primaryImages]);
  const interactions = useMemo(
    () =>
      configuredInteractions.filter(
        (interaction) =>
          sourceMatchesEnvironment(
            interaction.src,
            {
              browser: selectedBrowser,
              platform: selectedPlatform,
            },
            interaction.environment,
          ) &&
          !unavailableBaselineSources.has(baselineSourceStem(interaction.src)),
      ),
    [
      configuredInteractions,
      selectedBrowser,
      selectedPlatform,
      unavailableBaselineSources,
    ],
  );
  const environmentOptions = useMemo(
    () =>
      discoverVisualEnvironments({
        sources: [
          ...configuredPrimaryImages.map((image) => image.src),
          ...configuredInteractions.map((interaction) => interaction.src),
        ],
        declaredEnvironments: [
          ...configuredPrimaryImages.map((image) => image.environment),
          ...configuredInteractions.map((interaction) => interaction.environment),
        ],
        availableEnvironments: resolvedConfig?.availableEnvironments,
        availableBrowsers: resolvedConfig?.availableBrowsers,
        configuredBrowsers: resolvedConfig?.browsers,
        runtimePlatform: "linux",
      }),
    [configuredInteractions, configuredPrimaryImages, resolvedConfig],
  );
  const environmentMutable = Boolean(
    resolvedConfig &&
      (resolvedConfig.browsers ?? ["chromium"]).includes(selectedBrowser) &&
      resolvedConfig.captureRunner.available,
  );
  const environmentCapabilities = useMemo(
    () => ({
      ...panelCapabilities,
      writes: panelCapabilities.writes && environmentMutable,
      runs: panelCapabilities.runs && environmentMutable,
      browserCompare: panelCapabilities.browserCompare && environmentMutable,
      chromiumCompare: panelCapabilities.chromiumCompare && environmentMutable,
    }),
    [environmentMutable],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchVisualConfig()
      .then((config) => {
        if (cancelled) return;
        const normalized = normalizePanelConfig(config);
        setResolvedConfig(normalized);
        setSelectedPlatform("linux");
      })
      .catch(() => {
        /* static/read-only surfaces retain discovered environment choices */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!resolvedConfig) return;
    if (
      !environmentOptions.browsers.some(
        (option) => option.value === selectedBrowser,
      )
    ) {
      setSelectedBrowser(resolvedConfig.browsers[0] ?? "chromium");
    }
    if (
      !environmentOptions.platforms.some(
        (option) => option.value === selectedPlatform,
      )
    ) {
      setSelectedPlatform("linux");
    }
  }, [
    environmentOptions.browsers,
    environmentOptions.platforms,
    resolvedConfig,
    selectedBrowser,
    selectedPlatform,
  ]);

  useEffect(() => {
    saveVisualEnvironmentPreference({
      browser: selectedBrowser,
      platform: selectedPlatform,
    });
  }, [selectedBrowser, selectedPlatform]);
  const [showConfiguration, setShowConfiguration] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [pendingChangesCount, setPendingChangesCount] = useState(0);
  const [changeSetNotice, setChangeSetNotice] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  /** Preview decorator hasn't sent INIT_IMAGE for this story yet. */
  const storyReady = Boolean(storyId) && storyId === currentStoryId;
  const baselineAvailability = resolveBaselineAvailability({
    currentStoryId,
    preview: {
      storyId,
      renderGeneration,
      storyFinished,
    },
    baselineCount: primaryImages.length + images.length,
  });
  const previewReady = storyReady && storyFinished;
  const previewBusy = !previewReady;
  const loading = baselineAvailability === "unknown";
  const baselineSources = useMemo(
    () => [
      ...new Set([
        ...configuredPrimaryImages.map((image) => image.src),
        ...configuredInteractions.map((interaction) => interaction.src),
      ]),
    ],
    [configuredInteractions, configuredPrimaryImages],
  );
  const baselineSourcesKey = baselineSources.join("\0");
  const hasNonCanonicalTeachingBaseline = !baselineSourcesAllowMutation(
    baselineSources,
  );
  const baselineMutationsAllowed =
    environmentCapabilities.writes && !hasNonCanonicalTeachingBaseline;
  const baselineMutationError = hasNonCanonicalTeachingBaseline
    ? "Story-wired teaching baselines are compare-only and cannot be updated from the panel."
    : "Baselines can only be changed for an enabled browser through an available canonical capture runner.";
  useEffect(() => {
    setUnavailableBaselineSources(new Set());
  }, [currentStoryId]);
  useEffect(() => {
    if (!previewReady || baselineSources.length === 0) return;
    const controller = new AbortController();
    void verifyBaselineSources(baselineSources, {
      signal: controller.signal,
    }).then((availability) => {
      if (controller.signal.aborted) return;
      const missing = new Set(
        [...availability]
          .filter(([, status]) => status === "absent")
          .map(([source]) => source),
      );
      const present = new Set(
        [...availability]
          .filter(([, status]) => status === "present")
          .map(([source]) => source),
      );
      setUnavailableBaselineSources((previous) => {
        const next = new Set(previous);
        for (const source of present) next.delete(source);
        for (const source of missing) next.add(source);
        return next;
      });
      for (const image of configuredPrimaryImages) {
        if (missing.has(baselineSourceStem(image.src))) {
          removeBaselineImage(image.src);
        }
      }
    });
    return () => controller.abort();
  }, [
    baselineSourcesKey,
    configuredInteractions,
    configuredPrimaryImages,
    previewReady,
    removeBaselineImage,
    renderGeneration,
  ]);
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
  const { steps: playSteps, selectedStepId: selectedStorybookInteractionId } =
    usePlaySteps(storyId || undefined);
  const interactionDiscoveryStoryRef = useRef<string | null>(null);
  const interactionSteps = useMemo(
    () => mergeInteractionRows(playSteps, configuredInteractions),
    [configuredInteractions, playSteps],
  );
  const [expandedId, setExpandedId] = useState<BaselineSectionId | null>(
    "default",
  );
  const [selectedInteractionId, setSelectedInteractionId] = useState<
    string | null
  >(null);
  const selectedInteractionStep = useMemo(
    () =>
      selectedInteractionId
        ? interactionSteps.find((step) => step.stepId === selectedInteractionId)
        : undefined,
    [interactionSteps, selectedInteractionId],
  );
  const selectedVisualCaptureCallId = useMemo(
    () =>
      selectedInteractionStep?.captureCallId ??
      (storyId && selectedInteractionId
        ? (instrumenterCallIdForInteraction(storyId, selectedInteractionId) ??
          undefined)
        : undefined),
    [selectedInteractionId, selectedInteractionStep?.captureCallId, storyId],
  );
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

  useEffect(() => {
    restorePrimaryBaselines(primaryImages);
  }, [primaryImages, restorePrimaryBaselines]);

  useEffect(() => {
    parkedStepRef.current = null;
    setSelectedInteractionId(null);
    setExpandedId("default");
  }, [selectedBrowser, selectedPlatform]);

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

  // Storybook's Interactions tab emits GOTO with the exact selected call. Keep
  // that selection when the user switches back to Visual Delta so the matching
  // capture point exposes Create/Update immediately.
  useEffect(() => {
    if (!selectedStorybookInteractionId) return;
    const step = interactionSteps.find(
      (item) => item.stepId === selectedStorybookInteractionId,
    );
    if (!step) return;
    parkedStepRef.current = step.stepId;
    setExpandedId(step.stepId);
    setSelectedInteractionId(step.stepId);
    const wired = interactions.find((item) => item.id === step.stepId);
    if (wired) {
      selectInteractionBaseline(wired.src);
    } else {
      // Keep a Storybook-selected capture point actionable even though the
      // quieter default only lists interactions with existing baselines.
      setShowAllInteractions(true);
    }
  }, [
    interactionSteps,
    interactions,
    selectInteractionBaseline,
    selectedStorybookInteractionId,
  ]);

  // Preview INIT_IMAGE or storyFinished can be missed (panel mounts before
  // iframe, Storybook restart, park remount). Keep requesting until the exact
  // current generation is ready. Manager data may prove a baseline is present,
  // but missing parameters are only a provisional seed.
  useEffect(() => {
    if (previewReady || !currentStoryId) return;
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
      const visualDeltaParams =
        entry && "parameters" in entry
          ? (entry.parameters as { visualDelta?: VisualDeltaParams }).visualDelta
          : undefined;
      const fromConvention = baselineUrlForStoryRef(
        {
          id: currentStoryId,
          importPath:
            entry && "importPath" in entry
              ? String(entry.importPath)
              : undefined,
          tags: entry?.tags,
        },
        {
          allowSkipVisual: true,
          target: { browser: selectedBrowser },
        },
      );
      const projectDefaults =
        resolvedConfig?.projectDefaults ?? BUILTIN_VISUAL_DELTA_DEFAULTS;
      const normalized = resolveVisualDeltaImages(
        visualDeltaParams,
        projectDefaults,
      );
      const imageSet =
        normalized.images.length > 0 || !fromConvention
          ? normalized
          : resolveVisualDeltaImages(
              { ...visualDeltaParams, images: [fromConvention] },
              projectDefaults,
            );
      seedStoryFromManager({
        storyId: currentStoryId,
        storyName,
        images: imageSet.images,
        modes: imageSet.modes,
        modeNames: Object.keys(imageSet.modes),
        previewSplitZoomDefault: projectDefaults.previewSplitZoomDefault,
      });
      const interactions = visualDeltaParams?.interactions;
      if (interactions?.length) {
        const environment = visualDeltaParams?.environment;
        hydrateInteractions(
          interactions.map((interaction) =>
            interaction.environment ?? !environment
              ? interaction
              : {
                  ...interaction,
                  environment,
                },
          ),
        );
      }
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
    previewReady,
    resolvedConfig,
    seedStoryFromManager,
    selectedBrowser,
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
  const [isDeletingBaseline, setIsDeletingBaseline] = useState(false);
  const [updateLog, setUpdateLog] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResultData | null>(null);
  const [showDistribution, setShowDistribution] = useState(false);
  const [showAllInteractions, setShowAllInteractions] = useState(false);
  const [toolbarLightboxImage, setToolbarLightboxImage] =
    useState<LightboxImage | null>(null);
  const [historyTarget, setHistoryTarget] =
    useState<BaselineHistoryTarget | null>(null);
  /** Bumped after a Playwright visual run so we reload sidecar artifacts. */
  const [diffEpoch, setDiffEpoch] = useState(0);
  const [runProgress, setRunProgress] = useState<VisualRunProgress | null>(
    null,
  );
  const [lastRun, setLastRun] = useState<VisualLastRunSummary | null>(
    loadPersistedVisualLastRun,
  );
  const [baselineJob, setBaselineJob] = useState<VisualCreateProgress | null>(
    null,
  );

  const refreshChangeSets = useCallback(async () => {
    try {
      const response = await fetchVisualDeltaChangeSets();
      setPendingChangesCount(response.pendingCount);
      return response;
    } catch {
      return null;
    }
  }, []);

  const openChanges = useCallback(() => {
    setChangeSetNotice(null);
    setShowConfiguration(false);
    setHistoryTarget(null);
    setShowChanges(true);
    api.setSelectedPanel(PANEL_ID);
    api.togglePanel(true);
  }, [api]);

  useEffect(() => {
    void refreshChangeSets();
    const onChanges = (event: Event) => {
      const mutation = (event as CustomEvent<VisualDeltaChangeSetMutation>)
        .detail;
      void refreshChangeSets();
      const operation = mutation?.changeSet?.operations.at(-1);
      if (operation?.action === "auto-accept") {
        setOptimisticReview("approved");
      }
      if (mutation?.autoCommit) {
        setChangeSetNotice({
          message: `Committed Visual Delta changes as ${mutation.autoCommit.displayId}.`,
          error: false,
        });
        setUpdateLog(
          `Committed Visual Delta changes as ${mutation.autoCommit.displayId}.`,
        );
      } else if (mutation?.autoCommitError) {
        setChangeSetNotice({
          message: `Automatic commit failed: ${mutation.autoCommitError}`,
          error: true,
        });
        setUpdateLog(
          `Visual Delta changes are pending: ${mutation.autoCommitError}`,
        );
      } else if (mutation?.mode === "review" && mutation.changeSetId) {
        openChanges();
      }
    };
    window.addEventListener(VISUAL_DELTA_CHANGES_EVENT, onChanges);
    return () =>
      window.removeEventListener(VISUAL_DELTA_CHANGES_EVENT, onChanges);
  }, [openChanges, refreshChangeSets]);
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
    previewBusy ||
    isDiffing ||
    isUpdating ||
    isCreating ||
    isRebuilding ||
    isInteractionJob ||
    isDeletingBaseline ||
    isRunningVisual ||
    runProgress != null ||
    isReviewing ||
    isIniting;
  const storyEntry = storyId ? api.getData(storyId) : undefined;
  const storyVisualDeltaParameters =
    storyEntry && "parameters" in storyEntry
      ? (
          storyEntry.parameters as {
            visualDelta?: VisualDeltaParams;
          }
        ).visualDelta
      : undefined;
  const storyTagsKey = (storyEntry?.tags ?? []).join("\0");
  const reviewFromStory = visualReviewStatusFromTags(storyEntry?.tags);
  const reviewStatus = optimisticReview ?? reviewFromStory;
  const skipFromStory = (storyEntry?.tags ?? []).includes(SKIP_VISUAL_TAG);
  const skipVisual = optimisticSkipVisual ?? skipFromStory;
  const showMissingCaptureChoices =
    primaryImages.length === 0 &&
    interactions.length === 0 &&
    interactionSteps.length > 0 &&
    !skipVisual;

  useEffect(() => {
    if (showMissingCaptureChoices) setExpandedId(null);
  }, [showMissingCaptureChoices, storyId]);

  useEffect(() => {
    setOptimisticReview(null);
    setOptimisticSkipVisual(null);
    setSelectedInteractionId(null);
    setExpandedId("default");
    setShowDistribution(false);
    setShowAllInteractions(false);
    setHistoryTarget(null);
  }, [storyId, storyTagsKey]);

  const activeSectionId: BaselineSectionId = selectedInteractionId ?? "default";
  const activeDiffMeta = useMemo(() => {
    if (!diffResult) return null;
    const threshold =
      diffResult.passThresholdPercent ?? DEFAULT_PASS_THRESHOLD_PERCENT;
    return {
      status: diffResult.passed ? ("pass" as const) : ("fail" as const),
      stats: `${diffResult.diffPercent.toFixed(4)}% · ${diffResult.diffPixels}/${diffResult.totalPixels} px · <${threshold}%`,
    };
  }, [diffResult]);

  const hiddenInteractionCount = useMemo(
    () =>
      interactionSteps.filter(
        (step) => !interactions.some((item) => item.id === step.stepId),
      ).length,
    [interactionSteps, interactions],
  );

  const baselineSections = useMemo((): BaselineSection[] => {
    const sections: BaselineSection[] = [];
    if (primaryImages.length > 0 || showMissingCaptureChoices) {
      const isActive = activeSectionId === "default";
      const selectedPrimary =
        (selectedMode
          ? primaryImages.find((image) => image.mode === selectedMode)
          : undefined) ?? primaryImages[0];
      const historyPath = baselinePathFromPublicUrl(selectedPrimary?.src);
      const historyLabel = selectedMode
        ? `Default · ${selectedMode}`
        : "Default";
      sections.push({
        id: "default",
        label: "Default",
        hint:
          primaryImages.length > 0
            ? "End of play · primary baseline"
            : "No baseline yet · end of play",
        thumbSrc: selectedPrimary?.src,
        status: isActive ? activeDiffMeta?.status : null,
        stats: isActive ? activeDiffMeta?.stats : null,
        ...(panelCapabilities.history && historyPath
          ? {
              history: {
                path: historyPath,
                label: historyLabel,
                componentPath: storyEntry?.importPath,
              },
            }
          : {}),
      });
    }
    for (const step of interactionSteps) {
      const wired = interactions.find((item) => item.id === step.stepId);
      if (
        !wired &&
        !showAllInteractions &&
        !showMissingCaptureChoices &&
        step.stepId !== selectedInteractionId
      ) {
        continue;
      }
      const isActive = activeSectionId === step.stepId;
      const historyPath = baselinePathFromPublicUrl(wired?.src);
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
        ...(panelCapabilities.history && historyPath
          ? {
              history: {
                path: historyPath,
                label: step.label,
                componentPath: storyEntry?.importPath,
              },
            }
          : {}),
      });
    }
    return sections;
  }, [
    activeDiffMeta,
    activeSectionId,
    interactionSteps,
    interactions,
    primaryImages,
    selectedInteractionId,
    selectedMode,
    showAllInteractions,
    showMissingCaptureChoices,
    storyEntry?.importPath,
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
        restorePrimaryBaselines(primaryImages, true);
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
      const captureCallId =
        step.captureCallId ??
        instrumenterCallIdForInteraction(storyId, step.stepId);
      const callId =
        step.callId ||
        lookupPlayStepCallId(storyId, step.stepId) ||
        captureCallId ||
        "";
      if (callId) {
        // Named runStep captures park in runStep. Ordinary calls publish the
        // same marker when Storybook's exact GOTO target completes.
        setPlayParkTarget(storyId, step.stepId, captureCallId);
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
      if (!baselineMutationsAllowed) {
        setCaptureError(baselineMutationError);
        return;
      }
      setCaptureError(null);
      setUpdateLog(null);
      try {
        await postVisualInteractionBaseline({
          storyId,
          stepLabel: step.label,
          stepId: step.stepId,
          captureCallId: step.captureCallId,
          overwrite,
          browser: selectedBrowser,
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
          {
            allowSkipVisual: true,
            target: { browser: selectedBrowser },
          },
        );
        const suffix = `-${selectedBrowser}.png`;
        const src = primary?.endsWith(suffix)
          ? primary.slice(0, -suffix.length) + `--${step.stepId}${suffix}`
          : undefined;
        if (src) {
          markBaselineSourceAvailable(src);
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
      baselineMutationError,
      baselineMutationsAllowed,
      hydrateInteractions,
      interactions,
      markBaselineSourceAvailable,
      revealCenteredOverlay,
      selectInteractionBaseline,
      selectedBrowser,
      selectedPlatform,
      resolvedConfig,
      storyId,
    ],
  );

  // Soft-hide may clear the preview attach while keeping gallery selection.
  // Fall back to the first baseline so DiffResult / Diff still have a stem.
  const selectedBaselineIndex = index >= 0 ? index : images.length > 0 ? 0 : -1;
  const baselineSrc = images[selectedBaselineIndex]?.src;
  const baselineStem = baselineSrc?.split("?")[0] ?? "";
  /** True for panel-initiated runs and sidebar / Testing Module runs. */
  const runInFlight = isRunningVisual || runProgress != null;
  const runProgressLabel = runInFlight
    ? formatVisualProgressLabel(runProgress)
    : null;
  const statusRunning =
    previewBusy ||
    isCreating ||
    isUpdating ||
    isRebuilding ||
    isInteractionJob ||
    isDeletingBaseline ||
    runInFlight ||
    isDiffing;
  const statusLabel = previewBusy
    ? "Loading story…"
    : isDeletingBaseline
      ? "Deleting screenshot…"
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

  useEffect(() => {
    if (!baselineStem) return;
    if (diffResult?.source !== "playwright") {
      setCapturedActual(baselineStem, null);
      return;
    }
    const density = diffResult.deviceScaleFactor ?? VISUAL_DEVICE_SCALE_FACTOR;
    setCapturedActual(baselineStem, {
      src: diffResult.actualImage,
      cssWidth:
        (diffResult.capturedBitmap?.width ?? diffResult.imageWidth) / density,
      cssHeight:
        (diffResult.capturedBitmap?.height ?? diffResult.imageHeight) / density,
    });
  }, [baselineStem, diffResult, setCapturedActual]);

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
      setLastRun(last);
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

  const acceptableRunStoryIds = useMemo(
    () => acceptableStoryIdsFromLastRun(lastRun),
    [lastRun],
  );
  const rejectableRunStoryIds = useMemo(
    () => rejectableStoryIdsFromLastRun(lastRun),
    [lastRun],
  );

  // Create/update baseline progress — stream logs; on success show center overlay.
  useEffect(() => {
    let wasRunning = false;
    return subscribeVisualCreateProgress((next) => {
      if (next && !visualCreateProgressAppliesToStory(next, currentStoryId)) {
        wasRunning = false;
        setBaselineJob(null);
        return;
      }
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
      setOptimisticReview("pending");
      clearBaselineDiagnostics();
      // CSF may already be wired (no HMR) or index tags still say skip-visual —
      // hydrate from the known PNG path so the empty-state panel fills.
      const entry = currentStoryId ? api.getData(currentStoryId) : undefined;
      const url = baselineUrlForStoryRef(
        {
          id: currentStoryId,
          importPath: entry?.importPath,
          tags: entry?.tags,
        },
        {
          allowSkipVisual: next.kind === "create",
          target: { browser: selectedBrowser },
        },
      );
      if (url) {
        // Prefer hydrate over remount: remount can re-emit INIT_IMAGE with
        // stale empty parameters before CSF HMR lands and wipe the gallery.
        markBaselineSourceAvailable(url);
        hydrateBaselineImages([`${url}?t=${Date.now()}`]);
      } else {
        revealCenteredOverlay();
      }
      setDiffResult(null);
      setDiffEpoch(Date.now());
    });
  }, [
    api,
    clearBaselineDiagnostics,
    currentStoryId,
    hydrateBaselineImages,
    markBaselineSourceAvailable,
    revealCenteredOverlay,
    selectedBrowser,
    selectedPlatform,
  ]);

  const handleDiff = useCallback(
    async (engine: DiffCaptureEngine = "html", fresh = false) => {
      const diffIndex = index >= 0 ? index : images.length > 0 ? 0 : -1;
      if (diffIndex === -1 || !images[diffIndex]) {
        setCaptureError("Please select a baseline image first");
        return;
      }
      if (!storyId && engine === "chromium") {
        setCaptureError("No story selected for Browser Diff");
        return;
      }
      if (engine === "chromium" && !environmentMutable) {
        setCaptureError(
          "Browser comparison is only available for an enabled browser through an available canonical capture runner.",
        );
        return;
      }
      diffAbortRef.current?.abort();
      const abort = new AbortController();
      diffAbortRef.current = abort;
      setIsDiffing(true);
      setDiffProgressLabel(
        engine === "chromium"
          ? `Starting ${selectedBrowser}…`
          : "Diffing…",
      );
      setCaptureError(null);
      setDiffResult(null);
      if (engine === "chromium") setUpdateLog(null);
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
        const captureViewport = viewportForImage(selectedImage);
        const captureDeviceScale = deviceScaleFactorForImage(selectedImage);
        let observedCaptureViewport = captureViewport;

        if (engine === "chromium") {
          let streamedLog = "";
          const result = await compareExactStory(api, storyId!, {
            baselineUrl: baselineUrlForComparison(baselineSrcForDiff),
            visualCaptureUntil: selectedInteractionId ?? undefined,
            visualCaptureCallId: selectedVisualCaptureCallId,
            mode: selectedMode ?? undefined,
            browser: selectedBrowser,
            fresh,
            signal: abort.signal,
            onProgress: (progress) => setDiffProgressLabel(progress.label),
            onLog: (line) => {
              streamedLog = appendStatusLogChunk(streamedLog, line);
              setUpdateLog(streamedLog);
            },
          });
          if (abort.signal.aborted) return;
          applyVisualStatuses([result]);
          if (result.review?.autoAccepted) {
            if (result.review.applied) {
              setOptimisticReview("approved");
              setUpdateLog(
                result.review.changes?.autoCommit
                  ? `Visual passed, accepted, and committed as ${result.review.changes.autoCommit.displayId}.`
                  : "Visual passed and was automatically accepted.",
              );
            } else {
              setCaptureError(
                `Visual passed, but automatic acceptance failed: ${result.review.error ?? "review update failed"}`,
              );
            }
          }
          const outcomePassed =
            result.outcome === "passed" ||
            result.outcome === "changed-within-tolerance";
          const warning = result.policyStatus === "warning";
          publishVisualLastRun({
            finishedAt: Date.now(),
            completed: true,
            summary: {
              total: 1,
              passed: outcomePassed ? 1 : 0,
              failed: outcomePassed || warning ? 0 : 1,
              skipped: 0,
              warnings: warning ? 1 : 0,
            },
            error: outcomePassed || warning ? undefined : "1 failed",
            scope: "story",
            results: [result],
            logTail:
              streamedLog || `Live ${selectedBrowser} story comparison`,
          });
          const stem =
            baselineSrcForDiff.split("?")[0] ??
            selectedImage.src.split("?")[0] ??
            "";
          const loaded = stem
            ? await loadPlaywrightDiffResult(stem, Date.now())
            : null;
          if (stem && loaded) {
            diffResultCacheRef.current.set(stem, loaded);
          }
          setDiffResult(loaded);
          setDiffEpoch(Date.now());
          return;
        } else {
          const overlayHidden = waitForOverlayHidden();
          hideOverlay();
          await overlayHidden;
          let capture: Awaited<ReturnType<typeof capturePreviewSubject>>;
          try {
            const transaction = await withVerifiedPreviewViewport(
              () =>
                capturePreviewSubject({
                  pixelRatio: captureDeviceScale,
                  ignoreSelectors: resolveIgnoreSelectors(ignoreSelectors),
                  cropToViewport,
                  viewport: captureViewport,
                }),
              {
                storyId: storyId ?? "",
                viewport: captureViewport,
                deviceScaleFactor: captureDeviceScale,
                delay,
                signal: abort.signal,
              },
            );
            capture = transaction.result;
            observedCaptureViewport = transaction.diagnostics.observedViewport;
          } finally {
            showOverlay();
          }
          if (abort.signal.aborted) return;
          setDiffProgressLabel("Comparing…");
          actual = await loadImage(capture.dataUrl);
          captureTag = "html-to-image";
        }

        if (cropToViewport) {
          const expectedWidth = Math.round(
            captureViewport.width * captureDeviceScale,
          );
          const expectedHeight = Math.round(
            captureViewport.height * captureDeviceScale,
          );
          if (
            actual.width !== expectedWidth ||
            actual.height !== expectedHeight
          ) {
            throw new Error(
              `Diff HTML viewport capture produced ${actual.width}×${actual.height}; ` +
                `expected ${expectedWidth}×${expectedHeight} for ` +
                `${captureViewport.width}×${captureViewport.height} at ${captureDeviceScale}×.`,
            );
          }
        }

        const width = baseline.width;
        const height = baseline.height;
        const sizeCore =
          actual.width === width && actual.height === height
            ? `${width}×${height}`
            : `baseline ${width}×${height}, actual ${actual.width}×${actual.height} (padded/cropped)`;
        const sizeNote =
          `${captureTag} · viewport requested ${captureViewport.width}×${captureViewport.height}, ` +
          `observed ${observedCaptureViewport.width}×${observedCaptureViewport.height} at ` +
          `${captureDeviceScale}× · bitmap ${actual.width}×${actual.height} · ${sizeCore}`;
        const threshold =
          passThresholdPercent ?? DEFAULT_PASS_THRESHOLD_PERCENT;
        const nextResult = {
          ...compareLoadedImages(baseline, actual, {
            pixelThreshold: diffThreshold ?? DEFAULT_DIFF_THRESHOLD,
            includeAntiAliasing: diffIncludeAntiAliasing,
            passThresholdPercent: threshold,
            deviceScaleFactor: captureDeviceScale,
            captureViewport,
            observedCaptureViewport,
            sizeNote,
          }),
          source: "html" as const,
        };
        const { diffPercent, diffPixels, totalPixels } = nextResult;
        // Cache under the gallery stem so soft-hide / reload effects keep DiffResult.
        const stemKey =
          (baselineSrcForDiff.split("?")[0] ||
            selectedImage.src.split("?")[0]) ??
          "";
        if (stemKey) {
          diffResultCacheRef.current.set(stemKey, nextResult);
        }
        setDiffResult(nextResult);
        // Diff HTML is intentionally diagnostic-only. It does not publish a
        // durable run, sidebar status, or review outcome.
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
      api,
      cropToViewport,
      delay,
      diffIncludeAntiAliasing,
      diffThreshold,
      environmentMutable,
      getOverlayInfo,
      hideOverlay,
      ignoreSelectors,
      images,
      index,
      passThresholdPercent,
      resolvedConfig,
      selectedBrowser,
      selectedInteractionId,
      selectedVisualCaptureCallId,
      selectedMode,
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
    if (!baselineMutationsAllowed) {
      setCaptureError(baselineMutationError);
      return;
    }
    setCaptureError(null);
    setUpdateLog(null);
    try {
      await postVisualUpdateBaseline({
        storyId,
        browser: selectedBrowser,
      });
    } catch {
      // Error/log surface via subscribeVisualCreateProgress.
    }
  }, [baselineMutationError, baselineMutationsAllowed, selectedBrowser, storyId]);

  const handleDeleteBaseline = useCallback(
    async (section: BaselineSection) => {
      if (!storyId) {
        setCaptureError("No story selected");
        return;
      }
      if (!baselineMutationsAllowed) {
        setCaptureError(baselineMutationError);
        return;
      }
      const baselineUrl = (
        section.id === "default" ? section.thumbSrc : section.wired?.src
      )?.split("?")[0];
      if (!baselineUrl) {
        setCaptureError("No screenshot selected");
        return;
      }

      setIsDeletingBaseline(true);
      setCaptureError(null);
      setUpdateLog("Deleting screenshot…");
      try {
        const result = await postVisualDeleteBaseline({
          storyId,
          baselineUrl,
          interactionId:
            section.id === "default" ? undefined : section.wired?.id,
        });
        if (section.id === "default") {
          removeBaselineImage(baselineUrl);
          setSelectedInteractionId(null);
          const remaining = primaryImages.filter(
            (image) => (image.src.split("?")[0] ?? image.src) !== baselineUrl,
          );
          setSelectedMode(null, remaining);
          setExpandedId(
            remaining.length > 0
              ? "default"
              : (interactionSteps[0]?.stepId ?? null),
          );
        } else {
          hydrateInteractions(
            interactions.filter((item) => item.id !== section.wired?.id),
          );
          setSelectedInteractionId(null);
          setExpandedId(primaryImages.length > 0 ? "default" : null);
          restorePrimaryBaselines(primaryImages, true);
        }
        setDiffResult(null);
        setDiffEpoch(Date.now());
        invalidateVisualLastRun([storyId]);
        clearBaselineDiagnostics();
        const derivedCount = Math.max(0, result.deletedFiles.length - 1);
        setUpdateLog(
          `Deleted ${section.label} screenshot${
            derivedCount > 0
              ? ` and ${derivedCount} derived ${
                  derivedCount === 1 ? "artifact" : "artifacts"
                }`
              : ""
          }`,
        );
      } catch (error) {
        setCaptureError(
          error instanceof Error ? error.message : "Delete screenshot failed",
        );
      } finally {
        setIsDeletingBaseline(false);
      }
    },
    [
      hydrateInteractions,
      interactionSteps,
      interactions,
      clearBaselineDiagnostics,
      primaryImages,
      baselineMutationError,
      baselineMutationsAllowed,
      removeBaselineImage,
      restorePrimaryBaselines,
      setSelectedMode,
      storyId,
    ],
  );

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
    if (!baselineMutationsAllowed) {
      setCaptureError(baselineMutationError);
      return;
    }
    setCaptureError(null);
    setUpdateLog(null);
    try {
      await postVisualCreateBaseline({
        storyId,
        browser: selectedBrowser,
      });
    } catch {
      // Error/log surface via subscribeVisualCreateProgress.
    }
  }, [baselineMutationError, baselineMutationsAllowed, selectedBrowser, storyId]);

  const refreshOnboarding = useCallback(async () => {
    try {
      const config = await fetchVisualConfig();
      setResolvedConfig(normalizePanelConfig(config));
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
            : scope === "run"
              ? acceptableRunStoryIds
              : [storyId];
        if (!ids.length) {
          throw new Error(
            scope === "run"
              ? "The current visual run has no passed results"
              : "No stories to accept",
          );
        }
        const result = await postVisualReviewStatuses(
          ids.map((id) => ({ storyId: id, status: "approved" })),
        );
        if (result.errors.length) throw new Error(result.errors[0]);
        if (ids.includes(storyId)) setOptimisticReview("approved");
        setUpdateLog(
          scope === "component"
            ? `Accepted ${ids.length} stor${ids.length === 1 ? "y" : "ies"} (visual-approved).`
            : scope === "run"
              ? `Accepted ${ids.length} stor${ids.length === 1 ? "y" : "ies"} from the current run.`
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
    [acceptableRunStoryIds, api, storyId],
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
            : scope === "run"
              ? rejectableRunStoryIds
              : [storyId];
        if (!ids.length) {
          throw new Error(
            scope === "run"
              ? "The current visual run has no failed results"
              : "No stories to unaccept",
          );
        }
        const status = scope === "run" ? "failed" : "pending";
        const result = await postVisualReviewStatuses(
          ids.map((id) => ({ storyId: id, status })),
        );
        if (result.errors.length) throw new Error(result.errors[0]);
        if (ids.includes(storyId)) setOptimisticReview(status);
        setUpdateLog(
          scope === "component"
            ? `Unaccepted ${ids.length} stor${ids.length === 1 ? "y" : "ies"} (visual-pending).`
            : scope === "run"
              ? `Marked ${ids.length} stor${ids.length === 1 ? "y" : "ies"} failed from the current run.`
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
    [api, rejectableRunStoryIds, storyId],
  );

  const handleModeChange = useCallback(
    (mode: string | null) => {
      setSelectedMode(mode, primaryImages);
      if (typeof api.updateGlobals === "function") {
        const clearedGlobals = Object.fromEntries(
          Object.values(modes).flatMap((definition) =>
            Object.keys(definition.globals ?? {}).map((key) => [key, undefined]),
          ),
        );
        api.updateGlobals({
          ...clearedGlobals,
          ...(mode ? modes[mode]?.globals : undefined),
        });
      }
    },
    [api, modes, primaryImages, setSelectedMode],
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
      invalidateVisualLastRun([storyId]);
      clearBaselineDiagnostics();
      setOptimisticSkipVisual(nextSkip);
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
  }, [clearBaselineDiagnostics, skipVisual, storyId]);

  const handleRunVisual = useCallback(
    async (scope: VisualRunMode, fresh = false) => {
      if (scope !== "all" && scope !== "affected" && !storyId) {
        setCaptureError("No story selected");
        return;
      }
      if (scope === "story" && !environmentMutable) {
        setCaptureError("The selected browser and OS are view-only.");
        return;
      }
      setIsRunningVisual(true);
      setCaptureError(null);
      try {
        const storyIds =
          scope === "all" || scope === "affected"
            ? undefined
            : visualRunnableStoryIds(
                api,
                scope === "story"
                  ? [storyId!]
                  : componentStoryIdsFor(api, storyId!),
              );
        if (scope !== "all" && scope !== "affected" && !storyIds?.length) {
          throw new Error(
            "No runnable visual stories in this scope (all skip-visual)",
          );
        }
        await testProviderStore.runWithState(async () => {
          if (scope === "story") {
            applyPendingVisualStatuses([storyId!]);
            let streamedLog = "";
            setUpdateLog(null);
            const result = await compareExactStory(api, storyId!, {
              baselineUrl: baselineUrlForComparison(baselineSrc),
              visualCaptureUntil: selectedInteractionId ?? undefined,
              visualCaptureCallId: selectedVisualCaptureCallId,
              mode: selectedMode ?? undefined,
              browser: selectedBrowser,
              fresh,
              onProgress: (progress) => setDiffProgressLabel(progress.label),
              onLog: (line) => {
                streamedLog = appendStatusLogChunk(streamedLog, line);
                setUpdateLog(streamedLog);
              },
            });
            applyVisualRunResults([storyId!], [result]);
            if (result.review?.autoAccepted) {
              if (result.review.applied) {
                setOptimisticReview("approved");
                setUpdateLog(
                  result.review.changes?.autoCommit
                    ? `Visual passed, accepted, and committed as ${result.review.changes.autoCommit.displayId}.`
                    : "Visual passed and was automatically accepted.",
                );
              } else {
                setCaptureError(
                  `Visual passed, but automatic acceptance failed: ${result.review.error ?? "review update failed"}`,
                );
              }
            }
            const outcomePassed =
              result.outcome === "passed" ||
              result.outcome === "changed-within-tolerance";
            const warning = result.policyStatus === "warning";
            publishVisualLastRun({
              finishedAt: Date.now(),
              completed: true,
              summary: {
                total: 1,
                passed: outcomePassed ? 1 : 0,
                failed: outcomePassed || warning ? 0 : 1,
                skipped: 0,
                warnings: warning ? 1 : 0,
              },
              error: outcomePassed || warning ? undefined : "1 failed",
              scope: "story",
              results: [result],
              logTail:
                streamedLog || `Live ${selectedBrowser} story comparison`,
            });
            setDiffEpoch(Date.now());
            if (!outcomePassed && !warning) {
              setCaptureError("Visual: 1 failed · 0 passed");
            }
            return;
          }
          if (storyIds?.length) {
            applyPendingVisualStatuses(storyIds);
          } else {
            clearVisualStatuses();
          }
          const data = await postVisualRun({
            storyIds,
            fresh,
            selection:
              scope === "affected"
                ? "affected"
                : scope === "all"
                  ? "all"
                  : "selected",
          });
          if (data.crashed) {
            publishVisualLastRun({
              finishedAt: Date.now(),
              summary: data.summary,
              error: data.error ?? "Visual test run crashed",
              scope,
              logTail: data.logTail,
              results: data.results,
              affected: data.affected,
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
            affected: data.affected,
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
    [
      api,
      baselineSrc,
      environmentMutable,
      selectedBrowser,
      selectedInteractionId,
      selectedVisualCaptureCallId,
      selectedMode,
      storyId,
    ],
  );

  const handleRun = useCallback(
    (mode: VisualRunMode) => {
      void handleRunVisual(mode);
    },
    [handleRunVisual],
  );

  const isEmpty = primaryImages.length === 0 && images.length === 0;
  const requiresBaselineChoice = isEmpty && showMissingCaptureChoices;
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
  const latestStoryResultCandidate =
    lastRun?.results?.find(
      (result) =>
        result.storyId === storyId &&
        (result.target?.browser ?? result.environment?.browser) ===
          selectedBrowser,
    ) ??
    lastRun?.results?.find(
      (result) => result.storyId === storyId && result.environment == null,
    );
  const latestStoryResult =
    latestStoryResultCandidate?.sidecar &&
    latestStoryResultCandidate.sidecar.version >= 2 &&
    (!diffResult ||
      latestStoryResultCandidate.sidecar.baselineHash !==
        diffResult.baselineHash ||
      latestStoryResultCandidate.sidecar.captureConfigHash !==
        diffResult.captureConfigHash)
      ? undefined
      : latestStoryResultCandidate;
  const modeResultStatuses = useMemo(
    () =>
      Object.fromEntries(
        (latestStoryResult?.modeResults ?? []).map((result) => [
          result.mode ?? "Default",
          result.status,
        ]),
      ) as Record<string, VisualModeResultStatus>,
    [latestStoryResult],
  );
  const aggregateModeStatus = useMemo(
    () => aggregateModeResultStatus(latestStoryResult?.modeResults ?? []),
    [latestStoryResult],
  );
  const modeSummary = useMemo(() => {
    const results = latestStoryResult?.modeResults ?? [];
    if (results.length === 0) return null;
    const counts = results.reduce<Record<VisualModeResultStatus, number>>(
      (next, result) => {
        next[result.status] += 1;
        return next;
      },
      { passed: 0, failed: 0, new: 0, error: 0 },
    );
    return (["passed", "failed", "new", "error"] as const)
      .filter((status) => counts[status] > 0)
      .map((status) => `${counts[status]} ${status}`)
      .join(" · ");
  }, [latestStoryResult]);
  const resultSummary = useMemo(() => {
    let state: PanelResultState = "ready";
    let title = "Baseline ready";
    let detail: string | null =
      "Run the visual test to refresh its comparison result.";

    if (needsScaffold) {
      state = "setup";
      title = "Setup required";
      detail = onboardingHint;
    } else if (skipVisual) {
      state = "skipped";
      title = "Visual tests skipped";
      detail = "This story is excluded with skip-visual.";
    } else if (statusRunning) {
      state = "running";
      title = runInFlight ? "Visual test running" : "Baseline job running";
      detail = statusLabel;
    } else if (isEmpty) {
      state = "missing";
      title = "Baseline missing";
      detail = "Create a visual baseline to enable comparison.";
    } else if (
      baselineJob &&
      !baselineJob.running &&
      !baselineJob.error &&
      baselineJob.kind !== "rebuild" &&
      !latestStoryResult
    ) {
      state = "ready";
      title =
        baselineJob.kind === "create" ? "Baseline created" : "Baseline updated";
      detail =
        "Review is pending. Run Story or Diff Browser to produce a fresh official result.";
    } else if (aggregateModeStatus === "error") {
      state = "error";
      title = "Mode capture error";
      detail =
        latestStoryResult?.modeResults?.find(
          (result) => result.status === "error",
        )?.error ?? "One or more visual modes could not be captured.";
    } else if (aggregateModeStatus === "new") {
      state = "missing";
      title = "Mode baseline missing";
      detail = "Create or update baselines for every enabled visual mode.";
    } else if (latestStoryResult?.policyStatus === "warning") {
      state = "warning";
      title =
        latestStoryResult.outcome === "missing-baseline"
          ? "Baseline warning"
          : "Visual difference warning";
      detail =
        latestStoryResult.error ??
        "The comparison completed with a warning and was not counted as passed.";
    } else if (
      aggregateModeStatus === "failed" ||
      latestStoryResult?.status === "failed"
    ) {
      state = "failed";
      title = "Visual test failed";
      detail = latestStoryResult?.error ?? captureError;
    } else if (
      aggregateModeStatus === "passed" ||
      latestStoryResult?.status === "passed"
    ) {
      state = "passed";
      title = "Visual test passed";
      detail =
        latestStoryResult?.sidecar?.diffPercent != null
          ? `${latestStoryResult.sidecar.diffPercent.toFixed(4)}% different`
          : "The latest Playwright comparison passed.";
    } else if (captureError) {
      state = "error";
      title = "Capture error";
      detail = captureError;
    } else if (diffResult?.source === "playwright") {
      state = "ready";
      title = "Baseline updated";
      detail =
        "Run Story or Diff Browser to refresh the official comparison result.";
    } else if (badgeStatus === "fail") {
      state = "failed";
      title = "HTML preview differs";
      detail =
        "Diagnostic only — run Story or Diff Browser for an official result.";
    } else if (badgeStatus === "pass") {
      state = "passed";
      title = "HTML preview matches";
      detail =
        "Diagnostic only — run Story or Diff Browser for an official result.";
    }

    return { state, title, detail };
  }, [
    badgeStatus,
    aggregateModeStatus,
    baselineJob,
    captureError,
    diffResult,
    isEmpty,
    latestStoryResult,
    needsScaffold,
    onboardingHint,
    runInFlight,
    skipVisual,
    statusLabel,
    statusRunning,
  ]);

  const renderSectionBody = useCallback(
    (section: BaselineSection) => {
      const hasBaseline = Boolean(section.thumbSrc || section.wired?.src);
      if (!hasBaseline) {
        const label =
          section.step?.syntax?.text ?? section.step?.label ?? section.label;
        const actionLabel = section.step
          ? `Create ${label} baseline (${section.step.stepId})`
          : `Create ${label} baseline`;
        return (
          <Button
            size="small"
            ariaLabel={actionLabel}
            disabled={busy}
            onClick={() => {
              if (section.id === "default") {
                void handleCreateBaselines();
                return;
              }
              if (section.step) {
                void handleCreateInteraction(section.step, false);
              }
            }}
          >
            Create baseline
          </Button>
        );
      }
      return (
        <>
          <PanelToolbar>
            <ToolbarRow>
              {section.id === "default" ? (
                <ModeSelector
                  modeNames={modeNames}
                  value={selectedMode}
                  onChange={handleModeChange}
                  disabled={busy}
                  results={modeResultStatuses}
                  previewSources={modePreviewSources}
                  onPreviewOpen={({ name, src, image }) => {
                    const source = primaryImages.find(
                      (candidate) => candidate.src === src,
                    );
                    const size = baselineLightboxCssSize(source, image);
                    setToolbarLightboxImage({
                      src,
                      label: `${name} baseline`,
                      width: size.width,
                      height: size.height,
                    });
                  }}
                />
              ) : section.thumbSrc ? (
                <SectionThumbFrame
                  type="button"
                  title={`Open ${section.label} baseline full image`}
                  aria-label={`Open ${section.label} baseline full image`}
                  onClick={(event) => {
                    const size = baselineLightboxCssSize(
                      undefined,
                      event.currentTarget.querySelector("img"),
                    );
                    setToolbarLightboxImage({
                      src: section.thumbSrc!,
                      label: `${section.label} baseline`,
                      width: size.width,
                      height: size.height,
                    });
                  }}
                >
                  <SectionThumb src={section.thumbSrc} alt="" />
                </SectionThumbFrame>
              ) : null}
              <LiveVisibilityToggle
                liveVisible={liveVisible}
                onToggle={setLiveVisible}
                disabled={images.length === 0}
              />
              {liveVisible || Boolean(images[index]?.actualSrc) ? (
                <PlacementPad
                  value={placement}
                  active={overlayOn}
                  onToggle={togglePlacement}
                  comparisonTarget={liveVisible ? "live" : "actual"}
                  disabled={images.length === 0}
                />
              ) : null}
              {liveVisible && index >= 0 && isSplit ? (
                <CompareZoomControl value={splitZoom} onChange={setSplitZoom} />
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
                    <RangeNumberInput
                      label="Overlay opacity percentage"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(opacity * 100)}
                      suffix="%"
                      inputWidth="3.5rem"
                      onChange={(value) => setOpacity(value / 100)}
                    />
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
                  {diffEngine === "html" ? (
                    <RangeNumberInput
                      label="HTML preview pass threshold percentage"
                      min={0}
                      max={2}
                      step={0.001}
                      value={passThresholdPercent}
                      suffix="%"
                      inputWidth="3.75rem"
                      onChange={(value) =>
                        setPassThresholdPercent("html", value)
                      }
                    />
                  ) : (
                    <span title="Edit the official browser threshold in Configuration">
                      {passThresholdPercent}%
                    </span>
                  )}
                </InlineControl>
              </ThreshStack>
            </ToolbarRow>
            {captureError ? <ErrorText>{captureError}</ErrorText> : null}
          </PanelToolbar>
          {diffResult && images.length > 0 ? (
            <DiffResult
              result={diffResult}
              showHistogram={showDistribution}
              defaultZoom={diffResultZoomDefault}
            />
          ) : null}
        </>
      );
    },
    [
      busy,
      captureError,
      colorInversion,
      diffEngine,
      diffResult,
      handleModeChange,
      handleCreateBaselines,
      handleCreateInteraction,
      images.length,
      images,
      index,
      isSplit,
      liveVisible,
      modeNames,
      modeResultStatuses,
      modePreviewSources,
      opacity,
      overlayOn,
      passThresholdPercent,
      placement,
      primaryImages,
      resetOverlay,
      selectedInteractionId,
      selectedMode,
      setColorInversion,
      setIndex,
      setLiveVisible,
      setSplitZoom,
      setOpacity,
      setPassThresholdPercent,
      showDistribution,
      splitZoom,
      diffResultZoomDefault,
      togglePlacement,
    ],
  );

  const emptyState: PanelViewEmptyState | null =
    !showConfiguration &&
    !showChanges &&
    !loading &&
    isEmpty &&
    baselineSections.length === 0
      ? panelCapabilities.readOnly
        ? {
            description:
              "No baseline is wired for this story. In a static read-only Storybook, open a story with parameters.visualDelta.images (see Examples). Creating baselines requires Storybook development with Visual Delta middleware.",
          }
        : !environmentMutable
          ? {
              description: `No canonical baseline exists for ${selectedBrowser}. This browser is view-only, or the Linux · ARM64 capture runner is unavailable.`,
            }
        : {
            description: skipVisual
              ? "This story is tagged skip-visual (excluded from Playwright visual runs). Use Include in visual tests in the header to opt in, then Create visual."
              : needsScaffold
                ? (onboardingHint ??
                  "Set up the Playwright suite and config, then create a baseline for this story.")
                : "Capture a Playwright baseline for this story, then compare live canvas to the PNG with overlay and diff tools. Or Skip visual tests from the header if this story should stay out of the suite.",
            footer:
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
              ),
          }
      : null;

  return (
    <>
      <PanelView
        active={props.active ?? false}
        header={{
          badgeStatus: previewBusy ? null : badgeStatus,
          empty: baselineAvailability === "absent",
          busy,
          storyMissing: !storyId || loading,
          isDiffing: !previewBusy && isDiffing,
          isRunning: !previewBusy && runInFlight,
          diffProgressLabel: previewBusy ? null : diffProgressLabel,
          runProgressLabel: previewBusy ? null : runProgressLabel,
          createLabel: isCreating
            ? (createProgress?.label ?? "Creating…")
            : "Create visual",
          showCreate: !requiresBaselineChoice,
          reviewStatus: previewBusy ? null : reviewStatus,
          skipVisual: previewBusy ? false : skipVisual,
          onDiff: (engine) => void handleDiff(engine),
          onFreshDiff: () => void handleDiff("chromium", true),
          onRun: handleRun,
          onFreshRun: (mode) => void handleRunVisual(mode, true),
          diffEngine,
          onDiffEngineChange: setDiffEngine,
          onCreate: () => void handleCreateBaselines(),
          onRebuildStatic: () => void handleRebuildStatic(),
          onResetSettings: resetSettings,
          onStopDiff: handleStopDiff,
          onStopRun: () => {
            void abortVisualWork().finally(() => {
              testProviderStore.setState("test-provider-state:pending");
            });
            setIsRunningVisual(false);
            setRunProgress(null);
            setBaselineJob(null);
          },
          onReviewStatus: (status) => void handleSetReviewStatus(status),
          onAccept: (scope) => void handleAcceptScope(scope),
          onUnaccept: (scope) => void handleUnacceptScope(scope),
          acceptRunAcceptAvailable: acceptableRunStoryIds.length > 0,
          acceptRunRejectAvailable: rejectableRunStoryIds.length > 0,
          onToggleSkipVisual: () => void handleToggleSkipVisual(),
          onOpenConfiguration: () => {
            setShowChanges(false);
            setShowConfiguration(true);
          },
          onOpenChanges: openChanges,
          pendingChangesCount,
          isRebuilding,
          capabilities: environmentCapabilities,
        }}
        loading={loading}
        configuration={
          showChanges ? (
            <ChangeSetsView
              onClose={() => setShowChanges(false)}
              onUpdated={(response) =>
                setPendingChangesCount(response.pendingCount)
              }
            />
          ) : showConfiguration ? (
            <ConfigurationPanel
              onClose={() => setShowConfiguration(false)}
              story={
                storyId
                  ? {
                      id: storyId,
                      name: storyName || storyId,
                      parameters: storyVisualDeltaParameters,
                      alignmentMismatch: baselineAlignmentMismatch,
                    }
                  : undefined
              }
              onStoryUpdated={() => {
                if (storyId) {
                  invalidateVisualLastRun([storyId]);
                  clearBaselineDiagnostics();
                  setDiffResult(null);
                  diffResultCacheRef.current.clear();
                  emit(EVENTS.REQUEST_INIT_IMAGE, { storyId });
                }
              }}
              onUpdated={(config) => {
                setResolvedConfig(normalizePanelConfig(config));
                invalidateVisualLastRun();
                clearBaselineDiagnostics();
                setDiffResult(null);
                diffResultCacheRef.current.clear();
                emit(EVENTS.CONFIG_UPDATED, {
                  projectDefaults: config.projectDefaults,
                });
              }}
            />
          ) : null
        }
        summary={
          <PanelResultSummary
            state={resultSummary.state}
            title={resultSummary.title}
            detail={resultSummary.detail}
            finishedAt={latestStoryResult ? lastRun?.finishedAt : null}
            modeSummary={modeSummary}
          />
        }
        notice={
          baselineGeometryMismatch ||
          baselineAlignmentMismatch ||
          baselineGeometryUnavailable ||
          changeSetNotice ? (
            <>
              {changeSetNotice ? (
                <ChangeSetOutcomeNotice
                  message={changeSetNotice.message}
                  error={changeSetNotice.error}
                  onOpen={openChanges}
                />
              ) : null}
              {baselineGeometryUnavailable ? (
                <BaselineGeometryUnavailable
                  detail={baselineGeometryUnavailable}
                  onRetry={() => setIndex(index)}
                />
              ) : null}
              {baselineGeometryMismatch ? (
                <BaselineGeometryWarning mismatch={baselineGeometryMismatch} />
              ) : null}
              {baselineAlignmentMismatch ? (
                <BaselineAlignmentWarning
                  mismatch={baselineAlignmentMismatch}
                  onOpenConfiguration={() => setShowConfiguration(true)}
                />
              ) : null}
            </>
          ) : null
        }
        emptyState={emptyState}
        content={
          historyTarget ? (
            <BaselineHistoryView
              target={historyTarget}
              onClose={() => setHistoryTarget(null)}
            />
          ) : !showConfiguration &&
            !loading &&
            !(
              isEmpty &&
              baselineSections.length === 0 &&
              interactionSteps.length === 0
            ) ? (
            <BaselineAccordion
              sections={baselineSections}
              expandedId={expandedId}
              busy={busy}
              showDistribution={showDistribution}
              showAllInteractions={showAllInteractions}
              hiddenInteractionCount={hiddenInteractionCount}
              showInteractionFilter
              onExpand={selectSection}
              onCreateDefault={
                baselineMutationsAllowed
                  ? () => void handleCreateBaselines()
                  : undefined
              }
              onCreate={
                baselineMutationsAllowed
                  ? (step) => void handleCreateInteraction(step, false)
                  : () => undefined
              }
              onUpdate={
                baselineMutationsAllowed
                  ? (step) => void handleCreateInteraction(step, true)
                  : () => undefined
              }
              onUpdateDefault={
                baselineMutationsAllowed
                  ? () => void handleUpdateBaselines()
                  : () => undefined
              }
              onDelete={
                baselineMutationsAllowed
                  ? (section) => void handleDeleteBaseline(section)
                  : () => undefined
              }
              allowMutations={baselineMutationsAllowed}
              onToggleDistribution={() =>
                setShowDistribution((value) => !value)
              }
              onToggleInteractions={() => {
                const next = !showAllInteractions;
                setShowAllInteractions(next);
                if (
                  next &&
                  storyId &&
                  playSteps.length === 0 &&
                  interactionDiscoveryStoryRef.current !== storyId
                ) {
                  interactionDiscoveryStoryRef.current = storyId;
                  // Storybook does not replay a completed instrumenter SYNC to
                  // late-mounted panels. Discover on explicit request so the
                  // initial Visual Delta view never remounts or mutates story
                  // state behind the user's back.
                  remountStory(storyId);
                }
              }}
              onOpenHistory={setHistoryTarget}
              renderBody={renderSectionBody}
            />
          ) : null
        }
        status={{
          running: statusRunning,
          label: statusLabel,
          log: updateLog,
          error: captureError,
          progress:
            runInFlight && runProgress
              ? {
                  completed: runProgress.completed,
                  total: runProgress.total,
                }
              : baselineJob?.running
                ? {
                    completed: baselineJob.completed ?? 0,
                    total: baselineJob.total ?? 0,
                  }
                : null,
          environment: {
            browser: selectedBrowser,
            browsers: environmentOptions.browsers,
            onBrowserChange: (value) => {
              if (isVisualDeltaBrowser(value)) setSelectedBrowser(value);
            },
            captureProfileId: resolvedConfig?.captureProfile.id,
          },
        }}
      />
      <ImageLightbox
        image={toolbarLightboxImage}
        onClose={() => setToolbarLightboxImage(null)}
      />
    </>
  );
});
