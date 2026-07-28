import {
  VISUAL_DELTA_CAPTURE_PATH,
  VISUAL_DELTA_COMPARE_STORY_PATH,
} from "../constants.js";
import type {
  CaptureSubjectProgress,
  CaptureSubjectResult,
  CaptureSubjectStreamEvent,
} from "../shared/capture-subject-types.js";
import type {
  CompareStoryRequest,
  CompareStoryResult,
  CompareStoryStreamEvent,
} from "../shared/compare-story-types.js";
import { announceVisualDeltaChanges } from "../shared/change-events.js";

export type { CaptureSubjectProgress, CaptureSubjectStreamEvent };

/**
 * Ask Storybook middleware to capture the story subject with Playwright
 * Chromium. Streams NDJSON progress (launch → navigate → capture → done).
 */
export async function postChromiumSubjectCapture(
  body: {
    storyId: string;
    origin?: string;
    visualCaptureUntil?: string;
    visualCaptureCallId?: string;
    viewport?: { width: number; height: number };
    deviceScaleFactor?: number;
    delay?: number;
    ignoreSelectors?: string[];
    cropToViewport?: boolean;
  },
  options?: {
    onProgress?: (progress: CaptureSubjectProgress) => void;
    signal?: AbortSignal;
  },
): Promise<{ dataUrl: string; width: number; height: number }> {
  const origin =
    body.origin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const response = await fetch(VISUAL_DELTA_CAPTURE_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, origin }),
    signal: options?.signal,
  });

  if (!response.ok && !response.body) {
    throw new Error(`Chromium capture failed (${response.status})`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    let payload: CaptureSubjectResult | { ok: false; error: string };
    try {
      payload = (await response.json()) as
        | CaptureSubjectResult
        | { ok: false; error: string };
    } catch {
      throw new Error(
        `Chromium capture failed (${response.status}): empty response`,
      );
    }
    if (!("ok" in payload) || !payload.ok) {
      throw new Error(
        "error" in payload && typeof payload.error === "string"
          ? payload.error
          : `Chromium capture failed (${response.status})`,
      );
    }
    return {
      dataUrl: `data:image/png;base64,${payload.pngBase64}`,
      width: payload.width,
      height: payload.height,
    };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let doneResult: CaptureSubjectResult | null = null;
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let event: CaptureSubjectStreamEvent;
      try {
        event = JSON.parse(trimmed) as CaptureSubjectStreamEvent;
      } catch {
        continue;
      }
      if (event.type === "progress") {
        options?.onProgress?.({
          phase: event.phase,
          label: event.label,
        });
      } else if (event.type === "done") {
        doneResult = event;
      } else if (event.type === "error") {
        streamError = event.error;
      }
    }
  }

  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer.trim()) as CaptureSubjectStreamEvent;
      if (event.type === "done") doneResult = event;
      if (event.type === "error") streamError = event.error;
      if (event.type === "progress") {
        options?.onProgress?.({
          phase: event.phase,
          label: event.label,
        });
      }
    } catch {
      /* ignore trailing junk */
    }
  }

  if (streamError) throw new Error(streamError);
  if (!doneResult?.ok) {
    throw new Error(
      response.ok
        ? "Chromium capture finished without a PNG"
        : `Chromium capture failed (${response.status})`,
    );
  }

  return {
    dataUrl: `data:image/png;base64,${doneResult.pngBase64}`,
    width: doneResult.width,
    height: doneResult.height,
  };
}

/** Capture, compare, persist artifacts, and classify one exact live story. */
export async function postChromiumStoryCompare(
  body: Omit<CompareStoryRequest, "origin"> & { origin?: string },
  options?: {
    onProgress?: (progress: CaptureSubjectProgress) => void;
    signal?: AbortSignal;
  },
): Promise<CompareStoryResult> {
  const origin =
    body.origin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const response = await fetch(VISUAL_DELTA_COMPARE_STORY_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, origin }),
    signal: options?.signal,
  });
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`Chromium comparison failed (${response.status})`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let result: CompareStoryResult | null = null;
  let streamError: string | null = null;
  const consume = (line: string) => {
    if (!line.trim()) return;
    let event: CompareStoryStreamEvent;
    try {
      event = JSON.parse(line) as CompareStoryStreamEvent;
    } catch {
      return;
    }
    if (event.type === "progress") {
      options?.onProgress?.({ phase: event.phase, label: event.label });
    } else if (event.type === "done") {
      result = event;
    } else if (event.type === "error") {
      streamError = event.error;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consume(line);
  }
  buffer += decoder.decode();
  consume(buffer);

  if (streamError) throw new Error(streamError);
  const finalResult = result as CompareStoryResult | null;
  if (!finalResult) {
    throw new Error(
      response.ok
        ? "Chromium comparison ended without a result"
        : `Chromium comparison failed (${response.status})`,
    );
  }
  announceVisualDeltaChanges(finalResult.review?.changes);
  return finalResult;
}
