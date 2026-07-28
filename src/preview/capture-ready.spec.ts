import { describe, expect, it } from "vitest";
import { VISUAL_DELTA_STORY_FINISHED_ATTR } from "../shared/capture-params-attrs.js";
import {
  cleanupCaptureReadyRender,
  finishCaptureReadyRender,
  finishParkedCaptureReadyRender,
  prepareCaptureReadyRender,
} from "./capture-ready.js";
import { VISUAL_CAPTURE_READY_ATTR } from "../shared/interaction-capture.js";
import { beginPreviewRender } from "./render-lifecycle.js";

function captureReadyRoot() {
  const attributes = new Map<string, string>();
  return {
    getAttribute(name: string) {
      return attributes.get(name) ?? null;
    },
    removeAttribute(name: string) {
      attributes.delete(name);
    },
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
  };
}

describe("preview capture readiness", () => {
  it("keeps completion and cleanup scoped to the exact render generation", () => {
    const root = captureReadyRoot();
    const first = prepareCaptureReadyRender(
      root,
      beginPreviewRender("hmr-story"),
    );

    expect(finishCaptureReadyRender(root, first)).toMatchObject({
      storyFinished: true,
    });
    expect(root.getAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR)).toBe(
      "hmr-story",
    );

    const second = prepareCaptureReadyRender(
      root,
      beginPreviewRender("hmr-story"),
    );
    expect(root.getAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR)).toBeNull();
    expect(finishCaptureReadyRender(root, first)).toBeNull();
    expect(finishCaptureReadyRender(root, second)).toMatchObject({
      storyFinished: true,
    });

    cleanupCaptureReadyRender(root, first);
    expect(root.getAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR)).toBe(
      "hmr-story",
    );

    cleanupCaptureReadyRender(root, second);
    expect(root.getAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR)).toBeNull();
  });

  it("treats only the exact parked interaction as generation completion", () => {
    const root = captureReadyRoot();
    const render = prepareCaptureReadyRender(
      root,
      beginPreviewRender("interaction-story"),
    );
    root.setAttribute(VISUAL_CAPTURE_READY_ATTR, "interaction-23-findByRole");

    expect(
      finishParkedCaptureReadyRender(root, render, {
        storyId: "another-story",
        stepId: "interaction-23-findByRole",
      }),
    ).toBeNull();
    expect(
      finishParkedCaptureReadyRender(root, render, {
        storyId: "interaction-story",
        stepId: "interaction-22-click",
      }),
    ).toBeNull();
    expect(
      finishParkedCaptureReadyRender(root, render, {
        storyId: "interaction-story",
        stepId: "interaction-23-findByRole",
      }),
    ).toMatchObject({
      storyId: "interaction-story",
      storyFinished: true,
    });
    expect(root.getAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR)).toBe(
      "interaction-story",
    );
  });
});
