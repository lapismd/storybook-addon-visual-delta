import { useCallback, useEffect, useRef, useState } from "react";
import { useChannel } from "storybook/manager-api";
import {
  DEFAULT_DIFF_THRESHOLD,
  EVENTS,
  deviceScaleFactorForImage,
  isSplitPlacement,
  viewportForImage,
  type BaselineGeometryMismatch,
  type AlignMode,
  type PlacementMode,
  type VisualDeltaImage,
  type VisualDeltaInteraction,
  type VisualDeltaModes,
} from "../constants.js";
import {
  initImageSelection,
  opacityForPlacementChange,
  placementToggleAction,
  revealCenteredOverlayPatch,
} from "../shared/overlay-session.js";
import type { OverlayInfo } from "../types.js";
import type { VisualDeltaZoomDefault } from "../shared/config-types.js";
import type { BaselineAlignmentMismatch } from "../shared/story-config.js";
import {
  compareZoomFromDefault,
  type CompareZoomState,
} from "../shared/compare-zoom.js";
import type { DiffCaptureEngine } from "../manager/DiffCaptureSplitButton.js";
import {
  measureCurrentPreviewLayout,
  previewContainsVisualDeltaDom,
  withVerifiedPreviewViewport,
} from "./capture.js";
import {
  previewLayoutCacheKey,
  type PreviewLayoutSnapshot,
  type StorybookLayoutMode,
} from "../shared/preview-layout.js";
import {
  clearSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  SETTINGS_STORAGE_KEY,
  type PassThresholdByEngine,
  type VisualDeltaSettings,
} from "./settings.js";
import {
  mergeInitReadiness,
  mergeStoryFinished,
  type PreviewReadiness,
} from "../shared/baseline-readiness.js";

const PINNED_INTERACTION_SRC_KEY = "visual-delta/pinned-interaction-src";

function readPinnedInteractionSrc(): string | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage.getItem(PINNED_INTERACTION_SRC_KEY);
  } catch {
    return null;
  }
}

function writePinnedInteractionSrc(src: string | null): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (src) sessionStorage.setItem(PINNED_INTERACTION_SRC_KEY, src);
    else sessionStorage.removeItem(PINNED_INTERACTION_SRC_KEY);
  } catch {
    /* ignore */
  }
}

function pinInteractionSrc(
  ref: { current: string | null },
  src: string | null,
): void {
  ref.current = src;
  writePinnedInteractionSrc(src);
}

type StoryData = {
  images: VisualDeltaImage[];
  /** Opted-in mid-play captures from `parameters.visualDelta.interactions`. */
  interactions: VisualDeltaInteraction[];
  /** Stacked modes from CSF (Chromatic-style). */
  modes: VisualDeltaModes;
  modeNames: string[];
  /** Currently selected mode name, or null for default/primary. */
  selectedMode: string | null;
  storyId: string;
  storyName: string;
  /** Merged Storybook `parameters.layout` for the current render. */
  layout: StorybookLayoutMode | null;
  /** Preview-owned generation; globals/remounts receive a fresh snapshot. */
  renderGeneration: number;
  /** Exact Storybook storyFinished state for this render generation. */
  storyFinished: boolean;
  index: number;
  /**
   * Whether the baseline overlay / split chrome is visible. Distinct from
   * `index`: hiding via the placement pad keeps the selected baseline so the
   * preview layout (width lock, split panes) does not jump.
   */
  overlayOn: boolean;
  opacity: number;
  baselineLabelOffset: { x: number; y: number };
  colorInversion: boolean;
  placement: PlacementMode;
  /** False = image-only (live hidden, center overlay). Default true. */
  liveVisible: boolean;
  /** Pass threshold (%) scoped by Diff HTML vs Diff Chromium. */
  passThresholdByEngine: PassThresholdByEngine;
  diffThreshold: number;
  diffIncludeAntiAliasing: boolean;
  delay: number;
  ignoreSelectors: string[];
  cropToViewport: boolean;
  /** Effective capture alignment for hydrated or interaction images. */
  effectiveAlign: AlignMode;
  previewSplitZoomDefault: VisualDeltaZoomDefault;
  diffResultZoomDefault: VisualDeltaZoomDefault;
  splitZoom: CompareZoomState;
  baselineGeometryMismatch: BaselineGeometryMismatch | null;
  baselineAlignmentMismatch: BaselineAlignmentMismatch | null;
  baselineGeometryUnavailable: string | null;
};

function waitTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export function useOverlayInfo() {
  const pendingRef = useRef(new Map<string, (info: OverlayInfo) => void>());
  const emitRef = useRef<ReturnType<typeof useChannel> | null>(null);
  const emit = useChannel({
    [EVENTS.OVERLAY_INFO]: (data: OverlayInfo & { requestId: string }) => {
      const { requestId, ...overlayInfo } = data;
      const resolve = pendingRef.current.get(requestId);
      if (!resolve) return;
      pendingRef.current.delete(requestId);
      resolve(overlayInfo);
    },
  });
  emitRef.current = emit;

  const getOverlayInfo = useCallback((): Promise<OverlayInfo> => {
    return new Promise((resolve, reject) => {
      const requestId = `overlay-info-${Date.now()}-${Math.random()}`;
      const timeout = setTimeout(() => {
        pendingRef.current.delete(requestId);
        reject(new Error("Timed out waiting for overlay position info"));
      }, 5000);
      pendingRef.current.set(requestId, (overlayInfo) => {
        clearTimeout(timeout);
        resolve(overlayInfo);
      });
      emitRef.current?.(EVENTS.REQUEST_OVERLAY_INFO, { requestId });
    });
  }, []);

  return { getOverlayInfo };
}

export function useOverlayHidden() {
  const pendingRef = useRef<Array<() => void>>([]);
  useChannel({
    [EVENTS.OVERLAY_HIDDEN]: () => {
      const waiters = pendingRef.current.splice(0);
      for (const resolve of waiters) resolve();
    },
  });

  const waitForOverlayHidden = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>;
      const waiter = () => {
        clearTimeout(timeout);
        resolve();
      };
      timeout = setTimeout(() => {
        pendingRef.current = pendingRef.current.filter((r) => r !== waiter);
        reject(new Error("Timed out waiting for overlay to hide"));
      }, 5000);
      pendingRef.current.push(waiter);
    });
  }, []);

  return { waitForOverlayHidden };
}

function withPlacement(
  images: VisualDeltaImage[],
  placement: PlacementMode,
): VisualDeltaImage[] {
  return images.map((img) => ({ ...img, placement }));
}

export function useStoryData(currentStoryId?: string) {
  const prefsRef = useRef<VisualDeltaSettings>(loadSettings());
  /** Compare prefs to restore when leaving image-only. */
  const placementBeforeImageOnlyRef = useRef<PlacementMode | null>(null);
  const styleBeforeImageOnlyRef = useRef<{
    opacity: number;
    colorInversion: boolean;
  } | null>(null);
  const [storyData, setStoryData] = useState<StoryData>(() => {
    const prefs = prefsRef.current;
    const liveVisible = prefs.liveVisible;
    if (!liveVisible) {
      placementBeforeImageOnlyRef.current = prefs.placement;
      styleBeforeImageOnlyRef.current = {
        opacity: prefs.opacity,
        colorInversion: prefs.colorInversion,
      };
    }
    return {
      images: [],
      interactions: [],
      modes: {},
      modeNames: [],
      selectedMode: null,
      storyId: "",
      storyName: "",
      layout: null,
      renderGeneration: 0,
      storyFinished: false,
      index: -1,
      overlayOn: false,
      opacity: prefs.opacity,
      baselineLabelOffset: { x: 0, y: 0 },
      colorInversion: prefs.colorInversion,
      placement: liveVisible ? prefs.placement : "center",
      liveVisible,
      passThresholdByEngine: { ...prefs.passThresholdByEngine },
      diffThreshold: DEFAULT_DIFF_THRESHOLD,
      diffIncludeAntiAliasing: false,
      delay: 0,
      ignoreSelectors: [],
      cropToViewport: false,
      effectiveAlign: "viewport",
      previewSplitZoomDefault: "fit",
      diffResultZoomDefault: "100%",
      splitZoom: compareZoomFromDefault("fit"),
      baselineGeometryMismatch: null,
      baselineAlignmentMismatch: null,
      baselineGeometryUnavailable: null,
    };
  });
  /** End-of-play gallery — preserved while Interactions tab swaps overlay src. */
  const primaryImagesRef = useRef<VisualDeltaImage[]>([]);
  /**
   * Mid-play interaction baseline currently pinned in the overlay. Survives
   * story remount / INIT_IMAGE (GOTO) so selecting an interaction does not
   * snap back to the primary gallery or drop the overlay.
   * Mirrored to sessionStorage so a remount cannot race a React ref reset.
   */
  const activeInteractionSrcRef = useRef<string | null>(
    readPinnedInteractionSrc(),
  );
  const emitRef = useRef<ReturnType<typeof useChannel> | null>(null);
  const storyDataRef = useRef(storyData);
  storyDataRef.current = storyData;
  const selectionContextRef = useRef({
    storyId: "",
    layout: null as StorybookLayoutMode | null,
    renderGeneration: 0,
  });
  const layoutCacheRef = useRef(new Map<string, PreviewLayoutSnapshot>());
  const selectionRequestGenerationRef = useRef(0);
  const overlayHiddenWaitersRef = useRef<Array<() => void>>([]);
  const measuringLayoutRef = useRef(false);
  const layoutMeasurementCountRef = useRef(0);

  const persist = useCallback((next: StoryData) => {
    const priorStyle = styleBeforeImageOnlyRef.current;
    const settings: VisualDeltaSettings = {
      overlayOn: next.overlayOn,
      placement: next.liveVisible
        ? next.placement
        : (placementBeforeImageOnlyRef.current ?? next.placement),
      opacity: next.liveVisible
        ? next.opacity
        : (priorStyle?.opacity ?? next.opacity),
      colorInversion: next.liveVisible
        ? next.colorInversion
        : (priorStyle?.colorInversion ?? next.colorInversion),
      liveVisible: next.liveVisible,
      passThresholdByEngine: { ...next.passThresholdByEngine },
    };
    prefsRef.current = settings;
    saveSettings(settings);
  }, []);

  const waitForOverlayTeardown = useCallback((): Promise<void> => {
    if (!previewContainsVisualDeltaDom()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>;
      const waiter = () => {
        clearTimeout(timeout);
        resolve();
      };
      timeout = setTimeout(() => {
        overlayHiddenWaitersRef.current =
          overlayHiddenWaitersRef.current.filter((entry) => entry !== waiter);
        reject(new Error("Timed out waiting for Visual Delta teardown"));
      }, 5_000);
      overlayHiddenWaitersRef.current.push(waiter);
      emitRef.current?.(EVENTS.HIDE_OVERLAY, {});
    });
  }, []);

  const selectImage = useCallback(
    async (index: number, images: VisualDeltaImage[]) => {
      const requestGeneration = ++selectionRequestGenerationRef.current;
      if (index < 0 || index >= images.length) {
        emitRef.current?.(EVENTS.SELECT_IMAGE, { index: -1, images: [] });
        return;
      }
      const image = images[index];
      const context = selectionContextRef.current;
      if (!image || !context.storyId) return;
      const viewport = viewportForImage(image);
      const cacheKey = previewLayoutCacheKey({
        storyId: context.storyId,
        renderGeneration: context.renderGeneration,
        viewport,
      });
      let layoutSnapshot = layoutCacheRef.current.get(cacheKey);

      let measurementWarningShown = false;
      let measurementAttempts = 0;
      setStoryData((prev) =>
        prev.baselineGeometryUnavailable
          ? { ...prev, baselineGeometryUnavailable: null }
          : prev,
      );
      while (
        !layoutSnapshot &&
        requestGeneration === selectionRequestGenerationRef.current
      ) {
        try {
          layoutMeasurementCountRef.current += 1;
          measuringLayoutRef.current = true;
          await waitForOverlayTeardown();
          if (requestGeneration !== selectionRequestGenerationRef.current) {
            return;
          }
          const transaction = await withVerifiedPreviewViewport(
            async () =>
              measureCurrentPreviewLayout({
                storyId: context.storyId,
                viewport,
                layout: context.layout,
              }),
            {
              storyId: context.storyId,
              viewport,
              deviceScaleFactor: deviceScaleFactorForImage(image),
            },
          );
          layoutSnapshot = transaction.result;
          layoutCacheRef.current.set(cacheKey, layoutSnapshot);
        } catch (error) {
          measurementAttempts += 1;
          // Early selection can race story readiness or a remount. Keep the
          // current request queued until geometry settles; crucially, never
          // apply a fixed-padding fallback while geometry is unknown.
          if (
            requestGeneration === selectionRequestGenerationRef.current &&
            !measurementWarningShown
          ) {
            measurementWarningShown = true;
            console.warn(
              "Visual Delta: Storybook layout measurement is not ready; retrying",
              error,
            );
          }
          if (
            measurementAttempts >= 3 &&
            requestGeneration === selectionRequestGenerationRef.current
          ) {
            setStoryData((prev) => ({
              ...prev,
              baselineGeometryMismatch: null,
              baselineAlignmentMismatch: null,
              baselineGeometryUnavailable:
                error instanceof Error
                  ? error.message
                  : "Preview geometry could not be measured.",
            }));
            return;
          }
        } finally {
          // ResizeObserver delivery for the verified viewport's restoration
          // can trail the transaction promise. Keep responsive invalidation
          // suppressed through two manager frames so it cannot tear down the
          // overlay immediately after applying the freshly measured layout.
          await waitTwoFrames();
          layoutMeasurementCountRef.current = Math.max(
            0,
            layoutMeasurementCountRef.current - 1,
          );
          measuringLayoutRef.current = layoutMeasurementCountRef.current > 0;
        }
        if (!layoutSnapshot) await waitTwoFrames();
      }

      if (
        requestGeneration !== selectionRequestGenerationRef.current ||
        !layoutSnapshot
      ) {
        return;
      }
      const payload = { index, images, layoutSnapshot };
      emitRef.current?.(EVENTS.SELECT_IMAGE, payload);
      await waitTwoFrames();
      if (requestGeneration !== selectionRequestGenerationRef.current) return;
      // Remount / soft-hide can leave the overlay missing or hidden — show
      // again after the canvas has had a chance to attach.
      emitRef.current?.(EVENTS.SELECT_IMAGE, payload);
      emitRef.current?.(EVENTS.SHOW_OVERLAY, {});
      emitRef.current?.(EVENTS.RESET_OVERLAY, {});
    },
    [waitForOverlayTeardown],
  );

  const emit = useChannel({
    [EVENTS.INIT_IMAGE]: (data: {
      images: VisualDeltaImage | VisualDeltaImage[];
      interactions?: VisualDeltaInteraction[];
      modes?: VisualDeltaModes;
      modeNames?: string[];
      storyId: string;
      storyName: string;
      layout?: StorybookLayoutMode | null;
      renderGeneration?: number;
      storyFinished?: boolean;
      opacity?: number;
      baselineLabelOffset?: { x: number; y: number };
      colorInversion?: boolean;
      placement?: PlacementMode;
      passThresholdPercent?: number;
      diffThreshold?: number;
      diffIncludeAntiAliasing?: boolean;
      delay?: number;
      ignoreSelectors?: string[];
      cropToViewport?: boolean;
      align?: AlignMode;
      previewSplitZoomDefault?: VisualDeltaZoomDefault;
      diffResultZoomDefault?: VisualDeltaZoomDefault;
      configUpdated?: boolean;
    }) => {
      if (currentStoryId && data.storyId !== currentStoryId) return;
      const incomingReadiness: PreviewReadiness = {
        storyId: data.storyId,
        renderGeneration: data.renderGeneration ?? 0,
        storyFinished: data.storyFinished === true,
      };
      const currentReadiness: PreviewReadiness = {
        storyId: storyDataRef.current.storyId,
        renderGeneration: storyDataRef.current.renderGeneration,
        storyFinished: storyDataRef.current.storyFinished,
      };
      if (!mergeInitReadiness(currentReadiness, incomingReadiness)) return;
      selectionContextRef.current = {
        storyId: data.storyId,
        layout: data.layout ?? null,
        renderGeneration: data.renderGeneration ?? 0,
      };
      const imagesArray = Array.isArray(data.images)
        ? data.images
        : [data.images];
      const interactions = data.interactions ?? [];
      const prefs = prefsRef.current;
      const interactionSrcEarly =
        activeInteractionSrcRef.current ?? readPinnedInteractionSrc();
      if (interactionSrcEarly) {
        activeInteractionSrcRef.current = interactionSrcEarly;
      }
      const liveVisible =
        interactionSrcEarly != null ? true : prefs.liveVisible;
      if (!liveVisible) {
        placementBeforeImageOnlyRef.current = prefs.placement;
        styleBeforeImageOnlyRef.current = {
          opacity: prefs.opacity,
          colorInversion: prefs.colorInversion,
        };
      }
      setStoryData((prev) => {
        const readiness = mergeInitReadiness(
          {
            storyId: prev.storyId,
            renderGeneration: prev.renderGeneration,
            storyFinished: prev.storyFinished,
          },
          incomingReadiness,
        );
        if (!readiness) return prev;
        const resetDefaults =
          !prev.storyId ||
          prev.storyId !== data.storyId ||
          data.configUpdated === true;
        const diagnosticsStale =
          resetDefaults ||
          prev.renderGeneration !== (data.renderGeneration ?? 0);
        const resolvedPlacement =
          interactionSrcEarly != null
            ? "center"
            : liveVisible
              ? resetDefaults
                ? (data.placement ?? prefs.placement)
                : prefs.placement
              : "center";
        const resolvedOpacity =
          liveVisible && resetDefaults && typeof data.opacity === "number"
            ? data.opacity
            : liveVisible
              ? prefs.opacity
              : 1;
        // Create/unskip can HMR an empty parameters payload after the panel
        // already hydrated the new PNG — don't wipe the gallery for that race.
        if (
          imagesArray.length === 0 &&
          prev.images.length > 0 &&
          prev.storyId === data.storyId
        ) {
          return {
            ...prev,
            storyName: data.storyName,
            layout: data.layout ?? null,
            renderGeneration: readiness.renderGeneration,
            storyFinished: readiness.storyFinished,
            interactions:
              interactions.length > 0 ? interactions : prev.interactions,
          };
        }
        if (prev.storyId && prev.storyId !== data.storyId) {
          pinInteractionSrc(activeInteractionSrcRef, null);
        }
        const primaryImages = withPlacement(imagesArray, resolvedPlacement);
        primaryImagesRef.current = primaryImages;
        const interactionSrc =
          activeInteractionSrcRef.current ?? readPinnedInteractionSrc();
        if (interactionSrc) activeInteractionSrcRef.current = interactionSrc;
        const wiredInteraction = interactionSrc
          ? interactions.find(
              (item) => (item.src.split("?")[0] ?? item.src) === interactionSrc,
            )
          : undefined;
        const images =
          interactionSrc != null
            ? withPlacement(
                [
                  {
                    src: `${wiredInteraction?.src.split("?")[0] ?? interactionSrc}?t=${Date.now()}`,
                    offsetX: 0,
                    offsetY: 0,
                    align: data.align ?? prev.effectiveAlign,
                    placement: resolvedPlacement,
                  },
                ],
                resolvedPlacement,
              )
            : primaryImages;
        // Keep gallery index whenever baselines exist. Soft-hide only clears
        // overlay visibility (`overlayOn` / previewIndex), not Diff selection.
        const selection = initImageSelection({
          imageCount: images.length,
          overlayOnPref: prefs.overlayOn,
          liveVisible,
          interactionPinned: interactionSrc != null,
        });
        const modes = data.modes ?? {};
        const modeNames = data.modeNames ?? Object.keys(modes);
        const next: StoryData = {
          images,
          interactions,
          modes,
          modeNames,
          selectedMode:
            prev.storyId === data.storyId ? prev.selectedMode : null,
          storyId: data.storyId,
          storyName: data.storyName,
          layout: data.layout ?? null,
          renderGeneration: readiness.renderGeneration,
          storyFinished: readiness.storyFinished,
          index: selection.index,
          overlayOn: selection.overlayOn,
          opacity: resolvedOpacity,
          baselineLabelOffset: data.baselineLabelOffset ?? {
            x: 0,
            y: 0,
          },
          colorInversion: liveVisible ? prefs.colorInversion : false,
          placement: resolvedPlacement,
          liveVisible,
          passThresholdByEngine: {
            html: prefs.passThresholdByEngine.html,
            // CSF threshold aligns with Playwright / Chromium Diff.
            chromium:
              typeof data.passThresholdPercent === "number"
                ? data.passThresholdPercent
                : prefs.passThresholdByEngine.chromium,
          },
          diffThreshold: data.diffThreshold ?? DEFAULT_DIFF_THRESHOLD,
          diffIncludeAntiAliasing: data.diffIncludeAntiAliasing ?? false,
          delay: typeof data.delay === "number" ? data.delay : 0,
          ignoreSelectors: data.ignoreSelectors ?? [],
          cropToViewport: data.cropToViewport ?? false,
          effectiveAlign:
            data.align ?? primaryImages[0]?.align ?? prev.effectiveAlign,
          previewSplitZoomDefault: data.previewSplitZoomDefault ?? "fit",
          diffResultZoomDefault: data.diffResultZoomDefault ?? "100%",
          splitZoom: resetDefaults
            ? compareZoomFromDefault(data.previewSplitZoomDefault ?? "fit")
            : prev.splitZoom,
          baselineGeometryMismatch:
            prev.storyId === data.storyId && !diagnosticsStale
              ? prev.baselineGeometryMismatch
              : null,
          baselineAlignmentMismatch:
            prev.storyId === data.storyId && !diagnosticsStale
              ? prev.baselineAlignmentMismatch
              : null,
          baselineGeometryUnavailable:
            prev.storyId === data.storyId && !diagnosticsStale
              ? prev.baselineGeometryUnavailable
              : null,
        };
        emitRef.current?.(EVENTS.UPDATE_OVERLAY_STYLE, {
          opacity: next.opacity,
          colorInversion: next.colorInversion,
          placement: next.placement,
          liveVisible: next.liveVisible,
          baselineLabelOffset: next.baselineLabelOffset,
          splitZoom: next.splitZoom,
          cropToViewport: next.cropToViewport,
        });
        void selectImage(selection.previewIndex, images);
        return next;
      });
    },
    [EVENTS.PREVIEW_READY]: (data: PreviewReadiness) => {
      if (currentStoryId && data.storyId !== currentStoryId) return;
      setStoryData((prev) => {
        const readiness = mergeStoryFinished(
          {
            storyId: prev.storyId,
            renderGeneration: prev.renderGeneration,
            storyFinished: prev.storyFinished,
          },
          data,
        );
        return readiness
          ? { ...prev, storyFinished: readiness.storyFinished }
          : prev;
      });
    },
    [EVENTS.OVERLAY_LISTENER_READY]: (payload?: { storyId?: string }) => {
      // Decorator remounted after GOTO / FORCE_REMOUNT — push current selection
      // again now that the preview listener is subscribed.
      setStoryData((prev) => {
        // Preview moved to a different story than panel state — clear the stale
        // overlay and ask for INIT instead of re-painting the previous baseline.
        if (
          payload?.storyId &&
          prev.storyId &&
          payload.storyId !== prev.storyId
        ) {
          emitRef.current?.(EVENTS.REQUEST_INIT_IMAGE, {
            storyId: payload.storyId,
          });
          void selectImage(-1, []);
          return prev;
        }
        // Preview just came up without INIT reaching us — ask again.
        if (
          !prev.storyId ||
          (payload?.storyId && prev.storyId !== payload.storyId)
        ) {
          emitRef.current?.(EVENTS.REQUEST_INIT_IMAGE, {
            storyId: payload?.storyId,
          });
        }
        if (prev.index < 0 || prev.images.length === 0 || !prev.overlayOn) {
          // No baseline, or soft-hidden — keep panel index but leave preview clear.
          void selectImage(-1, []);
          return prev;
        }
        emitRef.current?.(EVENTS.UPDATE_OVERLAY_STYLE, {
          opacity: prev.opacity,
          colorInversion: prev.colorInversion,
          placement: prev.placement,
          liveVisible: prev.liveVisible,
          baselineLabelOffset: prev.baselineLabelOffset,
          splitZoom: prev.splitZoom,
          cropToViewport: prev.cropToViewport,
        });
        void selectImage(prev.index, prev.images);
        return prev;
      });
    },
    [EVENTS.OVERLAY_HIDDEN]: () => {
      const waiters = overlayHiddenWaitersRef.current.splice(0);
      for (const resolve of waiters) resolve();
    },
    [EVENTS.SPLIT_ZOOM_STATUS]: (data: CompareZoomState) => {
      setStoryData((prev) => {
        if (
          prev.splitZoom.mode === data.mode &&
          Math.abs(prev.splitZoom.scale - data.scale) < 0.0001
        ) {
          return prev;
        }
        return { ...prev, splitZoom: data };
      });
    },
    [EVENTS.BASELINE_GEOMETRY_STATUS]: (
      data: BaselineGeometryMismatch | null,
    ) => {
      setStoryData((prev) => ({
        ...prev,
        baselineGeometryMismatch: data,
        baselineGeometryUnavailable: null,
      }));
    },
    [EVENTS.BASELINE_ALIGNMENT_STATUS]: (
      data: BaselineAlignmentMismatch | null,
    ) => {
      setStoryData((prev) => ({
        ...prev,
        baselineAlignmentMismatch: data,
      }));
    },
  });
  emitRef.current = emit;

  useEffect(() => {
    const iframe = document.getElementById("storybook-preview-iframe");
    if (!(iframe instanceof HTMLIFrameElement) || !globalThis.ResizeObserver) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous = {
      width: iframe.clientWidth,
      height: iframe.clientHeight,
    };
    const observer = new ResizeObserver(() => {
      const next = { width: iframe.clientWidth, height: iframe.clientHeight };
      if (
        measuringLayoutRef.current ||
        (next.width === previous.width && next.height === previous.height)
      ) {
        previous = next;
        return;
      }
      previous = next;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const current = storyDataRef.current;
        if (
          measuringLayoutRef.current ||
          !current.overlayOn ||
          current.index < 0
        ) {
          return;
        }
        const image = current.images[current.index];
        if (!image) return;
        const viewport = viewportForImage(image);
        layoutCacheRef.current.delete(
          previewLayoutCacheKey({
            storyId: current.storyId,
            renderGeneration: current.renderGeneration,
            viewport,
          }),
        );
        void selectImage(current.index, current.images);
      }, 120);
    });
    observer.observe(iframe);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [selectImage]);

  // Keep prefsRef in sync if another tab updates storage.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SETTINGS_STORAGE_KEY) return;
      prefsRef.current = loadSettings();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setIndex = useCallback(
    (index: number) => {
      setStoryData((prev) => {
        const next = { ...prev, index, overlayOn: index >= 0 };
        persist(next);
        void selectImage(index, prev.images);
        return next;
      });
    },
    [persist, selectImage],
  );

  const hideOverlay = useCallback(() => {
    emitRef.current?.(EVENTS.HIDE_OVERLAY, {});
  }, []);

  const showOverlay = useCallback(() => {
    emitRef.current?.(EVENTS.SHOW_OVERLAY, {});
  }, []);

  const emitStyle = useCallback(
    (
      next: Pick<
        StoryData,
        | "opacity"
        | "colorInversion"
        | "placement"
        | "liveVisible"
        | "baselineLabelOffset"
        | "splitZoom"
        | "cropToViewport"
      >,
    ) => {
      emitRef.current?.(EVENTS.UPDATE_OVERLAY_STYLE, {
        opacity: next.opacity,
        colorInversion: next.colorInversion,
        placement: next.placement,
        liveVisible: next.liveVisible,
        baselineLabelOffset: next.baselineLabelOffset,
        splitZoom: next.splitZoom,
        cropToViewport: next.cropToViewport,
      });
    },
    [],
  );

  const setOpacity = useCallback(
    (opacity: number) => {
      setStoryData((prev) => {
        const next = { ...prev, opacity };
        persist(next);
        emitStyle(next);
        return next;
      });
    },
    [emitStyle, persist],
  );

  const setColorInversion = useCallback(
    (colorInversion: boolean) => {
      setStoryData((prev) => {
        const next = { ...prev, colorInversion };
        persist(next);
        emitStyle(next);
        return next;
      });
    },
    [emitStyle, persist],
  );

  const setSplitZoom = useCallback(
    (splitZoom: CompareZoomState) => {
      setStoryData((prev) => {
        const next = { ...prev, splitZoom };
        emitStyle(next);
        return next;
      });
    },
    [emitStyle],
  );

  const setPlacement = useCallback(
    (placement: PlacementMode) => {
      setStoryData((prev) => {
        const images = withPlacement(prev.images, placement);
        const opacity = opacityForPlacementChange(
          prev.placement,
          placement,
          prev.opacity,
        );
        const next = {
          ...prev,
          placement,
          images,
          opacity,
          splitZoom: compareZoomFromDefault("fit"),
        };
        persist(next);
        emitStyle(next);
        void selectImage(prev.index, images);
        return next;
      });
    },
    [emitStyle, persist, selectImage],
  );

  /**
   * Direction pad: pick a position (shows overlay), or click the active
   * position again to soft-hide. Soft-hide keeps gallery selection but tears
   * down overlay/split DOM so the live canvas reclaims full preview space.
   */
  const togglePlacement = useCallback(
    (placement: PlacementMode) => {
      setStoryData((prev) => {
        const action = placementToggleAction(
          {
            overlayOn: prev.overlayOn,
            placement: prev.placement,
            index: prev.index,
            imageCount: prev.images.length,
            opacity: prev.opacity,
          },
          placement,
        );
        if (action.type === "soft-hide") {
          // Keep gallery index + placement for soft-show / DiffResult. Tear
          // down overlay/split only — pad shows nothing pressed, live canvas
          // unlocks to natural size (no forced center). Do not emitStyle:
          // an UPDATE after HIDE can resurrect a ghost overlay.
          const next = { ...prev, overlayOn: false };
          persist(next);
          hideOverlay();
          return next;
        }

        const images = withPlacement(prev.images, action.placement);
        const next = {
          ...prev,
          placement: action.placement,
          images,
          opacity: action.opacity,
          index: action.index,
          overlayOn: action.index >= 0,
          splitZoom: compareZoomFromDefault("fit"),
        };
        persist(next);
        emitStyle(next);
        // Always re-SELECT (not bare SHOW) so soft-show still works after
        // remount / HMR cleared preview lastSelection.
        void selectImage(action.index, images);
        return next;
      });
    },
    [emitStyle, hideOverlay, persist, selectImage],
  );

  /**
   * Eye toggle: live story visible (default) vs image-only.
   * Image-only forces center overlay on and hides the live canvas.
   */
  const setLiveVisible = useCallback(
    (liveVisible: boolean) => {
      setStoryData((prev) => {
        if (liveVisible === prev.liveVisible) return prev;

        if (!liveVisible) {
          placementBeforeImageOnlyRef.current = prev.placement;
          styleBeforeImageOnlyRef.current = {
            opacity: prev.opacity,
            colorInversion: prev.colorInversion,
          };
          const images = withPlacement(prev.images, "center");
          const index =
            prev.images.length > 0 ? (prev.index >= 0 ? prev.index : 0) : -1;
          const next: StoryData = {
            ...prev,
            liveVisible: false,
            placement: "center",
            images,
            index,
            overlayOn: index >= 0,
            opacity: 1,
            colorInversion: false,
          };
          persist(next);
          emitStyle(next);
          void selectImage(index, images);
          return next;
        }

        const restored = placementBeforeImageOnlyRef.current ?? prev.placement;
        const priorStyle = styleBeforeImageOnlyRef.current;
        placementBeforeImageOnlyRef.current = null;
        styleBeforeImageOnlyRef.current = null;
        const images = withPlacement(prev.images, restored);
        const opacity = isSplitPlacement(restored)
          ? 1
          : (priorStyle?.opacity ?? prev.opacity);
        const next: StoryData = {
          ...prev,
          liveVisible: true,
          placement: restored,
          images,
          opacity,
          colorInversion: priorStyle?.colorInversion ?? prev.colorInversion,
          overlayOn: prev.index >= 0,
        };
        persist(next);
        emitStyle(next);
        void selectImage(prev.index, images);
        return next;
      });
    },
    [emitStyle, persist, selectImage],
  );

  const setPassThresholdPercent = useCallback(
    (engine: DiffCaptureEngine, passThresholdPercent: number) => {
      setStoryData((prev) => {
        const next = {
          ...prev,
          passThresholdByEngine: {
            ...prev.passThresholdByEngine,
            [engine]: passThresholdPercent,
          },
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const resetOverlay = useCallback(() => {
    emitRef.current?.(EVENTS.RESET_OVERLAY, {});
  }, []);

  const resetSettings = useCallback(() => {
    clearSettings();
    const defaults = { ...DEFAULT_SETTINGS };
    prefsRef.current = defaults;
    setStoryData((prev) => {
      const images = withPlacement(prev.images, defaults.placement);
      const selection = initImageSelection({
        imageCount: images.length,
        overlayOnPref: defaults.overlayOn,
        liveVisible: defaults.liveVisible,
        interactionPinned: false,
      });
      placementBeforeImageOnlyRef.current = null;
      styleBeforeImageOnlyRef.current = null;
      const next: StoryData = {
        ...prev,
        images,
        index: selection.index,
        overlayOn: selection.overlayOn,
        opacity: defaults.opacity,
        colorInversion: defaults.colorInversion,
        placement: defaults.placement,
        liveVisible: defaults.liveVisible,
        passThresholdByEngine: { ...defaults.passThresholdByEngine },
        splitZoom: compareZoomFromDefault("fit"),
      };
      emitStyle(next);
      void selectImage(selection.previewIndex, images);
      return next;
    });
  }, [emitStyle, selectImage]);

  /** Bust cache on baseline URLs after on-disk snapshots are regenerated. */
  const reloadBaselineImages = useCallback(() => {
    const bust = `t=${Date.now()}`;
    setStoryData((prev) => {
      const images = prev.images.map((img) => {
        const base = img.src.split("?")[0] ?? img.src;
        return { ...img, src: `${base}?${bust}` };
      });
      const next = {
        ...prev,
        images,
        baselineGeometryMismatch: null,
        baselineAlignmentMismatch: null,
        baselineGeometryUnavailable: null,
      };
      void selectImage(prev.index, images);
      return next;
    });
  }, [selectImage]);

  /** Drop diagnostics that belong to a superseded baseline/config revision. */
  const clearBaselineDiagnostics = useCallback(() => {
    selectionRequestGenerationRef.current += 1;
    layoutCacheRef.current.clear();
    setStoryData((prev) => ({
      ...prev,
      baselineGeometryMismatch: null,
      baselineAlignmentMismatch: null,
      baselineGeometryUnavailable: null,
    }));
    emitRef.current?.(EVENTS.HIDE_OVERLAY, {});
  }, []);

  /**
   * After create/update: bust image cache, force center overlay on, and show
   * the live story under it for review. When images are not loaded yet (create
   * empty-state), still persist center + overlayOn for the next INIT_IMAGE.
   */
  const revealCenteredOverlay = useCallback(() => {
    const bust = `t=${Date.now()}`;
    setStoryData((prev) => {
      const patch = revealCenteredOverlayPatch({
        index: prev.index,
        imageCount: prev.images.length,
        placement: prev.placement,
        opacity: prev.opacity,
      });
      if (prev.images.length === 0) {
        const next: StoryData = {
          ...prev,
          ...patch,
          baselineGeometryMismatch: null,
          baselineAlignmentMismatch: null,
          baselineGeometryUnavailable: null,
        };
        persist(next);
        return next;
      }
      const images = withPlacement(
        prev.images.map((img) => {
          const base = img.src.split("?")[0] ?? img.src;
          return { ...img, src: `${base}?${bust}` };
        }),
        "center",
      );
      const next: StoryData = {
        ...prev,
        ...patch,
        images,
        baselineGeometryMismatch: null,
        baselineAlignmentMismatch: null,
        baselineGeometryUnavailable: null,
      };
      persist(next);
      emitStyle(next);
      void selectImage(patch.index, images);
      return next;
    });
  }, [emitStyle, persist, selectImage]);

  /**
   * Seed gallery/overlay from known baseline URLs when CSF HMR has not yet
   * re-emitted INIT_IMAGE (create no-op patch / already-wired stories).
   */
  const hydrateBaselineImages = useCallback(
    (srcs: string[]) => {
      if (srcs.length === 0) return;
      const bust = `t=${Date.now()}`;
      setStoryData((prev) => {
        const images = withPlacement(
          srcs.map((src) => {
            const base = src.split("?")[0] ?? src;
            return {
              src: `${base}?${bust}`,
              offsetX: 0,
              offsetY: 0,
              align: prev.effectiveAlign,
              placement: "center" as const,
            };
          }),
          "center",
        );
        primaryImagesRef.current = images;
        const patch = revealCenteredOverlayPatch({
          index: 0,
          imageCount: images.length,
          placement: "center",
          opacity: prev.opacity,
        });
        const next: StoryData = {
          ...prev,
          ...patch,
          images,
          placement: "center",
          baselineGeometryMismatch: null,
          baselineAlignmentMismatch: null,
          baselineGeometryUnavailable: null,
        };
        persist(next);
        emitStyle(next);
        void selectImage(patch.index, images);
        return next;
      });
    },
    [emitStyle, persist, selectImage],
  );

  /** Remove one exact primary image from the live gallery after local delete. */
  const removeBaselineImage = useCallback(
    (src: string) => {
      const target = src.split("?")[0] ?? src;
      pinInteractionSrc(activeInteractionSrcRef, null);
      setStoryData((prev) => {
        const primary = primaryImagesRef.current.filter(
          (image) => (image.src.split("?")[0] ?? image.src) !== target,
        );
        primaryImagesRef.current = primary;
        const images = withPlacement(primary, prev.placement);
        const index =
          images.length > 0
            ? Math.min(Math.max(prev.index, 0), images.length - 1)
            : -1;
        const next: StoryData = {
          ...prev,
          images,
          index,
          overlayOn: index >= 0,
          selectedMode: null,
          baselineGeometryMismatch: null,
          baselineAlignmentMismatch: null,
          baselineGeometryUnavailable: null,
        };
        persist(next);
        emitStyle(next);
        void selectImage(index, images);
        return next;
      });
    },
    [emitStyle, persist, selectImage],
  );

  /**
   * Unblock the panel when preview INIT_IMAGE is missed (slow iframe, channel
   * race after Storybook restart). Sets story identity and optionally hydrates
   * baseline URLs from the manager index.
   */
  const seedStoryFromManager = useCallback(
    (args: {
      storyId: string;
      storyName: string;
      imageSrcs?: string[];
      align?: AlignMode;
    }) => {
      const { storyId, storyName, imageSrcs, align } = args;
      if (!storyId) return;
      setStoryData((prev) => {
        if (
          prev.storyId === storyId &&
          (prev.images.length > 0 || !imageSrcs?.length)
        ) {
          return prev.storyName === storyName ? prev : { ...prev, storyName };
        }
        const bust = `t=${Date.now()}`;
        const images =
          imageSrcs && imageSrcs.length > 0
            ? withPlacement(
                imageSrcs.map((src) => {
                  const base = src.split("?")[0] ?? src;
                  return {
                    src: `${base}?${bust}`,
                    offsetX: 0,
                    offsetY: 0,
                    align: align ?? prev.effectiveAlign,
                    placement: "center" as const,
                  };
                }),
                "center",
              )
            : prev.storyId === storyId
              ? prev.images
              : [];
        if (images.length > 0) primaryImagesRef.current = images;
        const hasImages = images.length > 0;
        const patch = hasImages
          ? revealCenteredOverlayPatch({
              index: 0,
              imageCount: images.length,
              placement: "center",
              opacity: prev.opacity,
            })
          : null;
        const next: StoryData = {
          ...prev,
          ...(patch ?? {}),
          storyId,
          storyName,
          renderGeneration:
            prev.storyId === storyId ? prev.renderGeneration : 0,
          storyFinished: prev.storyId === storyId ? prev.storyFinished : false,
          images,
          effectiveAlign: align ?? prev.effectiveAlign,
          placement: hasImages ? "center" : prev.placement,
          index: patch
            ? patch.index
            : prev.storyId === storyId
              ? prev.index
              : -1,
          overlayOn: patch
            ? patch.overlayOn
            : prev.storyId === storyId
              ? prev.overlayOn
              : false,
        };
        persist(next);
        if (hasImages) {
          emitStyle(next);
          void selectImage(next.index, images);
        } else if (prev.storyId !== storyId) {
          // New story with no baselines — clear any previous story's overlay.
          void selectImage(-1, []);
        }
        return next;
      });
    },
    [emitStyle, persist, selectImage],
  );

  /**
   * Show a mid-play interaction PNG in the overlay.
   * Force center placement so the (often short) interaction capture is visible
   * over the live canvas — split panes sized for the primary baseline leave a
   * short strip looking like a missing overlay.
   * Primary end-of-play gallery is kept in `primaryImagesRef`.
   */
  const selectInteractionBaseline = useCallback(
    (src: string) => {
      const base = src.split("?")[0] ?? src;
      pinInteractionSrc(activeInteractionSrcRef, base);
      setStoryData((prev) => {
        const currentBase = prev.images[0]?.src?.split("?")[0] ?? "";
        // Already pinned on this PNG — skip cache-bust churn (accordion
        // re-pins after GOTO would otherwise reload overlay + panel diffs).
        if (
          currentBase === base &&
          prev.index === 0 &&
          prev.images.length === 1 &&
          prev.overlayOn &&
          prev.placement === "center"
        ) {
          return prev;
        }
        const bust = `t=${Date.now()}`;
        const placement: PlacementMode = "center";
        const opacity = opacityForPlacementChange(
          prev.placement,
          placement,
          prev.opacity,
        );
        const image: VisualDeltaImage = {
          src: `${base}?${bust}`,
          offsetX: 0,
          offsetY: 0,
          align: prev.effectiveAlign,
          placement,
        };
        const images = withPlacement([image], placement);
        const next: StoryData = {
          ...prev,
          images,
          index: 0,
          overlayOn: true,
          liveVisible: true,
          placement,
          opacity,
        };
        persist(next);
        emitStyle(next);
        void selectImage(0, images);
        return next;
      });
    },
    [emitStyle, persist, selectImage],
  );

  /** Restore end-of-play gallery images (Default tab). */
  const restorePrimaryBaselines = useCallback(() => {
    pinInteractionSrc(activeInteractionSrcRef, null);
    setStoryData((prev) => {
      const images = withPlacement(primaryImagesRef.current, prev.placement);
      const hasImages = images.length > 0;
      const next: StoryData = {
        ...prev,
        images,
        index: hasImages ? 0 : -1,
        overlayOn: hasImages,
      };
      persist(next);
      emitStyle(next);
      void selectImage(next.index, images);
      return next;
    });
  }, [emitStyle, persist, selectImage]);

  const hydrateInteractions = useCallback((next: VisualDeltaInteraction[]) => {
    setStoryData((prev) => ({ ...prev, interactions: next }));
  }, []);

  /**
   * Select a Chromatic-style mode: pin matching gallery image (if any) and
   * store the mode name so the panel can apply Storybook globals.
   */
  const setSelectedMode = useCallback(
    (modeName: string | null) => {
      setStoryData((prev) => {
        if (modeName == null) {
          const images = withPlacement(
            primaryImagesRef.current,
            prev.placement,
          );
          const index = images.length > 0 ? 0 : -1;
          const next: StoryData = {
            ...prev,
            selectedMode: null,
            images,
            index,
            overlayOn: index >= 0,
          };
          void selectImage(index, images);
          return next;
        }
        const primary = primaryImagesRef.current;
        const modeIndex = primary.findIndex((img) => img.mode === modeName);
        if (modeIndex >= 0) {
          const next: StoryData = {
            ...prev,
            selectedMode: modeName,
            images: primary,
            index: modeIndex,
            overlayOn: true,
          };
          void selectImage(modeIndex, primary);
          return next;
        }
        return { ...prev, selectedMode: modeName };
      });
    },
    [selectImage],
  );

  return {
    ...storyData,
    primaryImages: primaryImagesRef.current,
    setIndex,
    setOpacity,
    setColorInversion,
    setSplitZoom,
    setPlacement,
    togglePlacement,
    setLiveVisible,
    setPassThresholdPercent,
    setSelectedMode,
    hideOverlay,
    showOverlay,
    resetOverlay,
    resetSettings,
    reloadBaselineImages,
    clearBaselineDiagnostics,
    revealCenteredOverlay,
    hydrateBaselineImages,
    removeBaselineImage,
    seedStoryFromManager,
    selectInteractionBaseline,
    restorePrimaryBaselines,
    hydrateInteractions,
  };
}
