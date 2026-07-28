import { afterEach, describe, expect, it, vi } from "vitest";
import { EVENTS } from "../constants.js";
import type { PreviewReadiness } from "../shared/baseline-readiness.js";
import { deferUntilPreviewReady } from "./defer-until-preview-ready.js";

function channelFixture() {
  const listeners = new Map<
    string,
    Set<(payload?: PreviewReadiness) => void>
  >();
  return {
    on(event: string, listener: (payload?: PreviewReadiness) => void) {
      const eventListeners = listeners.get(event) ?? new Set();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
    },
    off(event: string, listener: (payload?: PreviewReadiness) => void) {
      listeners.get(event)?.delete(listener);
    },
    emit(event: string, payload?: unknown) {
      for (const listener of listeners.get(event) ?? []) {
        listener(payload as PreviewReadiness | undefined);
      }
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("deferUntilPreviewReady", () => {
  it("replays readiness and waits for the exact finished story", () => {
    vi.useFakeTimers();
    const channel = channelFixture();
    const callback = vi.fn();
    const emit = vi.spyOn(channel, "emit");

    deferUntilPreviewReady({
      channel,
      storyId: "button--primary",
      callback,
    });

    expect(emit).toHaveBeenCalledWith(EVENTS.REQUEST_INIT_IMAGE, {
      storyId: "button--primary",
    });
    channel.emit(EVENTS.PREVIEW_READY, {
      storyId: "card--primary",
      renderGeneration: 1,
      storyFinished: true,
    });
    channel.emit(EVENTS.INIT_IMAGE, {
      storyId: "button--primary",
      renderGeneration: 2,
      storyFinished: false,
    });
    expect(callback).not.toHaveBeenCalled();

    channel.emit(EVENTS.PREVIEW_READY, {
      storyId: "button--primary",
      renderGeneration: 2,
      storyFinished: true,
    });
    expect(callback).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(5_000);
    expect(callback).toHaveBeenCalledOnce();
  });

  it("uses a bounded fallback and supports cleanup", () => {
    vi.useFakeTimers();
    const channel = channelFixture();
    const callback = vi.fn();
    const cleanup = deferUntilPreviewReady({
      channel,
      callback,
      fallbackMs: 100,
    });

    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledOnce();

    cleanup();
    channel.emit(EVENTS.PREVIEW_READY, {
      storyId: "button--primary",
      renderGeneration: 1,
      storyFinished: true,
    });
    expect(callback).toHaveBeenCalledOnce();
  });
});
