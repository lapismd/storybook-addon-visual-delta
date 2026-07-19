import { useCallback, useRef, useState } from "react";
import { useChannel } from "storybook/manager-api";
import {
  DEFAULT_PASS_THRESHOLD_PERCENT,
  EVENTS,
  type VisualDeltaImage,
} from "../constants.js";
import type { OverlayInfo } from "../types.js";

const OVERLAY_INFO_EVENT = "visual-delta-overlay-info";
const OVERLAY_HIDDEN_EVENT = "visual-delta-overlay-hidden";

export function useOverlayInfo() {
  const emitRef = useRef<ReturnType<typeof useChannel> | null>(null);
  const emit = useChannel({
    [EVENTS.OVERLAY_INFO]: (data: OverlayInfo & { requestId: string }) => {
      const { requestId, ...overlayInfo } = data;
      window.dispatchEvent(
        new CustomEvent(OVERLAY_INFO_EVENT, {
          detail: { requestId, overlayInfo },
        }),
      );
    },
  });
  emitRef.current = emit;

  const getOverlayInfo = useCallback((): Promise<OverlayInfo> => {
    return new Promise((resolve, reject) => {
      const requestId = `overlay-info-${Date.now()}-${Math.random()}`;
      const timeout = setTimeout(() => {
        window.removeEventListener(OVERLAY_INFO_EVENT, handler);
        reject(new Error("Timed out waiting for overlay position info"));
      }, 5000);
      const handler = (event: Event) => {
        const customEvent = event as CustomEvent<{
          requestId: string;
          overlayInfo: OverlayInfo;
        }>;
        if (customEvent.detail?.requestId === requestId) {
          window.removeEventListener(OVERLAY_INFO_EVENT, handler);
          clearTimeout(timeout);
          resolve(customEvent.detail.overlayInfo);
        }
      };
      window.addEventListener(OVERLAY_INFO_EVENT, handler);
      emitRef.current?.(EVENTS.REQUEST_OVERLAY_INFO, { requestId });
    });
  }, []);

  return { getOverlayInfo };
}

export function useOverlayHidden() {
  useChannel({
    [EVENTS.OVERLAY_HIDDEN]: () => {
      window.dispatchEvent(new CustomEvent(OVERLAY_HIDDEN_EVENT));
    },
  });

  const waitForOverlayHidden = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener(OVERLAY_HIDDEN_EVENT, handler);
        reject(new Error("Timed out waiting for overlay to hide"));
      }, 5000);
      const handler = () => {
        window.removeEventListener(OVERLAY_HIDDEN_EVENT, handler);
        clearTimeout(timeout);
        resolve();
      };
      window.addEventListener(OVERLAY_HIDDEN_EVENT, handler);
    });
  }, []);

  return { waitForOverlayHidden };
}

type StoryData = {
  images: VisualDeltaImage[];
  storyId: string;
  storyName: string;
  index: number;
  opacity: number;
  colorInversion: boolean;
  passThresholdPercent: number;
};

export function useStoryData() {
  const [storyData, setStoryData] = useState<StoryData>({
    images: [],
    storyId: "",
    storyName: "",
    index: -1,
    opacity: 0.5,
    colorInversion: false,
    passThresholdPercent: DEFAULT_PASS_THRESHOLD_PERCENT,
  });
  const emitRef = useRef<ReturnType<typeof useChannel> | null>(null);
  const emit = useChannel({
    [EVENTS.INIT_IMAGE]: (data: {
      images: VisualDeltaImage | VisualDeltaImage[];
      storyId: string;
      storyName: string;
      opacity?: number;
      colorInversion?: boolean;
      passThresholdPercent?: number;
    }) => {
      const imagesArray = Array.isArray(data.images)
        ? data.images
        : [data.images];
      const initialIndex = imagesArray.length > 0 ? 0 : -1;
      setStoryData({
        images: imagesArray,
        storyId: data.storyId,
        storyName: data.storyName,
        index: initialIndex,
        opacity: data.opacity ?? 0.5,
        colorInversion: data.colorInversion ?? false,
        passThresholdPercent:
          data.passThresholdPercent ?? DEFAULT_PASS_THRESHOLD_PERCENT,
      });
      if (initialIndex >= 0) {
        queueMicrotask(() => {
          emitRef.current?.(EVENTS.SELECT_IMAGE, {
            index: initialIndex,
            images: imagesArray,
          });
        });
      }
    },
  });
  emitRef.current = emit;

  const setIndex = useCallback((index: number) => {
    setStoryData((prev) => {
      emitRef.current?.(EVENTS.SELECT_IMAGE, {
        index,
        images: prev.images,
      });
      return { ...prev, index };
    });
  }, []);

  const setOpacity = useCallback((opacity: number) => {
    setStoryData((prev) => {
      emitRef.current?.(EVENTS.UPDATE_OVERLAY_STYLE, {
        opacity,
        colorInversion: prev.colorInversion,
      });
      return { ...prev, opacity };
    });
  }, []);

  const setColorInversion = useCallback((colorInversion: boolean) => {
    setStoryData((prev) => {
      emitRef.current?.(EVENTS.UPDATE_OVERLAY_STYLE, {
        opacity: prev.opacity,
        colorInversion,
      });
      return { ...prev, colorInversion };
    });
  }, []);

  const setPassThresholdPercent = useCallback(
    (passThresholdPercent: number) => {
      setStoryData((prev) => ({ ...prev, passThresholdPercent }));
    },
    [],
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

  return {
    ...storyData,
    setIndex,
    setOpacity,
    setColorInversion,
    setPassThresholdPercent,
    hideOverlay,
    showOverlay,
    resetOverlay,
  };
}
