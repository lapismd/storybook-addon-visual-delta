import { addons } from "storybook/preview-api";
import {
  EVENTS as INSTRUMENTER_EVENTS,
  type Call,
} from "storybook/internal/instrumenter";
import type { ProjectAnnotations, Renderer } from "storybook/internal/types";
import { EVENTS, KEY } from "./constants.js";
import { withCaptureParams } from "./preview/capture-params.js";
import { withCaptureReady } from "./preview/capture-ready.js";
import { withHighlightIgnore } from "./preview/highlight-ignore.js";
import { withInitImage } from "./preview/init.js";
import { withOverlayInfo } from "./preview/overlay-info.js";
import { ensureOverlayChannel, withSelectImage } from "./preview/overlay.js";
import {
  VISUAL_CAPTURE_READY_ATTR,
  VISUAL_CAPTURE_STEP_ATTR,
  readVisualCaptureCall,
  readVisualCaptureUntil,
  setVisualCaptureUntilSession,
  slugifyStepLabel,
} from "./shared/interaction-capture.js";
import { afterPlayStep } from "./shared/visual-capture-step.js";

/** Per-story named steps discovered during the current play run. */
const playStepsByStory = new Map<
  string,
  Array<{ label: string; stepId: string }>
>();

let runUntilListenerInstalled = false;
let callCaptureListenerInstalled = false;
let activeCallCapture:
  | {
      storyId: string;
      callId: string;
      interactionId: string;
      started: boolean;
      ready: boolean;
    }
  | undefined;

function publishCallCaptureReady(call: Call) {
  const capture = activeCallCapture;
  if (
    !capture ||
    capture.ready ||
    call.storyId !== capture.storyId ||
    call.id !== capture.callId ||
    (call.status !== "done" && call.status !== "error")
  ) {
    return;
  }
  capture.ready = true;
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute(
      VISUAL_CAPTURE_STEP_ATTR,
      capture.interactionId,
    );
    document.documentElement.setAttribute(
      VISUAL_CAPTURE_READY_ATTR,
      capture.interactionId,
    );
  }
  addons.getChannel().emit(EVENTS.VISUAL_CAPTURE_PARKED, {
    storyId: capture.storyId,
    stepId: capture.interactionId,
  });
}

function ensureCallCapture(storyId: string) {
  const callId = readVisualCaptureCall();
  const interactionId = readVisualCaptureUntil();
  if (!callId || !interactionId) {
    activeCallCapture = undefined;
    return;
  }
  if (!callCaptureListenerInstalled) {
    callCaptureListenerInstalled = true;
    addons.getChannel().on(INSTRUMENTER_EVENTS.CALL, publishCallCaptureReady);
  }
  if (
    activeCallCapture?.storyId !== storyId ||
    activeCallCapture.callId !== callId ||
    activeCallCapture.interactionId !== interactionId
  ) {
    activeCallCapture = {
      storyId,
      callId,
      interactionId,
      started: false,
      ready: false,
    };
  }
  if (activeCallCapture.started) return;
  activeCallCapture.started = true;
  // The instrumenter is installed before decorators run. Starting in a
  // microtask lets the current render complete, then remounts once in debugger
  // mode with playUntil set to the selected deterministic call.
  queueMicrotask(() => {
    addons.getChannel().emit(INSTRUMENTER_EVENTS.START, {
      storyId,
      playUntil: callId,
    });
  });
}

function ensureRunUntilListener() {
  if (runUntilListenerInstalled) return;
  runUntilListenerInstalled = true;
  ensureOverlayChannel();
  addons
    .getChannel()
    .on(
      EVENTS.RUN_UNTIL_STEP,
      (payload: { storyId?: string; stepId?: string | null }) => {
        setVisualCaptureUntilSession(payload.stepId ?? null);
      },
    );
}

function emitPlaySteps(storyId: string) {
  const channel = addons.getChannel();
  channel.emit(EVENTS.PLAY_STEPS, {
    storyId,
    steps: [...(playStepsByStory.get(storyId) ?? [])],
  });
}

const preview: ProjectAnnotations<Renderer> = {
  decorators: [
    withCaptureReady,
    withCaptureParams,
    withHighlightIgnore,
    withInitImage,
    withSelectImage,
    withOverlayInfo,
    (storyFn, context) => {
      ensureRunUntilListener();
      ensureCallCapture(context.id);
      if (typeof document !== "undefined") {
        // Clear stale mid-play markers when the story remounts.
        document.documentElement.removeAttribute(VISUAL_CAPTURE_STEP_ATTR);
        document.documentElement.removeAttribute(VISUAL_CAPTURE_READY_ATTR);
      }
      // Reset discovered steps when navigating to a different story.
      if (context.id && !playStepsByStory.has(context.id)) {
        for (const key of playStepsByStory.keys()) {
          if (key !== context.id) playStepsByStory.delete(key);
        }
      }
      return storyFn();
    },
  ],
  /**
   * After each named `step()`, publish the label to Visual Delta and park when
   * `?visualCaptureUntil=` / session flag asks for that step id.
   */
  runStep: async (label, play, context) => {
    ensureRunUntilListener();
    if (typeof document !== "undefined") {
      document.documentElement.removeAttribute(VISUAL_CAPTURE_READY_ATTR);
    }
    const storyId = context.id;
    const stepId = slugifyStepLabel(label);
    if (storyId && stepId) {
      const list = playStepsByStory.get(storyId) ?? [];
      if (!list.some((step) => step.stepId === stepId)) {
        list.push({ label: label.trim() || stepId, stepId });
        playStepsByStory.set(storyId, list);
      }
      emitPlaySteps(storyId);
    }
    await play(context);
    await afterPlayStep(label, storyId);
    if (storyId) emitPlaySteps(storyId);
  },
  initialGlobals: {
    [KEY]: false,
  },
};

export default preview;
