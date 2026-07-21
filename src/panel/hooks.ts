import { useCallback, useEffect, useRef, useState } from "react";
import { useChannel } from "storybook/manager-api";
import {
  EVENTS,
  isSplitPlacement,
  type PlacementMode,
  type VisualDeltaImage,
} from "../constants.js";
import {
  opacityForPlacementChange,
  placementToggleAction,
  revealCenteredOverlayPatch,
  shouldSoftShowOverlay,
} from "../shared/overlay-session.js";
import type { OverlayInfo } from "../types.js";
import {
  clearSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  SETTINGS_STORAGE_KEY,
  type VisualDeltaSettings,
} from "./settings.js";

type StoryData = {
  images: VisualDeltaImage[];
  storyId: string;
  storyName: string;
  index: number;
  /**
   * Whether the baseline overlay / split chrome is visible. Distinct from
   * `index`: hiding via the placement pad keeps the selected baseline so the
   * preview layout (width lock, split panes) does not jump.
   */
  overlayOn: boolean;
  opacity: number;
  colorInversion: boolean;
  placement: PlacementMode;
  /** False = image-only (live hidden, center overlay). Default true. */
  liveVisible: boolean;
  passThresholdPercent: number;
};

function waitTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export function useOverlayInfo() {
  const pendingRef = useRef(
    new Map<string, (info: OverlayInfo) => void>(),
  );
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

export function useStoryData() {
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
      storyId: "",
      storyName: "",
      index: -1,
      overlayOn: false,
      opacity: prefs.opacity,
      colorInversion: prefs.colorInversion,
      placement: liveVisible ? prefs.placement : "center",
      liveVisible,
      passThresholdPercent: prefs.passThresholdPercent,
    };
  });
  const emitRef = useRef<ReturnType<typeof useChannel> | null>(null);

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
      passThresholdPercent: next.passThresholdPercent,
    };
    prefsRef.current = settings;
    saveSettings(settings);
  }, []);

  const selectImage = useCallback(
    async (index: number, images: VisualDeltaImage[]) => {
      emitRef.current?.(EVENTS.SELECT_IMAGE, { index, images });
      if (index >= 0) {
        await waitTwoFrames();
        emitRef.current?.(EVENTS.RESET_OVERLAY, {});
      }
    },
    [],
  );

  const emit = useChannel({
    [EVENTS.INIT_IMAGE]: (data: {
      images: VisualDeltaImage | VisualDeltaImage[];
      storyId: string;
      storyName: string;
      opacity?: number;
      colorInversion?: boolean;
      placement?: PlacementMode;
      passThresholdPercent?: number;
    }) => {
      const imagesArray = Array.isArray(data.images)
        ? data.images
        : [data.images];
      const prefs = prefsRef.current;
      const liveVisible = prefs.liveVisible;
      const placement = liveVisible ? prefs.placement : "center";
      if (!liveVisible) {
        placementBeforeImageOnlyRef.current = prefs.placement;
        styleBeforeImageOnlyRef.current = {
          opacity: prefs.opacity,
          colorInversion: prefs.colorInversion,
        };
      }
      setStoryData((prev) => {
        // Create/unskip can HMR an empty parameters payload after the panel
        // already hydrated the new PNG — don't wipe the gallery for that race.
        if (
          imagesArray.length === 0 &&
          prev.images.length > 0 &&
          prev.storyId === data.storyId
        ) {
          return { ...prev, storyName: data.storyName };
        }
        const images = withPlacement(imagesArray, placement);
        const hasImages = images.length > 0;
        // Image-only always shows the overlay; otherwise respect overlayOn.
        const initialIndex =
          hasImages && (prefs.overlayOn || !liveVisible) ? 0 : -1;
        const next: StoryData = {
          images,
          storyId: data.storyId,
          storyName: data.storyName,
          index: initialIndex,
          overlayOn: initialIndex >= 0,
          opacity: liveVisible ? prefs.opacity : 1,
          colorInversion: liveVisible ? prefs.colorInversion : false,
          placement,
          liveVisible,
          passThresholdPercent: prefs.passThresholdPercent,
        };
        emitRef.current?.(EVENTS.UPDATE_OVERLAY_STYLE, {
          opacity: next.opacity,
          colorInversion: next.colorInversion,
          placement: next.placement,
          liveVisible: next.liveVisible,
        });
        void selectImage(initialIndex, images);
        return next;
      });
    },
  });
  emitRef.current = emit;

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
        "opacity" | "colorInversion" | "placement" | "liveVisible"
      >,
    ) => {
      emitRef.current?.(EVENTS.UPDATE_OVERLAY_STYLE, {
        opacity: next.opacity,
        colorInversion: next.colorInversion,
        placement: next.placement,
        liveVisible: next.liveVisible,
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

  const setPlacement = useCallback(
    (placement: PlacementMode) => {
      setStoryData((prev) => {
        const images = withPlacement(prev.images, placement);
        const opacity = opacityForPlacementChange(
          prev.placement,
          placement,
          prev.opacity,
        );
        const next = { ...prev, placement, images, opacity };
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
   * position again to soft-hide the overlay without tearing down compare
   * layout (width lock / split panes) so the live subject does not jump.
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
          const next = { ...prev, overlayOn: false };
          persist(next);
          hideOverlay();
          return next;
        }

        const images = withPlacement(prev.images, action.placement);
        const softShow = shouldSoftShowOverlay(
          {
            overlayOn: prev.overlayOn,
            placement: prev.placement,
            index: prev.index,
            imageCount: prev.images.length,
            opacity: prev.opacity,
          },
          action.placement,
          action.index,
        );
        const next = {
          ...prev,
          placement: action.placement,
          images,
          opacity: action.opacity,
          index: action.index,
          overlayOn: action.index >= 0,
        };
        persist(next);
        emitStyle(next);
        if (softShow) {
          showOverlay();
        } else {
          void selectImage(action.index, images);
        }
        return next;
      });
    },
    [emitStyle, hideOverlay, persist, selectImage, showOverlay],
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
            prev.images.length > 0
              ? prev.index >= 0
                ? prev.index
                : 0
              : -1;
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

        const restored =
          placementBeforeImageOnlyRef.current ?? prev.placement;
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
    (passThresholdPercent: number) => {
      setStoryData((prev) => {
        const next = { ...prev, passThresholdPercent };
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
      const index =
        defaults.overlayOn && images.length > 0 ? 0 : -1;
      placementBeforeImageOnlyRef.current = null;
      styleBeforeImageOnlyRef.current = null;
      const next: StoryData = {
        ...prev,
        images,
        index,
        overlayOn: index >= 0,
        opacity: defaults.opacity,
        colorInversion: defaults.colorInversion,
        placement: defaults.placement,
        liveVisible: defaults.liveVisible,
        passThresholdPercent: defaults.passThresholdPercent,
      };
      emitStyle(next);
      void selectImage(index, images);
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
      const next = { ...prev, images };
      void selectImage(prev.index, images);
      return next;
    });
  }, [selectImage]);

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
        const next: StoryData = { ...prev, ...patch };
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
              align: "canvas" as const,
              placement: "center" as const,
            };
          }),
          "center",
        );
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
        };
        persist(next);
        emitStyle(next);
        void selectImage(patch.index, images);
        return next;
      });
    },
    [emitStyle, persist, selectImage],
  );

  return {
    ...storyData,
    setIndex,
    setOpacity,
    setColorInversion,
    setPlacement,
    togglePlacement,
    setLiveVisible,
    setPassThresholdPercent,
    hideOverlay,
    showOverlay,
    resetOverlay,
    resetSettings,
    reloadBaselineImages,
    revealCenteredOverlay,
    hydrateBaselineImages,
  };
}
