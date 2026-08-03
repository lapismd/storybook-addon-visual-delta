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
  VisualDeltaWorkflowConfig,
} from "../shared/config-types.js";
import {
  BUILTIN_VISUAL_DELTA_DEFAULTS,
  VISUAL_DELTA_PROJECT_DEFAULT_KEYS,
  validateVisualDeltaProjectDefaults,
} from "../shared/project-defaults.js";
import {
  BUILTIN_VISUAL_DELTA_WORKFLOW,
  validateVisualDeltaWorkflowConfig,
} from "../shared/workflow-config.js";
import {
  DEFAULT_VISUAL_DELTA_BROWSERS,
  validateVisualDeltaBrowsers,
  type VisualDeltaBrowser,
} from "../shared/environments.js";

export const VISUAL_DELTA_PROJECT_CONFIG_REL = ".visual-delta/config.json";
const LEGACY_PLAYWRIGHT_CONFIG_REL = ".visual-delta/playwright.json";

export type VisualDeltaProjectConfigResult = {
  defaults: VisualDeltaProjectDefaults;
  browsers: VisualDeltaBrowser[];
  captureWorkspaceIgnore: string[];
  workflow: VisualDeltaWorkflowConfig;
  sources: Record<
    keyof VisualDeltaProjectDefaults,
    VisualDeltaProjectDefaultSource
  >;
  path: string;
  exists: boolean;
  diagnostics: VisualDeltaConfigDiagnostic[];
};

function cloneBuiltInWorkflow(): VisualDeltaWorkflowConfig {
  return {
    autoAcceptLiveStoryComparisons:
      BUILTIN_VISUAL_DELTA_WORKFLOW.autoAcceptLiveStoryComparisons,
    visualTestFailureMode:
      BUILTIN_VISUAL_DELTA_WORKFLOW.visualTestFailureMode,
    reuseActualComparisons:
      BUILTIN_VISUAL_DELTA_WORKFLOW.reuseActualComparisons,
    vcs: { ...BUILTIN_VISUAL_DELTA_WORKFLOW.vcs },
  };
}

function splitProjectConfig(input: unknown): {
  defaults: unknown;
  browsers: unknown;
  browsersPresent: boolean;
  captureWorkspaceIgnore: unknown;
  captureWorkspaceIgnorePresent: boolean;
  workflow: unknown;
  workflowPresent: boolean;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      defaults: input,
      browsers: undefined,
      browsersPresent: false,
      captureWorkspaceIgnore: undefined,
      captureWorkspaceIgnorePresent: false,
      workflow: undefined,
      workflowPresent: false,
    };
  }
  const record = input as Record<string, unknown>;
  if ("projectDefaults" in record) {
    return {
      defaults: record.projectDefaults,
      browsers: record.browsers,
      browsersPresent: "browsers" in record,
      captureWorkspaceIgnore: record.captureWorkspaceIgnore,
      captureWorkspaceIgnorePresent: "captureWorkspaceIgnore" in record,
      workflow: record.workflow,
      workflowPresent: "workflow" in record,
    };
  }
  const { workflow, browsers, captureWorkspaceIgnore, ...defaults } = record;
  return {
    defaults,
    browsers,
    browsersPresent: "browsers" in record,
    captureWorkspaceIgnore,
    captureWorkspaceIgnorePresent: "captureWorkspaceIgnore" in record,
    workflow,
    workflowPresent: "workflow" in record,
  };
}

export function validateCaptureWorkspaceIgnore(input: unknown): {
  value: string[];
  errors: string[];
} {
  if (input === undefined) return { value: [], errors: [] };
  if (!Array.isArray(input)) {
    return {
      value: [],
      errors: ["captureWorkspaceIgnore must be an array of relative directories."],
    };
  }
  const value: string[] = [];
  const errors: string[] = [];
  for (const candidate of input) {
    if (typeof candidate !== "string") {
      errors.push("captureWorkspaceIgnore entries must be strings.");
      continue;
    }
    const normalized = candidate
      .trim()
      .replaceAll("\\", "/")
      .replace(/^\.\//, "")
      .replace(/\/+$/, "");
    const segments = normalized.split("/");
    if (
      !normalized ||
      normalized === "." ||
      normalized.startsWith("/") ||
      /^[A-Za-z]:\//.test(normalized) ||
      segments.some((segment) => !segment || segment === "." || segment === "..")
    ) {
      errors.push(
        `captureWorkspaceIgnore entry ${JSON.stringify(candidate)} must be a root-relative directory without . or .. segments.`,
      );
      continue;
    }
    if (value.includes(normalized)) {
      errors.push(`captureWorkspaceIgnore contains duplicate ${normalized}.`);
      continue;
    }
    if (
      normalized === ".visual-delta" ||
      normalized === ".visual-delta/artifacts" ||
      normalized.startsWith(".visual-delta/artifacts/") ||
      normalized === ".visual-delta/cache" ||
      normalized.startsWith(".visual-delta/cache/")
    ) {
      errors.push(
        `captureWorkspaceIgnore cannot suppress package-owned directory ${normalized}.`,
      );
      continue;
    }
    value.push(normalized);
  }
  return { value, errors };
}

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
      const split = splitProjectConfig(parsed);
      const result = validateVisualDeltaProjectDefaults(split.defaults, {
        rejectUnknown: true,
      });
      const workflow = validateVisualDeltaWorkflowConfig(split.workflow, {
        rejectUnknown: true,
      });
      const browsers = validateVisualDeltaBrowsers(split.browsers);
      const captureWorkspaceIgnore = validateCaptureWorkspaceIgnore(
        split.captureWorkspaceIgnore,
      );
      const errors = [
        ...result.errors,
        ...workflow.errors,
        ...browsers.errors,
        ...captureWorkspaceIgnore.errors,
      ];
      if (errors.length) {
        diagnostics.push({
          code: "project-config-invalid",
          severity: "error",
          setting: VISUAL_DELTA_PROJECT_CONFIG_REL,
          message: errors.join(" "),
          suggestion: "Fix or restore the editable defaults from the panel.",
        });
      }
      for (const key of result.present) sources[key] = "project";
      return {
        defaults: result.value,
        browsers: browsers.value,
        captureWorkspaceIgnore:
          captureWorkspaceIgnore.errors.length > 0
            ? []
            : captureWorkspaceIgnore.value,
        workflow: workflow.value,
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
        browsers: [...DEFAULT_VISUAL_DELTA_BROWSERS],
        captureWorkspaceIgnore: [],
        workflow: cloneBuiltInWorkflow(),
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
  return {
    defaults,
    browsers: [...DEFAULT_VISUAL_DELTA_BROWSERS],
    captureWorkspaceIgnore: [],
    workflow: cloneBuiltInWorkflow(),
    sources,
    path,
    exists: false,
    diagnostics,
  };
}

export function writeVisualDeltaProjectConfig(
  root: string,
  input: unknown,
): VisualDeltaProjectConfigResult {
  const split = splitProjectConfig(input);
  const result = validateVisualDeltaProjectDefaults(split.defaults, {
    requireAll: true,
    rejectUnknown: true,
  });
  const current = readVisualDeltaProjectConfig(root);
  const workflow = validateVisualDeltaWorkflowConfig(
    split.workflowPresent ? split.workflow : current.workflow,
    { rejectUnknown: true },
  );
  const browsers = validateVisualDeltaBrowsers(
    split.browsersPresent ? split.browsers : current.browsers,
  );
  const captureWorkspaceIgnore = validateCaptureWorkspaceIgnore(
    split.captureWorkspaceIgnorePresent
      ? split.captureWorkspaceIgnore
      : current.captureWorkspaceIgnore,
  );
  const errors = [
    ...result.errors,
    ...workflow.errors,
    ...browsers.errors,
    ...captureWorkspaceIgnore.errors,
  ];
  if (errors.length) {
    throw new Error(errors.join(" "));
  }
  const path = visualDeltaProjectConfigPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(
    temporaryPath,
    `${JSON.stringify(
      {
        ...result.value,
        browsers: browsers.value,
        captureWorkspaceIgnore: captureWorkspaceIgnore.value,
        workflow: workflow.value,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  renameSync(temporaryPath, path);
  return readVisualDeltaProjectConfig(root);
}
