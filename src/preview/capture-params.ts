import { useEffect } from "storybook/preview-api";
import type { DecoratorFunction } from "storybook/internal/types";
import type { VisualDeltaParams } from "../constants.js";
import {
  VISUAL_DELTA_CROP_ATTR,
  VISUAL_DELTA_DELAY_ATTR,
  VISUAL_DELTA_DIFF_THRESHOLD_ATTR,
  VISUAL_DELTA_IGNORE_ATTR_LIST,
  VISUAL_DELTA_INCLUDE_AA_ATTR,
  VISUAL_DELTA_PASS_THRESHOLD_ATTR,
} from "../shared/capture-params-attrs.js";
import { resolveIgnoreSelectors } from "../shared/ignore.js";

export {
  VISUAL_DELTA_CROP_ATTR,
  VISUAL_DELTA_DELAY_ATTR,
  VISUAL_DELTA_DIFF_THRESHOLD_ATTR,
  VISUAL_DELTA_IGNORE_ATTR_LIST,
  VISUAL_DELTA_INCLUDE_AA_ATTR,
  VISUAL_DELTA_PASS_THRESHOLD_ATTR,
} from "../shared/capture-params-attrs.js";

/**
 * Publish CSF capture knobs on `<html>` so Playwright and Chromium Diff can
 * read the same values as Live Diff without parsing CSF on the host.
 */
export const withCaptureParams: DecoratorFunction = (storyFn, context) => {
  const params = context.parameters?.visualDelta as
    | VisualDeltaParams
    | undefined;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const delay = params?.delay ?? 0;
    const ignore = resolveIgnoreSelectors(params?.ignoreSelectors);
    if (delay > 0) root.setAttribute(VISUAL_DELTA_DELAY_ATTR, String(delay));
    else root.removeAttribute(VISUAL_DELTA_DELAY_ATTR);
    if (ignore.length > 0) {
      root.setAttribute(VISUAL_DELTA_IGNORE_ATTR_LIST, ignore.join("\n"));
    } else {
      root.removeAttribute(VISUAL_DELTA_IGNORE_ATTR_LIST);
    }
    if (params?.cropToViewport) {
      root.setAttribute(VISUAL_DELTA_CROP_ATTR, "1");
    } else {
      root.removeAttribute(VISUAL_DELTA_CROP_ATTR);
    }
    if (typeof params?.diffThreshold === "number") {
      root.setAttribute(
        VISUAL_DELTA_DIFF_THRESHOLD_ATTR,
        String(params.diffThreshold),
      );
    } else {
      root.removeAttribute(VISUAL_DELTA_DIFF_THRESHOLD_ATTR);
    }
    if (params?.diffIncludeAntiAliasing) {
      root.setAttribute(VISUAL_DELTA_INCLUDE_AA_ATTR, "1");
    } else {
      root.removeAttribute(VISUAL_DELTA_INCLUDE_AA_ATTR);
    }
    if (typeof params?.passThresholdPercent === "number") {
      root.setAttribute(
        VISUAL_DELTA_PASS_THRESHOLD_ATTR,
        String(params.passThresholdPercent),
      );
    } else {
      root.removeAttribute(VISUAL_DELTA_PASS_THRESHOLD_ATTR);
    }
    return () => {
      root.removeAttribute(VISUAL_DELTA_DELAY_ATTR);
      root.removeAttribute(VISUAL_DELTA_IGNORE_ATTR_LIST);
      root.removeAttribute(VISUAL_DELTA_CROP_ATTR);
      root.removeAttribute(VISUAL_DELTA_DIFF_THRESHOLD_ATTR);
      root.removeAttribute(VISUAL_DELTA_INCLUDE_AA_ATTR);
      root.removeAttribute(VISUAL_DELTA_PASS_THRESHOLD_ATTR);
    };
  }, [
    params?.delay,
    params?.ignoreSelectors?.join("\0"),
    params?.cropToViewport,
    params?.diffThreshold,
    params?.diffIncludeAntiAliasing,
    params?.passThresholdPercent,
  ]);

  return storyFn();
};
