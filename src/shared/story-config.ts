import {
  normalizePlacement,
  type AlignMode,
  type PlacementMode,
  type VisualDeltaParams,
} from "../constants.js";
import type {
  VisualDeltaProjectDefaults,
  VisualDeltaProjectDefaultSource,
} from "./config-types.js";
import { isViewportSizedBaseline } from "./geometry-mismatch.js";

export type VisualDeltaStoryConfig = {
  align: AlignMode;
  placement: PlacementMode;
  opacity: number;
  colorInversion: boolean;
  passThresholdPercent: number;
  diffThreshold: number;
  diffIncludeAntiAliasing: boolean;
  delay: number;
  cropToViewport: boolean;
  baselineLabelOffset: { x: number; y: number };
};

export const VISUAL_DELTA_STORY_CONFIG_KEYS = [
  "align",
  "placement",
  "opacity",
  "colorInversion",
  "passThresholdPercent",
  "diffThreshold",
  "diffIncludeAntiAliasing",
  "delay",
  "cropToViewport",
  "baselineLabelOffset",
] as const satisfies readonly (keyof VisualDeltaStoryConfig)[];

export type VisualDeltaStoryConfigKey =
  (typeof VISUAL_DELTA_STORY_CONFIG_KEYS)[number];
export type VisualDeltaStoryConfigPatch = Partial<VisualDeltaStoryConfig>;
export type VisualDeltaStoryConfigSource =
  | "story"
  | VisualDeltaProjectDefaultSource;

export type ResolvedVisualDeltaStoryConfig = {
  values: VisualDeltaStoryConfig;
  sources: Record<VisualDeltaStoryConfigKey, VisualDeltaStoryConfigSource>;
  overrides: VisualDeltaStoryConfigPatch;
};

export type VisualDeltaStoryConfigUpdate = {
  storyId: string;
  values?: VisualDeltaStoryConfigPatch;
  unset?: VisualDeltaStoryConfigKey[];
};

export type VisualDeltaStoryConfigUpdateResponse = {
  ok: true;
  storyId: string;
  values: VisualDeltaStoryConfigPatch;
  unset: VisualDeltaStoryConfigKey[];
};

export type BaselineAlignmentMismatch = {
  configured: AlignMode;
  recommended: AlignMode;
  baselineCss: { width: number; height: number };
  liveCss: { width: number; height: number };
  captureViewport: { width: number; height: number };
  reason: "viewport-sized-baseline" | "component-sized-baseline";
};

const STORY_DEFAULT_SOURCES: Record<
  Exclude<VisualDeltaStoryConfigKey, keyof VisualDeltaProjectDefaults>,
  "built-in"
> = {
  align: "built-in",
  colorInversion: "built-in",
};

function finiteInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function validOffset(
  value: unknown,
): value is VisualDeltaStoryConfig["baselineLabelOffset"] {
  return (
    typeof value === "object" &&
    value != null &&
    !Array.isArray(value) &&
    finiteInRange((value as { x?: unknown }).x, -1000, 1000) &&
    finiteInRange((value as { y?: unknown }).y, -1000, 1000)
  );
}

function validStoryConfigValue(
  key: VisualDeltaStoryConfigKey,
  value: unknown,
): boolean {
  switch (key) {
    case "align":
      return value === "canvas" || value === "viewport";
    case "placement":
      return (
        value === "left" ||
        value === "right" ||
        value === "above" ||
        value === "below" ||
        value === "center"
      );
    case "opacity":
      return finiteInRange(value, 0, 1);
    case "colorInversion":
    case "diffIncludeAntiAliasing":
    case "cropToViewport":
      return typeof value === "boolean";
    case "passThresholdPercent":
      return finiteInRange(value, 0, 100);
    case "diffThreshold":
      return finiteInRange(value, 0, 1);
    case "delay":
      return finiteInRange(value, 0, 60_000) && Number.isInteger(value);
    case "baselineLabelOffset":
      return validOffset(value);
  }
}

export function validateVisualDeltaStoryConfigUpdate(input: unknown): {
  value: VisualDeltaStoryConfigUpdate | null;
  errors: string[];
} {
  if (typeof input !== "object" || input == null || Array.isArray(input)) {
    return { value: null, errors: ["Request must be a JSON object."] };
  }
  const object = input as Record<string, unknown>;
  const errors: string[] = [];
  const storyId =
    typeof object.storyId === "string" ? object.storyId.trim() : "";
  if (!storyId) errors.push("storyId is required.");

  const values: VisualDeltaStoryConfigPatch = {};
  if (object.values != null) {
    if (typeof object.values !== "object" || Array.isArray(object.values)) {
      errors.push("values must be an object.");
    } else {
      for (const [rawKey, candidate] of Object.entries(
        object.values as Record<string, unknown>,
      )) {
        if (
          !(VISUAL_DELTA_STORY_CONFIG_KEYS as readonly string[]).includes(
            rawKey,
          )
        ) {
          errors.push(`${rawKey} is not an editable story setting.`);
          continue;
        }
        const key = rawKey as VisualDeltaStoryConfigKey;
        if (!validStoryConfigValue(key, candidate)) {
          errors.push(`${key} has an invalid value.`);
          continue;
        }
        Object.assign(values, { [key]: candidate });
      }
    }
  }

  const unset: VisualDeltaStoryConfigKey[] = [];
  if (object.unset != null) {
    if (!Array.isArray(object.unset)) {
      errors.push("unset must be an array.");
    } else {
      for (const candidate of object.unset) {
        if (
          typeof candidate !== "string" ||
          !(VISUAL_DELTA_STORY_CONFIG_KEYS as readonly string[]).includes(
            candidate,
          )
        ) {
          errors.push(`${String(candidate)} is not an editable story setting.`);
          continue;
        }
        if (!unset.includes(candidate as VisualDeltaStoryConfigKey)) {
          unset.push(candidate as VisualDeltaStoryConfigKey);
        }
      }
    }
  }

  for (const key of Object.keys(values) as VisualDeltaStoryConfigKey[]) {
    if (unset.includes(key)) {
      errors.push(`${key} cannot be both updated and reset.`);
    }
  }
  if (Object.keys(values).length === 0 && unset.length === 0) {
    errors.push("At least one story setting must be updated or reset.");
  }

  return {
    value: errors.length ? null : { storyId, values, unset },
    errors,
  };
}

function storyOverrides(
  params: VisualDeltaParams | undefined,
): VisualDeltaStoryConfigPatch {
  const overrides: VisualDeltaStoryConfigPatch = {};
  for (const key of VISUAL_DELTA_STORY_CONFIG_KEYS) {
    const candidate = params?.[key];
    if (candidate == null) continue;
    if (key === "placement") {
      overrides.placement = normalizePlacement(candidate);
    } else {
      Object.assign(overrides, { [key]: candidate });
    }
  }
  return overrides;
}

export function resolveVisualDeltaStoryConfig(
  params: VisualDeltaParams | undefined,
  projectDefaults: VisualDeltaProjectDefaults,
  projectSources: Record<
    keyof VisualDeltaProjectDefaults,
    VisualDeltaProjectDefaultSource
  >,
): ResolvedVisualDeltaStoryConfig {
  const overrides = storyOverrides(params);
  const values: VisualDeltaStoryConfig = {
    align: overrides.align ?? "viewport",
    placement: overrides.placement ?? projectDefaults.placement,
    opacity: overrides.opacity ?? projectDefaults.opacity,
    colorInversion: overrides.colorInversion ?? false,
    passThresholdPercent:
      overrides.passThresholdPercent ?? projectDefaults.passThresholdPercent,
    diffThreshold: overrides.diffThreshold ?? projectDefaults.diffThreshold,
    diffIncludeAntiAliasing:
      overrides.diffIncludeAntiAliasing ??
      projectDefaults.diffIncludeAntiAliasing,
    delay: overrides.delay ?? projectDefaults.delay,
    cropToViewport: overrides.cropToViewport ?? projectDefaults.cropToViewport,
    baselineLabelOffset:
      overrides.baselineLabelOffset ?? projectDefaults.baselineLabelOffset,
  };
  const sources = {} as ResolvedVisualDeltaStoryConfig["sources"];
  for (const key of VISUAL_DELTA_STORY_CONFIG_KEYS) {
    if (key in overrides) {
      sources[key] = "story";
    } else if (key in projectDefaults) {
      sources[key] = projectSources[key as keyof VisualDeltaProjectDefaults];
    } else {
      sources[key] =
        STORY_DEFAULT_SOURCES[key as keyof typeof STORY_DEFAULT_SOURCES];
    }
  }
  return { values, sources, overrides };
}

function sameSize(
  first: { width: number; height: number },
  second: { width: number; height: number },
): boolean {
  return (
    Math.abs(first.width - second.width) <= 1 &&
    Math.abs(first.height - second.height) <= 1
  );
}

export function baselineAlignmentMismatch(options: {
  configured: AlignMode;
  baselineCss: { width: number; height: number };
  liveCss: { width: number; height: number };
  captureViewport: { width: number; height: number };
  cropToViewport: boolean;
}): BaselineAlignmentMismatch | null {
  const viewportSized =
    options.cropToViewport ||
    isViewportSizedBaseline(options.baselineCss, options.captureViewport);
  if (viewportSized && options.configured !== "viewport") {
    return {
      configured: options.configured,
      recommended: "viewport",
      baselineCss: options.baselineCss,
      liveCss: options.liveCss,
      captureViewport: options.captureViewport,
      reason: "viewport-sized-baseline",
    };
  }
  if (
    !viewportSized &&
    options.configured === "viewport" &&
    sameSize(options.baselineCss, options.liveCss)
  ) {
    return {
      configured: options.configured,
      recommended: "canvas",
      baselineCss: options.baselineCss,
      liveCss: options.liveCss,
      captureViewport: options.captureViewport,
      reason: "component-sized-baseline",
    };
  }
  return null;
}
