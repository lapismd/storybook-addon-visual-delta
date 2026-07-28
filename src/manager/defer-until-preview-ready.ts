import { EVENTS } from "../constants.js";
import type { PreviewReadiness } from "../shared/baseline-readiness.js";

type PreviewChannel = {
  on(event: string, listener: (payload?: PreviewReadiness) => void): void;
  off(event: string, listener: (payload?: PreviewReadiness) => void): void;
  emit(event: string, payload?: unknown): void;
};

type DeferUntilPreviewReadyOptions = {
  channel: PreviewChannel;
  storyId?: string;
  callback: () => void;
  fallbackMs?: number;
};

/**
 * Keep expensive manager bootstrap requests behind exact preview readiness,
 * with a bounded fallback for Docs or unavailable preview channels.
 */
export function deferUntilPreviewReady({
  channel,
  storyId,
  callback,
  fallbackMs = 30_000,
}: DeferUntilPreviewReadyOptions): () => void {
  let active = true;
  const run = () => {
    if (!active) return;
    active = false;
    window.clearTimeout(fallback);
    channel.off(EVENTS.PREVIEW_READY, onReady);
    channel.off(EVENTS.INIT_IMAGE, onReady);
    callback();
  };
  const onReady = (payload?: PreviewReadiness) => {
    if (
      !payload?.storyFinished ||
      (storyId != null && payload.storyId !== storyId)
    ) {
      return;
    }
    run();
  };
  const fallback = window.setTimeout(run, fallbackMs);
  channel.on(EVENTS.PREVIEW_READY, onReady);
  channel.on(EVENTS.INIT_IMAGE, onReady);
  if (storyId) {
    channel.emit(EVENTS.REQUEST_INIT_IMAGE, { storyId });
  }
  return () => {
    if (!active) return;
    active = false;
    window.clearTimeout(fallback);
    channel.off(EVENTS.PREVIEW_READY, onReady);
    channel.off(EVENTS.INIT_IMAGE, onReady);
  };
}
