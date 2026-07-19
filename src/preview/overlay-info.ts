import { useChannel } from "storybook/preview-api";
import type { DecoratorFunction } from "storybook/internal/types";
import { EVENTS } from "../constants.js";
import type { OverlayInfo } from "../types.js";

function parseTranslate(transform: string) {
  const match = transform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
  if (match?.[1] !== undefined && match[2] !== undefined) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    return {
      x: Number.isNaN(x) ? 0 : x,
      y: Number.isNaN(y) ? 0 : y,
    };
  }
  return { x: 0, y: 0 };
}

export const withOverlayInfo: DecoratorFunction = (storyFn) => {
  const emit = useChannel({
    [EVENTS.REQUEST_OVERLAY_INFO]: (data: { requestId: string }) => {
      const info: OverlayInfo = {
        iframe: null,
        overlay: null,
        image: null,
        cropArea: null,
      };
      const frameElement = window.frameElement;
      if (frameElement) {
        const iframeRect = frameElement.getBoundingClientRect();
        info.iframe = {
          left: iframeRect.left,
          top: iframeRect.top,
          width: iframeRect.width,
          height: iframeRect.height,
        };
      }
      const overlay = document.getElementById("visual-delta-overlay");
      if (overlay) {
        const overlayRect = overlay.getBoundingClientRect();
        const translate = parseTranslate(overlay.style.transform || "");
        info.overlay = {
          left: overlayRect.left,
          top: overlayRect.top,
          width: overlayRect.width,
          height: overlayRect.height,
          translateX: translate.x,
          translateY: translate.y,
        };
        const img = overlay.querySelector("img");
        if (img) {
          const imgRect = img.getBoundingClientRect();
          info.image = {
            left: imgRect.left,
            top: imgRect.top,
            width: imgRect.width,
            height: imgRect.height,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            src: img.src,
          };
          if (info.iframe) {
            info.cropArea = {
              x: info.iframe.left + imgRect.left,
              y: info.iframe.top + imgRect.top,
              width: imgRect.width,
              height: imgRect.height,
            };
          }
        }
      }
      emit(EVENTS.OVERLAY_INFO, {
        ...info,
        requestId: data.requestId,
      });
    },
  });
  return storyFn();
};
