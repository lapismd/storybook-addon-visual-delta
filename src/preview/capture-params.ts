import { useEffect } from "storybook/preview-api";
import type { DecoratorFunction } from "storybook/internal/types";
import type { VisualDeltaParams } from "../constants.js";
import {
  VISUAL_DELTA_ALIGN_ATTR,
  VISUAL_DELTA_CROP_ATTR,
  VISUAL_DELTA_DELAY_ATTR,
  VISUAL_DELTA_DIFF_THRESHOLD_ATTR,
  VISUAL_DELTA_IGNORE_ATTR_LIST,
  VISUAL_DELTA_INCLUDE_AA_ATTR,
  VISUAL_DELTA_MODES_ATTR,
  VISUAL_DELTA_PASS_THRESHOLD_ATTR,
} from "../shared/capture-params-attrs.js";
import { resolveIgnoreSelectors } from "../shared/ignore.js";
import { stackModes } from "../shared/modes.js";

export {
  VISUAL_DELTA_ALIGN_ATTR,
  VISUAL_DELTA_CROP_ATTR,
  VISUAL_DELTA_DELAY_ATTR,
  VISUAL_DELTA_DIFF_THRESHOLD_ATTR,
  VISUAL_DELTA_IGNORE_ATTR_LIST,
  VISUAL_DELTA_INCLUDE_AA_ATTR,
  VISUAL_DELTA_MODES_ATTR,
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
  const modes = stackModes(params?.modes);
  const serializedModes =
    Object.keys(modes).length > 0 ? JSON.stringify(modes) : "";

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.setAttribute(VISUAL_DELTA_ALIGN_ATTR, params?.align ?? "viewport");
    const ignore = resolveIgnoreSelectors(params?.ignoreSelectors);
    if (typeof params?.delay === "number") {
      root.setAttribute(VISUAL_DELTA_DELAY_ATTR, String(params.delay));
    } else root.removeAttribute(VISUAL_DELTA_DELAY_ATTR);
    if (ignore.length > 0) {
      root.setAttribute(VISUAL_DELTA_IGNORE_ATTR_LIST, ignore.join("\n"));
    } else {
      root.removeAttribute(VISUAL_DELTA_IGNORE_ATTR_LIST);
    }
    if (typeof params?.cropToViewport === "boolean") {
      root.setAttribute(
        VISUAL_DELTA_CROP_ATTR,
        params.cropToViewport ? "1" : "0",
      );
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
    if (typeof params?.diffIncludeAntiAliasing === "boolean") {
      root.setAttribute(
        VISUAL_DELTA_INCLUDE_AA_ATTR,
        params.diffIncludeAntiAliasing ? "1" : "0",
      );
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
    if (serializedModes) {
      root.setAttribute(VISUAL_DELTA_MODES_ATTR, serializedModes);
    } else {
      root.removeAttribute(VISUAL_DELTA_MODES_ATTR);
    }
    return () => {
      root.removeAttribute(VISUAL_DELTA_DELAY_ATTR);
      root.removeAttribute(VISUAL_DELTA_ALIGN_ATTR);
      root.removeAttribute(VISUAL_DELTA_IGNORE_ATTR_LIST);
      root.removeAttribute(VISUAL_DELTA_CROP_ATTR);
      root.removeAttribute(VISUAL_DELTA_DIFF_THRESHOLD_ATTR);
      root.removeAttribute(VISUAL_DELTA_INCLUDE_AA_ATTR);
      root.removeAttribute(VISUAL_DELTA_PASS_THRESHOLD_ATTR);
      root.removeAttribute(VISUAL_DELTA_MODES_ATTR);
    };
  }, [
    params?.delay,
    params?.align,
    params?.ignoreSelectors?.join("\0"),
    params?.cropToViewport,
    params?.diffThreshold,
    params?.diffIncludeAntiAliasing,
    params?.passThresholdPercent,
    serializedModes,
  ]);

  return storyFn();
};
