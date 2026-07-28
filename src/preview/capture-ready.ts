import { STORY_FINISHED } from "storybook/internal/core-events";
import type { DecoratorFunction } from "storybook/internal/types";
import { useChannel, useEffect } from "storybook/preview-api";
import { EVENTS } from "../constants.js";
import { VISUAL_DELTA_STORY_FINISHED_ATTR } from "../shared/capture-params-attrs.js";
import {
  beginPreviewRender,
  finishPreviewRender,
  readCurrentPreviewRender,
  readPreviewRender,
  type PreviewRenderLifecycle,
} from "./render-lifecycle.js";

type StoryFinishedPayload = {
  storyId?: string;
};

type CaptureReadyRoot = Pick<
  HTMLElement,
  "getAttribute" | "removeAttribute" | "setAttribute"
>;

export function prepareCaptureReadyRender(
  root: CaptureReadyRoot,
  render: PreviewRenderLifecycle,
): PreviewRenderLifecycle {
  root.removeAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR);
  return render;
}

export function finishCaptureReadyRender(
  root: CaptureReadyRoot,
  render: PreviewRenderLifecycle,
): PreviewRenderLifecycle | null {
  const readiness = finishPreviewRender(
    render.storyId,
    render.renderGeneration,
  );
  if (!readiness) return null;
  root.setAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR, render.storyId);
  return readiness;
}

export function cleanupCaptureReadyRender(
  root: CaptureReadyRoot,
  render: PreviewRenderLifecycle,
): void {
  if (
    readPreviewRender(render.storyId, render.renderGeneration) &&
    root.getAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR) === render.storyId
  ) {
    root.removeAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR);
  }
}

/**
 * Publish Storybook's real render/play completion as a DOM handshake that
 * Playwright can observe from an isolated preview iframe.
 */
export const withCaptureReady: DecoratorFunction = (storyFn, context) => {
  const root = document.documentElement;
  // withInitImage executes earlier in Storybook's decorator reduction and owns
  // the generation. Keep the fallback for isolated decorator usage.
  const render = prepareCaptureReadyRender(
    root,
    readCurrentPreviewRender(context.id) ?? beginPreviewRender(context.id),
  );
  const emit = useChannel(
    {
      [STORY_FINISHED]: (payload?: StoryFinishedPayload) => {
        if (payload?.storyId && payload.storyId !== context.id) return;
        const readiness = finishCaptureReadyRender(root, render);
        if (!readiness) return;
        emit(EVENTS.PREVIEW_READY, readiness);
      },
    },
    [context.id, render.renderGeneration],
  );

  useEffect(
    () => () => cleanupCaptureReadyRender(root, render),
    [context.id, render.renderGeneration],
  );

  return storyFn();
};
