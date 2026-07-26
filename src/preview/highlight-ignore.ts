import { addons, useEffect } from "storybook/preview-api";
import type { DecoratorFunction } from "storybook/internal/types";
import { EVENTS } from "../constants.js";
import {
  countIgnoredElements,
  HIGHLIGHT_IGNORE_STYLE_ID,
  highlightIgnoreCss,
  resolveIgnoreSelectors,
} from "../shared/ignore.js";
import type { VisualDeltaParams } from "../constants.js";

function applyHighlight(enabled: boolean, selectors: readonly string[]) {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(HIGHLIGHT_IGNORE_STYLE_ID);
  existing?.remove();
  if (!enabled || selectors.length === 0) return;
  const style = document.createElement("style");
  style.id = HIGHLIGHT_IGNORE_STYLE_ID;
  style.textContent = highlightIgnoreCss(selectors);
  document.documentElement.appendChild(style);
}

let listenerInstalled = false;
let lastEnabled = false;
let lastSelectors: string[] = [];

function ensureListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  addons
    .getChannel()
    .on(
      EVENTS.SET_HIGHLIGHT_IGNORE,
      (payload: { enabled?: boolean; selectors?: string[] }) => {
        lastEnabled = Boolean(payload.enabled);
        lastSelectors = payload.selectors ?? lastSelectors;
        applyHighlight(lastEnabled, lastSelectors);
      },
    );
}

/** Preview decorator: apply ignore-region outline from manager toolbar. */
export const withHighlightIgnore: DecoratorFunction = (storyFn, context) => {
  ensureListener();
  const params = context.parameters?.visualDelta as
    | VisualDeltaParams
    | undefined;
  const selectors = resolveIgnoreSelectors(params?.ignoreSelectors);

  useEffect(() => {
    lastSelectors = selectors;
    applyHighlight(lastEnabled, selectors);
    const channel = addons.getChannel();
    let frame = 0;
    const publishCount = () => {
      frame = 0;
      channel.emit(EVENTS.IGNORE_REGIONS_STATUS, {
        storyId: context.id,
        count: countIgnoredElements(document, selectors),
      });
    };
    const scheduleCount = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(publishCount);
    };
    publishCount();
    const observer = new MutationObserver(scheduleCount);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      applyHighlight(false, []);
      channel.emit(EVENTS.IGNORE_REGIONS_STATUS, {
        storyId: context.id,
        count: 0,
      });
    };
  }, [context.id, selectors.join("\0")]);

  return storyFn();
};
