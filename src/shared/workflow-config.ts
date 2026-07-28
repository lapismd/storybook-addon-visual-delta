import type {
  VisualDeltaVcsMode,
  VisualDeltaWorkflowConfig,
} from "./config-types.js";
import type { VisualComparisonOutcome } from "../visual-diff-sidecar.js";

export const DEFAULT_VISUAL_DELTA_COMMIT_MESSAGE_TEMPLATE =
  "Visual Delta: {action} {scope}";

export const BUILTIN_VISUAL_DELTA_WORKFLOW: VisualDeltaWorkflowConfig = {
  autoAcceptLiveStoryComparisons: false,
  vcs: {
    mode: "off",
    commitMessageTemplate: DEFAULT_VISUAL_DELTA_COMMIT_MESSAGE_TEMPLATE,
  },
};

export const VISUAL_DELTA_COMMIT_MESSAGE_TOKENS = [
  "action",
  "scope",
  "storyId",
  "storyName",
  "count",
] as const;

export type VisualDeltaCommitMessageValues = Partial<
  Record<
    (typeof VISUAL_DELTA_COMMIT_MESSAGE_TOKENS)[number],
    string | number | undefined
  >
>;

export type VisualDeltaWorkflowValidation = {
  value: VisualDeltaWorkflowConfig;
  errors: string[];
};

function cloneBuiltInWorkflow(): VisualDeltaWorkflowConfig {
  return {
    autoAcceptLiveStoryComparisons:
      BUILTIN_VISUAL_DELTA_WORKFLOW.autoAcceptLiveStoryComparisons,
    vcs: { ...BUILTIN_VISUAL_DELTA_WORKFLOW.vcs },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isVcsMode(value: unknown): value is VisualDeltaVcsMode {
  return value === "off" || value === "review" || value === "auto";
}

export function validateVisualDeltaWorkflowConfig(
  input: unknown,
  options: { rejectUnknown?: boolean } = {},
): VisualDeltaWorkflowValidation {
  const value = cloneBuiltInWorkflow();
  const errors: string[] = [];
  if (input == null) return { value, errors };
  if (!isRecord(input)) {
    return {
      value,
      errors: ["workflow must be an object."],
    };
  }

  const workflowKeys = new Set(["autoAcceptLiveStoryComparisons", "vcs"]);
  if (options.rejectUnknown) {
    for (const key of Object.keys(input)) {
      if (!workflowKeys.has(key)) {
        errors.push(`${key} is not an editable Visual Delta workflow setting.`);
      }
    }
  }

  if ("autoAcceptLiveStoryComparisons" in input) {
    if (typeof input.autoAcceptLiveStoryComparisons === "boolean") {
      value.autoAcceptLiveStoryComparisons =
        input.autoAcceptLiveStoryComparisons;
    } else {
      errors.push("autoAcceptLiveStoryComparisons must be a boolean.");
    }
  }

  if ("vcs" in input) {
    if (!isRecord(input.vcs)) {
      errors.push("workflow.vcs must be an object.");
    } else {
      const vcsKeys = new Set(["mode", "commitMessageTemplate"]);
      if (options.rejectUnknown) {
        for (const key of Object.keys(input.vcs)) {
          if (!vcsKeys.has(key)) {
            errors.push(
              `workflow.vcs.${key} is not an editable Visual Delta workflow setting.`,
            );
          }
        }
      }
      if ("mode" in input.vcs) {
        if (isVcsMode(input.vcs.mode)) value.vcs.mode = input.vcs.mode;
        else
          errors.push('workflow.vcs.mode must be "off", "review", or "auto".');
      }
      if ("commitMessageTemplate" in input.vcs) {
        if (
          typeof input.vcs.commitMessageTemplate === "string" &&
          input.vcs.commitMessageTemplate.trim()
        ) {
          value.vcs.commitMessageTemplate =
            input.vcs.commitMessageTemplate.trim();
        } else {
          errors.push(
            "workflow.vcs.commitMessageTemplate must be a non-empty string.",
          );
        }
      }
    }
  }

  return { value, errors };
}

export function renderVisualDeltaCommitMessage(
  template: string,
  values: VisualDeltaCommitMessageValues,
): string {
  const rendered = template.replace(
    /\{(action|scope|storyId|storyName|count)\}/g,
    (_match, key: keyof VisualDeltaCommitMessageValues) =>
      String(values[key] ?? ""),
  );
  return rendered.replace(/\s+/g, " ").trim();
}

export function shouldAutoAcceptLiveStoryComparison(
  workflow: VisualDeltaWorkflowConfig,
  outcome: VisualComparisonOutcome,
): boolean {
  return (
    workflow.autoAcceptLiveStoryComparisons &&
    (outcome === "passed" || outcome === "changed-within-tolerance")
  );
}
