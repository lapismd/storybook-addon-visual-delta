import { addons } from "storybook/preview-api";
import type { ProjectAnnotations, Renderer } from "storybook/internal/types";
import { EVENTS, KEY } from "./constants.js";
import { withCaptureParams } from "./preview/capture-params.js";
import { withHighlightIgnore } from "./preview/highlight-ignore.js";
import { withInitImage } from "./preview/init.js";
import { withOverlayInfo } from "./preview/overlay-info.js";
import { ensureOverlayChannel, withSelectImage } from "./preview/overlay.js";
import {
  VISUAL_CAPTURE_READY_ATTR,
  VISUAL_CAPTURE_STEP_ATTR,
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

function ensureRunUntilListener() {
  if (runUntilListenerInstalled) return;
  runUntilListenerInstalled = true;
  ensureOverlayChannel();
  addons.getChannel().on(
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
    withCaptureParams,
    withHighlightIgnore,
    withInitImage,
    withSelectImage,
    withOverlayInfo,
    (storyFn, context) => {
      ensureRunUntilListener();
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
