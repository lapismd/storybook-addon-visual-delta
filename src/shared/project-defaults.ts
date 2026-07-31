import type {
  VisualDeltaProjectDefaults,
  VisualDeltaZoomDefault,
} from "./config-types.js";

export const BUILTIN_VISUAL_DELTA_DEFAULTS: VisualDeltaProjectDefaults = {
  passThresholdPercent: 1,
  diffThreshold: 0.2,
  diffIncludeAntiAliasing: false,
  delay: 0,
  deviceScaleFactor: 1,
  cropToViewport: false,
  placement: "right",
  opacity: 0.5,
  baselineLabelOffset: { x: 0, y: 0 },
  previewSplitZoomDefault: "fit",
  diffResultZoomDefault: "100%",
};

export const VISUAL_DELTA_PROJECT_DEFAULT_KEYS = [
  "passThresholdPercent",
  "diffThreshold",
  "diffIncludeAntiAliasing",
  "delay",
  "deviceScaleFactor",
  "cropToViewport",
  "placement",
  "opacity",
  "baselineLabelOffset",
  "previewSplitZoomDefault",
  "diffResultZoomDefault",
] as const satisfies readonly (keyof VisualDeltaProjectDefaults)[];

const PLACEMENTS = new Set(["left", "right", "above", "below", "center"]);
const ZOOM_DEFAULTS = new Set<VisualDeltaZoomDefault>(["fit", "100%"]);

export type ProjectDefaultsValidation = {
  value: VisualDeltaProjectDefaults;
  present: Set<keyof VisualDeltaProjectDefaults>;
  errors: string[];
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

export function validateVisualDeltaProjectDefaults(
  input: unknown,
  options?: { requireAll?: boolean; rejectUnknown?: boolean },
): ProjectDefaultsValidation {
  const value: VisualDeltaProjectDefaults = {
    ...BUILTIN_VISUAL_DELTA_DEFAULTS,
    baselineLabelOffset: {
      ...BUILTIN_VISUAL_DELTA_DEFAULTS.baselineLabelOffset,
    },
  };
  const present = new Set<keyof VisualDeltaProjectDefaults>();
  const errors: string[] = [];
  if (typeof input !== "object" || input == null || Array.isArray(input)) {
    return {
      value,
      present,
      errors: ["Configuration must be a JSON object."],
    };
  }
  const object = input as Record<string, unknown>;
  if (options?.rejectUnknown) {
    for (const key of Object.keys(object)) {
      if (
        !(VISUAL_DELTA_PROJECT_DEFAULT_KEYS as readonly string[]).includes(key)
      ) {
        errors.push(`${key} is not an editable Visual Delta setting.`);
      }
    }
  }
  const read = <K extends keyof VisualDeltaProjectDefaults>(
    key: K,
    accept: (candidate: unknown) => candidate is VisualDeltaProjectDefaults[K],
    message: string,
  ) => {
    if (!(key in object)) {
      if (options?.requireAll) errors.push(`${key} is required.`);
      return;
    }
    const candidate = object[key];
    if (!accept(candidate)) {
      errors.push(`${key} ${message}`);
      return;
    }
    value[key] = candidate;
    present.add(key);
  };

  read(
    "passThresholdPercent",
    (candidate): candidate is number => finiteInRange(candidate, 0, 100),
    "must be a number from 0 to 100.",
  );
  read(
    "diffThreshold",
    (candidate): candidate is number => finiteInRange(candidate, 0, 1),
    "must be a number from 0 to 1.",
  );
  read(
    "diffIncludeAntiAliasing",
    (candidate): candidate is boolean => typeof candidate === "boolean",
    "must be true or false.",
  );
  read(
    "delay",
    (candidate): candidate is number =>
      finiteInRange(candidate, 0, 60_000) && Number.isInteger(candidate),
    "must be a whole number from 0 to 60000 milliseconds.",
  );
  read(
    "deviceScaleFactor",
    (candidate): candidate is number =>
      finiteInRange(candidate, 1, 8) && Number.isInteger(candidate),
    "must be a whole number from 1 to 8.",
  );
  read(
    "cropToViewport",
    (candidate): candidate is boolean => typeof candidate === "boolean",
    "must be true or false.",
  );
  read(
    "placement",
    (candidate): candidate is VisualDeltaProjectDefaults["placement"] =>
      typeof candidate === "string" && PLACEMENTS.has(candidate),
    "must be left, right, above, below, or center.",
  );
  read(
    "opacity",
    (candidate): candidate is number => finiteInRange(candidate, 0, 1),
    "must be a number from 0 to 1.",
  );
  read(
    "baselineLabelOffset",
    (
      candidate,
    ): candidate is VisualDeltaProjectDefaults["baselineLabelOffset"] => {
      if (
        typeof candidate !== "object" ||
        candidate == null ||
        Array.isArray(candidate)
      ) {
        return false;
      }
      const offset = candidate as Record<string, unknown>;
      return (
        finiteInRange(offset.x, -1000, 1000) &&
        finiteInRange(offset.y, -1000, 1000)
      );
    },
    "must contain finite x/y values from -1000 to 1000.",
  );
  read(
    "previewSplitZoomDefault",
    (candidate): candidate is VisualDeltaZoomDefault =>
      typeof candidate === "string" &&
      ZOOM_DEFAULTS.has(candidate as VisualDeltaZoomDefault),
    "must be fit or 100%.",
  );
  read(
    "diffResultZoomDefault",
    (candidate): candidate is VisualDeltaZoomDefault =>
      typeof candidate === "string" &&
      ZOOM_DEFAULTS.has(candidate as VisualDeltaZoomDefault),
    "must be fit or 100%.",
  );

  return { value, present, errors };
}
