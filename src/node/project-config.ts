import { validateCaptureWorkspaceIgnore } from "./capture-workspace-ignore.js";
export { validateCaptureWorkspaceIgnore } from "./capture-workspace-ignore.js";
import {
  readConfigurationInputs,
  readCaptureConfiguration,
  validateCaptureConfigurationInput,
} from "./capture-configuration.js";
import {
  overlayLocalProjectConfig,
  overlayCaptureProfileConfig,
  sharedProjectWriteInput,
} from "./local-project-config.js";
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
    visualTestFailureMode: BUILTIN_VISUAL_DELTA_WORKFLOW.visualTestFailureMode,
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
  const {
    workflow,
    browsers,
    captureWorkspaceIgnore,
    capture: _capture,
    ...defaults
  } = record;
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

export function readSharedVisualDeltaProjectConfig(
  root: string,
): VisualDeltaProjectConfigResult {
  const path = visualDeltaProjectConfigPath(root);
  const sources = builtInSources();
  const diagnostics: VisualDeltaConfigDiagnostic[] = [];
  if (existsSync(path)) {
    try {
      const parsed = readConfigurationInputs(root).project;
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
  const shared = readSharedVisualDeltaProjectConfig(root);
  input = sharedProjectWriteInput(root, input, shared);
  validateCaptureConfigurationInput(
    (input as Record<string, unknown>)?.capture,
  );
  const split = splitProjectConfig(input);
  const result = validateVisualDeltaProjectDefaults(split.defaults, {
    requireAll: true,
    rejectUnknown: true,
  });
  const current = shared;
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
        ...((input as Record<string, unknown>).capture !== undefined
          ? { capture: (input as Record<string, unknown>).capture }
          : {}),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  renameSync(temporaryPath, path);
  return readVisualDeltaProjectConfig(root);
}

export function readVisualDeltaProjectConfig(
  root: string,
): VisualDeltaProjectConfigResult {
  const shared = readSharedVisualDeltaProjectConfig(root);
  try {
    const capture = readCaptureConfiguration(root);
    overlayCaptureProfileConfig(shared, capture.profiles[capture.profile]!);
    return overlayLocalProjectConfig(
      shared,
      readConfigurationInputs(root).local,
    );
  } catch (error) {
    shared.diagnostics.push({
      code: "capture-config-invalid",
      severity: "error",
      message: String(error),
      setting: "capture",
    });
    return shared;
  }
}
