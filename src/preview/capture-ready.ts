import { STORY_FINISHED } from "storybook/internal/core-events";
import type { DecoratorFunction } from "storybook/internal/types";
import { useChannel, useEffect } from "storybook/preview-api";
import { EVENTS } from "../constants.js";
import { VISUAL_DELTA_STORY_FINISHED_ATTR } from "../shared/capture-params-attrs.js";
import { finishPreviewRender } from "./render-lifecycle.js";

type StoryFinishedPayload = {
  storyId?: string;
};

/**
 * Publish Storybook's real render/play completion as a DOM handshake that
 * Playwright can observe from an isolated preview iframe.
 */
export const withCaptureReady: DecoratorFunction = (storyFn, context) => {
  const emit = useChannel({
    [STORY_FINISHED]: (payload?: StoryFinishedPayload) => {
      if (payload?.storyId && payload.storyId !== context.id) return;
      const readiness = finishPreviewRender(context.id);
      if (!readiness) return;
      document.documentElement.setAttribute(
        VISUAL_DELTA_STORY_FINISHED_ATTR,
        context.id,
      );
      emit(EVENTS.PREVIEW_READY, readiness);
    },
  });

  useEffect(() => {
    const root = document.documentElement;
    root.removeAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR);
    return () => root.removeAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR);
  }, [context.id]);

  return storyFn();
};
