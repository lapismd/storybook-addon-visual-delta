import { useCallback, useEffect, useRef, useState } from "react";
import { useChannel } from "storybook/manager-api";
import {
  EVENTS,
  isSplitPlacement,
  type PlacementMode,
  type VisualDeltaImage,
} from "../constants.js";
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
  opacity: number;
  colorInversion: boolean;
  placement: PlacementMode;
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

function settingsFromStory(data: StoryData): VisualDeltaSettings {
  return {
    overlayOn: data.index >= 0,
    placement: data.placement,
    opacity: data.opacity,
    colorInversion: data.colorInversion,
    passThresholdPercent: data.passThresholdPercent,
  };
}

export function useStoryData() {
  const prefsRef = useRef<VisualDeltaSettings>(loadSettings());
  const [storyData, setStoryData] = useState<StoryData>(() => {
    const prefs = prefsRef.current;
    return {
      images: [],
      storyId: "",
      storyName: "",
      index: -1,
      opacity: prefs.opacity,
      colorInversion: prefs.colorInversion,
      placement: prefs.placement,
      passThresholdPercent: prefs.passThresholdPercent,
    };
  });
  const emitRef = useRef<ReturnType<typeof useChannel> | null>(null);

  const persist = useCallback((next: StoryData) => {
    const settings = settingsFromStory(next);
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
      const placement = prefs.placement;
      const images = withPlacement(imagesArray, placement);
      const hasImages = images.length > 0;
      const initialIndex =
        hasImages && prefs.overlayOn ? 0 : -1;
      const next: StoryData = {
        images,
        storyId: data.storyId,
        storyName: data.storyName,
        index: initialIndex,
        opacity: prefs.opacity,
        colorInversion: prefs.colorInversion,
        placement,
        passThresholdPercent: prefs.passThresholdPercent,
      };
      setStoryData(next);
      emitRef.current?.(EVENTS.UPDATE_OVERLAY_STYLE, {
        opacity: next.opacity,
        colorInversion: next.colorInversion,
        placement: next.placement,
      });
      void selectImage(initialIndex, images);
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
        const next = { ...prev, index };
        persist(next);
        void selectImage(index, prev.images);
        return next;
      });
    },
    [persist, selectImage],
  );

  const emitStyle = useCallback(
    (
      next: Pick<StoryData, "opacity" | "colorInversion" | "placement">,
    ) => {
      emitRef.current?.(EVENTS.UPDATE_OVERLAY_STYLE, {
        opacity: next.opacity,
        colorInversion: next.colorInversion,
        placement: next.placement,
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
        const opacity = isSplitPlacement(placement)
          ? isSplitPlacement(prev.placement)
            ? prev.opacity
            : 1
          : prev.placement === "center"
            ? prev.opacity
            : prev.opacity === 1
              ? 0.5
              : prev.opacity;
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
   * position again to hide the overlay.
   */
  const togglePlacement = useCallback(
    (placement: PlacementMode) => {
      setStoryData((prev) => {
        const overlayOn = prev.index >= 0;
        if (overlayOn && prev.placement === placement) {
          const next = { ...prev, index: -1 };
          persist(next);
          void selectImage(-1, prev.images);
          return next;
        }

        const images = withPlacement(prev.images, placement);
        const opacity = isSplitPlacement(placement)
          ? isSplitPlacement(prev.placement)
            ? prev.opacity
            : 1
          : prev.placement === "center"
            ? prev.opacity
            : prev.opacity === 1
              ? 0.5
              : prev.opacity;
        const index =
          overlayOn && prev.index >= 0
            ? prev.index
            : images.length > 0
              ? 0
              : -1;
        const next = { ...prev, placement, images, opacity, index };
        persist(next);
        emitStyle(next);
        void selectImage(index, images);
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

  const hideOverlay = useCallback(() => {
    emitRef.current?.(EVENTS.HIDE_OVERLAY, {});
  }, []);

  const showOverlay = useCallback(() => {
    emitRef.current?.(EVENTS.SHOW_OVERLAY, {});
  }, []);

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
      const next: StoryData = {
        ...prev,
        images,
        index,
        opacity: defaults.opacity,
        colorInversion: defaults.colorInversion,
        placement: defaults.placement,
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

  return {
    ...storyData,
    setIndex,
    setOpacity,
    setColorInversion,
    setPlacement,
    togglePlacement,
    setPassThresholdPercent,
    hideOverlay,
    showOverlay,
    resetOverlay,
    resetSettings,
    reloadBaselineImages,
  };
}
