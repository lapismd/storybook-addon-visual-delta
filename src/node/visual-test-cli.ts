import { spawn } from "node:child_process";
import path from "node:path";
import type { AffectedVisualSummary } from "../shared/affected-types.js";
import {
  planAffectedVisualTests,
  planAllVisualTests,
  recordAffectedVisualResults,
  type AffectedVisualPlan,
} from "./affected-visual-tests.js";
import {
  DEFAULT_VISUAL_TEST_ARGS,
  type VisualDeltaHostOptions,
} from "./options.js";
import {
  parseListReporterProgress,
  successfulStoryIdsFromPlaywrightResults,
  type PlaywrightListResult,
} from "./playwright-results.js";
import { playwrightStoryIdGrep } from "./story-id-grep.js";
import type { VisualDeltaBrowser } from "../shared/environments.js";
import type { VisualTestFailureMode } from "../shared/failure-mode.js";
import { readVisualDeltaProjectConfig } from "./project-config.js";
import {
  resolveBaselinePathMode,
  resolveSnapshotDir,
} from "./options.js";
import { baselinePngAbs } from "../playwright/write-diff-artifacts.js";
import { loadStoryIndex } from "./visual-sidecars.js";
import { visualRenderFingerprints } from "./affected-visual-tests.js";
import { recompareCachedActualSet } from "./cached-actual.js";

export type VisualTestCliOptions = {
  root?: string;
  selection: "affected" | "all" | "stories";
  storyIds?: string[];
  interaction?: {
    storyId: string;
    stepId: string;
    stepLabel?: string;
    captureCallId?: string;
  };
  baselineRelativePath?: string;
  testArgs?: string[];
  dryRun?: boolean;
  explain?: boolean;
  hostOptions?: VisualDeltaHostOptions;
  browsers?: VisualDeltaBrowser[];
  failureMode?: VisualTestFailureMode;
  /** Force browser capture even when a reusable canonical actual exists. */
  fresh?: boolean;
  /** Test seam; production uses the package process runner. */
  runCommand?: typeof runCommand;
};

type CommandResult = {
  code: number;
  results: PlaywrightListResult[];
};

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";
    const forward = (
      target: NodeJS.WriteStream,
      chunk: Buffer | string,
    ): void => {
      const text = chunk.toString();
      output += text;
      target.write(text);
    };
    child.stdout?.on("data", (chunk: Buffer) => forward(process.stdout, chunk));
    child.stderr?.on("data", (chunk: Buffer) => forward(process.stderr, chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        results: parseListReporterProgress(output),
      });
    });
  });
}

export function formatAffectedVisualSummary(
  summary: AffectedVisualSummary,
  explain = false,
): string {
  const lines: string[] = [];
  if (summary.noChange && summary.selection === "affected") {
    lines.push(`Up to date · ${summary.unchanged} unchanged`);
  } else {
    lines.push(
      `${summary.selected} affected · ${summary.unchanged} unchanged · ${summary.total} total`,
    );
  }
  if (summary.fallbackReason) {
    lines.push(`Full-suite fallback: ${summary.fallbackReason}`);
  }
  if (explain && summary.changedInputs?.length) {
    lines.push("Changed inputs:");
    for (const input of summary.changedInputs) lines.push(`  ${input}`);
  }
  if (explain && summary.storyIds?.length) {
    lines.push("Selected stories:");
    for (const storyId of summary.storyIds) lines.push(`  ${storyId}`);
  }
  return lines.join("\n");
}

function printPlan(plan: AffectedVisualPlan, explain: boolean): void {
  console.log(formatAffectedVisualSummary(plan.summary, explain));
}

/**
 * Packaged `visual-delta test` runner.
 * Every executable selection builds the static Storybook used by the
 * canonical runner. Exact story selection remains exact through Playwright
 * grep and never broadens an empty or invalid request.
 */
export async function runVisualTestCli(
  options: VisualTestCliOptions,
): Promise<number> {
  const root = options.root?.trim() || process.cwd();
  const hostOptions = options.hostOptions;
  const execute = options.runCommand ?? runCommand;
  const projectConfig = readVisualDeltaProjectConfig(root);
  const configErrors = projectConfig.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (configErrors.length > 0) {
    console.error(configErrors.map((diagnostic) => diagnostic.message).join(" "));
    return 1;
  }
  const configuredBrowsers = projectConfig.browsers;
  const browsers = options.browsers?.length
    ? options.browsers
    : configuredBrowsers;
  if (new Set(browsers).size !== browsers.length) {
    console.error("Browser selections must be unique");
    return 1;
  }
  const disabled = browsers.filter(
    (browser) => !configuredBrowsers.includes(browser),
  );
  if (disabled.length > 0) {
    console.error(
      `Browsers are not enabled in project configuration: ${disabled.join(", ")}`,
    );
    return 1;
  }
  let plan = options.selection === "affected"
    ? planAffectedVisualTests(root, hostOptions)
    : planAllVisualTests(root, hostOptions);
  printPlan(plan, Boolean(options.explain));

  const requestedStoryIds = [...new Set(options.storyIds ?? [])];
  if (options.dryRun) {
    if (options.selection === "stories") {
      if (requestedStoryIds.length === 0) {
        console.error("Exact visual tests require at least one --story-id");
        return 1;
      }
      const runnable = new Set(plan.runnableStoryIds);
      const missing = requestedStoryIds.filter((storyId) => !runnable.has(storyId));
      if (missing.length > 0) {
        console.error(`Stories are not runnable visual targets: ${missing.join(", ")}`);
        return 1;
      }
    }
    return 0;
  }
  if (options.selection === "affected" && plan.summary.noChange) return 0;

  if (
    options.selection === "affected" ||
    options.selection === "stories" ||
    options.selection === "all"
  ) {
    const build = await execute("pnpm", ["build-storybook"], root);
    if (build.code !== 0) return build.code;
    plan = options.selection === "affected"
      ? planAffectedVisualTests(root, hostOptions)
      : planAllVisualTests(root, hostOptions);
    printPlan(plan, Boolean(options.explain));
    if (options.selection === "affected" && plan.summary.noChange) {
      recordAffectedVisualResults({
        root,
        hostOptions,
        passedStoryIds: [],
      });
      return 0;
    }
  }

  if (options.selection === "stories" && requestedStoryIds.length === 0) {
    console.error("Exact visual tests require at least one --story-id");
    return 1;
  }
  const runnable = new Set(plan.runnableStoryIds);
  const missingStoryIds = requestedStoryIds.filter((storyId) => !runnable.has(storyId));
  if (options.selection === "stories" && missingStoryIds.length > 0) {
    console.error(`Stories are not runnable visual targets: ${missingStoryIds.join(", ")}`);
    return 1;
  }
  const selectedStoryIds = options.selection === "all"
    ? plan.runnableStoryIds
    : options.selection === "stories"
      ? requestedStoryIds
      : plan.selectedStoryIds;
  const snapshotDir = resolveSnapshotDir(hostOptions, root);
  const baselinePathMode = resolveBaselinePathMode(hostOptions);
  if (
    projectConfig.workflow.reuseActualComparisons &&
    !options.fresh &&
    selectedStoryIds.length > 0
  ) {
    const entries = loadStoryIndex(root);
    const fingerprints = visualRenderFingerprints(root, hostOptions);
    const failureMode =
      options.failureMode ?? projectConfig.workflow.visualTestFailureMode;
    const cachedResults = selectedStoryIds.flatMap((storyId) =>
      browsers.map((browser) => {
        const entry = entries[storyId];
        const renderFingerprint = fingerprints[storyId];
        if (!entry || !renderFingerprint) return null;
        let baselinePath = options.baselineRelativePath
          ? path.resolve(
              snapshotDir,
              ...options.baselineRelativePath.split("/"),
            )
          : baselinePngAbs(
              entry,
              root,
              snapshotDir,
              baselinePathMode,
              browser,
            );
        if (options.interaction) {
          baselinePath = baselinePath.replace(
            `-${browser}.png`,
            `--${options.interaction.stepId}-${browser}.png`,
          );
        }
        return recompareCachedActualSet({
          root,
          snapshotDir,
          baselinePath,
          storyId,
          browser,
          baselinePathMode,
          renderFingerprint,
          failureMode,
        });
      }),
    );
    if (
      cachedResults.length === selectedStoryIds.length * browsers.length &&
      cachedResults.every(Boolean)
    ) {
      console.log(
        `[visual-delta] Reused canonical actuals for ${selectedStoryIds.length} stor${selectedStoryIds.length === 1 ? "y" : "ies"} across ${browsers.length} browser target${browsers.length === 1 ? "" : "s"}.`,
      );
      const passed = cachedResults.every((result) => result?.passed);
      recordAffectedVisualResults({
        root,
        hostOptions,
        passedStoryIds: passed ? selectedStoryIds : [],
      });
      return passed ? 0 : 1;
    }
    console.log("[visual-delta] Cached actual set is stale or incomplete; launching canonical browser capture.");
  }
  const grep = options.selection === "all" ||
    (options.selection === "affected" && plan.summary.fallbackReason)
    ? undefined
    : playwrightStoryIdGrep(selectedStoryIds);
  const result = await execute(
    "pnpm",
    [
      ...(options.testArgs?.length
        ? options.testArgs
        : DEFAULT_VISUAL_TEST_ARGS),
      "--reporter=list",
      ...browsers.flatMap((browser) => ["--project", browser]),
      ...(grep ? ["-g", grep] : []),
    ],
    root,
    {
      PLAYWRIGHT_UPDATE_SNAPSHOTS: "0",
      VISUAL_DELTA_SNAPSHOT_DIR: snapshotDir,
      VISUAL_DELTA_BASELINE_PATH_MODE: baselinePathMode,
      ...(options.failureMode
        ? { VISUAL_DELTA_FAILURE_MODE: options.failureMode }
        : {}),
      ...(options.interaction
        ? { PLAYWRIGHT_INTERACTION_CAPTURE: JSON.stringify(options.interaction) }
        : {}),
      ...(options.baselineRelativePath
        ? { VISUAL_DELTA_BASELINE_OVERRIDE: options.baselineRelativePath }
        : {}),
    },
  );
  const passedStoryIds = successfulStoryIdsFromPlaywrightResults({
    root,
    hostOptions,
    results: result.results,
  });
  recordAffectedVisualResults({
    root,
    hostOptions,
    passedStoryIds,
  });
  return result.code;
}
