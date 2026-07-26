import { STORY_FINISHED } from "storybook/internal/core-events";
import type { DecoratorFunction } from "storybook/internal/types";
import { useChannel, useEffect } from "storybook/preview-api";
import { VISUAL_DELTA_STORY_FINISHED_ATTR } from "../shared/capture-params-attrs.js";

type StoryFinishedPayload = {
  storyId?: string;
};

/**
 * Publish Storybook's real render/play completion as a DOM handshake that
 * Playwright can observe from an isolated preview iframe.
 */
export const withCaptureReady: DecoratorFunction = (storyFn, context) => {
  useChannel({
    [STORY_FINISHED]: (payload?: StoryFinishedPayload) => {
      if (payload?.storyId && payload.storyId !== context.id) return;
      document.documentElement.setAttribute(
        VISUAL_DELTA_STORY_FINISHED_ATTR,
        context.id,
      );
    },
  });

  useEffect(() => {
    const root = document.documentElement;
    root.removeAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR);
    return () => root.removeAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR);
  }, [context.id]);

  return storyFn();
};
