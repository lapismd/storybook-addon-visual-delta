import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type {
  VisualDeltaConfigDiagnostic,
  VisualDeltaProjectDefaults,
  VisualDeltaProjectDefaultSource,
} from "../shared/config-types.js";
import {
  BUILTIN_VISUAL_DELTA_DEFAULTS,
  VISUAL_DELTA_PROJECT_DEFAULT_KEYS,
  validateVisualDeltaProjectDefaults,
} from "../shared/project-defaults.js";

export const VISUAL_DELTA_PROJECT_CONFIG_REL = ".visual-delta/config.json";
const LEGACY_PLAYWRIGHT_CONFIG_REL = ".visual-delta/playwright.json";

export type VisualDeltaProjectConfigResult = {
  defaults: VisualDeltaProjectDefaults;
  sources: Record<
    keyof VisualDeltaProjectDefaults,
    VisualDeltaProjectDefaultSource
  >;
  path: string;
  exists: boolean;
  diagnostics: VisualDeltaConfigDiagnostic[];
};

export function visualDeltaProjectConfigPath(root: string): string {
  return join(root, VISUAL_DELTA_PROJECT_CONFIG_REL);
}

function builtInSources(): VisualDeltaProjectConfigResult["sources"] {
  return Object.fromEntries(
    VISUAL_DELTA_PROJECT_DEFAULT_KEYS.map((key) => [key, "built-in"]),
  ) as VisualDeltaProjectConfigResult["sources"];
}

function readLegacyPassThreshold(root: string): number | null {
  const path = join(root, LEGACY_PLAYWRIGHT_CONFIG_REL);
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as {
      passThresholdPercent?: unknown;
    };
    return typeof value.passThresholdPercent === "number" &&
      Number.isFinite(value.passThresholdPercent)
      ? Math.min(100, Math.max(0, value.passThresholdPercent))
      : null;
  } catch {
    return null;
  }
}

export function readVisualDeltaProjectConfig(
  root: string,
): VisualDeltaProjectConfigResult {
  const path = visualDeltaProjectConfigPath(root);
  const sources = builtInSources();
  const diagnostics: VisualDeltaConfigDiagnostic[] = [];
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
      const result = validateVisualDeltaProjectDefaults(parsed, {
        rejectUnknown: true,
      });
      if (result.errors.length) {
        diagnostics.push({
          code: "project-config-invalid",
          severity: "error",
          setting: VISUAL_DELTA_PROJECT_CONFIG_REL,
          message: result.errors.join(" "),
          suggestion: "Fix or restore the editable defaults from the panel.",
        });
      }
      for (const key of result.present) sources[key] = "project";
      return {
        defaults: result.value,
        sources,
        path,
        exists: true,
        diagnostics,
      };
    } catch (error) {
      diagnostics.push({
        code: "project-config-unreadable",
        severity: "error",
        setting: VISUAL_DELTA_PROJECT_CONFIG_REL,
        message:
          error instanceof Error
            ? error.message
            : "Project config could not be read.",
        suggestion: "Restore built-ins from the Configuration panel.",
      });
      return {
        defaults: {
          ...BUILTIN_VISUAL_DELTA_DEFAULTS,
          baselineLabelOffset: {
            ...BUILTIN_VISUAL_DELTA_DEFAULTS.baselineLabelOffset,
          },
        },
        sources,
        path,
        exists: true,
        diagnostics,
      };
    }
  }

  const legacyPass = readLegacyPassThreshold(root);
  const defaults = {
    ...BUILTIN_VISUAL_DELTA_DEFAULTS,
    baselineLabelOffset: {
      ...BUILTIN_VISUAL_DELTA_DEFAULTS.baselineLabelOffset,
    },
  };
  if (legacyPass != null) {
    defaults.passThresholdPercent = legacyPass;
    sources.passThresholdPercent = "legacy";
  }
  return { defaults, sources, path, exists: false, diagnostics };
}

export function writeVisualDeltaProjectConfig(
  root: string,
  input: unknown,
): VisualDeltaProjectConfigResult {
  const result = validateVisualDeltaProjectDefaults(input, {
    requireAll: true,
    rejectUnknown: true,
  });
  if (result.errors.length) {
    throw new Error(result.errors.join(" "));
  }
  const path = visualDeltaProjectConfigPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(
    temporaryPath,
    `${JSON.stringify(result.value, null, 2)}\n`,
    "utf8",
  );
  renameSync(temporaryPath, path);
  return readVisualDeltaProjectConfig(root);
}
