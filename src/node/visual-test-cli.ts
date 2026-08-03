import { spawn } from "node:child_process";
import path from "node:path";
import type { AffectedVisualSummary } from "../shared/affected-types.js";
import {
  planAffectedVisualTests,
  planAllVisualTests,
  planExactVisualTests,
  recordAffectedVisualResultsForPlan,
  visualCanonicalBuildFingerprintForPlan,
  visualRenderFingerprintsForPlan,
  type AffectedVisualPlan,
} from "./affected-visual-tests.js";
import {
  DEFAULT_VISUAL_TEST_ARGS,
  type VisualDeltaHostOptions,
} from "./options.js";
import {
  parseListReporterProgress,
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
import { recompareCachedActualSet } from "./cached-actual.js";
import type { CachedActualComparison } from "./cached-actual.js";
import {
  loadModeSidecarsForStoryId,
  loadSidecarForStoryId,
} from "./visual-sidecars.js";
import {
  persistCanonicalBuildCache,
  resolveCanonicalBuildCacheRoot,
  restoreCanonicalBuildCache,
} from "./canonical-build-cache.js";

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
  } else if (summary.selection === "selected") {
    lines.push(
      `${summary.selected} selected · ${summary.unchanged} outside scope · ${summary.total} total`,
    );
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

function planSelection(options: {
  root: string;
  selection: VisualTestCliOptions["selection"];
  storyIds: string[];
  hostOptions?: VisualDeltaHostOptions;
}): AffectedVisualPlan {
  if (options.selection === "affected") {
    return planAffectedVisualTests(options.root, options.hostOptions);
  }
  if (options.selection === "stories") {
    return planExactVisualTests(
      options.root,
      options.storyIds,
      options.hostOptions,
    );
  }
  return planAllVisualTests(options.root, options.hostOptions);
}

function variantKey(sidecar: {
  variant?: { kind: string; id?: string };
  mode?: string;
}): string {
  if (sidecar.variant?.kind === "mode") {
    return `mode:${sidecar.variant.id ?? sidecar.mode ?? ""}`;
  }
  if (sidecar.variant?.kind === "interaction") {
    return `interaction:${sidecar.variant.id ?? ""}`;
  }
  return sidecar.mode ? `mode:${sidecar.mode}` : "primary";
}

function captureTargetKey(
  storyId: string,
  browser: VisualDeltaBrowser,
): string {
  return `${storyId}\0${browser}`;
}

type CachedCaptureTarget = {
  storyId: string;
  browser: VisualDeltaBrowser;
  result: CachedActualComparison;
};

function groupPendingCaptures(
  storyIds: readonly string[],
  browsers: readonly VisualDeltaBrowser[],
  cached: ReadonlyMap<string, CachedCaptureTarget>,
): Array<{ storyIds: string[]; browsers: VisualDeltaBrowser[] }> {
  const groups = new Map<
    string,
    { storyIds: string[]; browsers: VisualDeltaBrowser[] }
  >();
  for (const browser of browsers) {
    const pending = storyIds.filter(
      (storyId) => !cached.has(captureTargetKey(storyId, browser)),
    );
    if (!pending.length) continue;
    const key = pending.join("\0");
    const group = groups.get(key) ?? { storyIds: pending, browsers: [] };
    group.browsers.push(browser);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function policyPassingStoryIds(options: {
  root: string;
  snapshotDir: string;
  baselinePathMode: ReturnType<typeof resolveBaselinePathMode>;
  storyIds: readonly string[];
  browsers: readonly VisualDeltaBrowser[];
}): { passing: string[]; strictFailure: boolean } {
  let strictFailure = false;
  const passing = options.storyIds.filter((storyId) =>
    options.browsers.every((browser) => {
      const primary = loadSidecarForStoryId(
        storyId,
        options.root,
        options.snapshotDir,
        options.baselinePathMode,
        browser,
      );
      if (!primary) {
        strictFailure = true;
        return false;
      }
      const sidecars = [
        primary,
        ...loadModeSidecarsForStoryId(
          storyId,
          options.root,
          options.snapshotDir,
          options.baselinePathMode,
          browser,
        ),
      ];
      const actualVariants = new Set(sidecars.map(variantKey));
      const expectedVariants = new Set(
        (primary.captureSet ?? []).map((item) => variantKey(item)),
      );
      const complete =
        expectedVariants.size === 0 ||
        [...expectedVariants].every((variant) => actualVariants.has(variant));
      const failed = sidecars.some(
        (sidecar) =>
          sidecar.policyStatus === "failed" ||
          sidecar.outcome === "error" ||
          sidecar.passed === false,
      );
      if (failed || !complete) strictFailure = true;
      return (
        complete &&
        sidecars.every(
          (sidecar) =>
            sidecar.passed === true && sidecar.policyStatus === "passed",
        )
      );
    }),
  );
  return { passing, strictFailure };
}

/**
 * Packaged `visual-delta test` runner.
 * Every executable selection uses a verified canonical static Storybook.
 * Exact story selection remains exact through Playwright grep and never
 * broadens an empty or invalid request.
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
  const requestedStoryIds = [...new Set(options.storyIds ?? [])];
  if (options.selection === "stories" && requestedStoryIds.length === 0) {
    console.error("Exact visual tests require at least one --story-id");
    return 1;
  }
  let plan = planSelection({
    root,
    selection: options.selection,
    storyIds: requestedStoryIds,
    hostOptions,
  });
  printPlan(plan, Boolean(options.explain));

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
  if (options.selection === "affected" && plan.summary.noChange) {
    recordAffectedVisualResultsForPlan(plan, [], hostOptions);
    return 0;
  }

  let selectedStoryIds = options.selection === "all"
    ? plan.runnableStoryIds
    : options.selection === "stories"
      ? requestedStoryIds
      : plan.selectedStoryIds;
  const snapshotDir = resolveSnapshotDir(hostOptions, root);
  const baselinePathMode = resolveBaselinePathMode(hostOptions);
  const failureMode =
    options.failureMode ?? projectConfig.workflow.visualTestFailureMode;
  const reuseEnabled =
    projectConfig.workflow.reuseActualComparisons && !options.fresh;
  const forceRebuild = process.env.VISUAL_DELTA_FORCE_REBUILD === "1";
  const resolveCachedTargets = (
    currentPlan: AffectedVisualPlan,
    currentStoryIds: readonly string[],
  ): Map<string, CachedCaptureTarget> => {
    const cached = new Map<string, CachedCaptureTarget>();
    if (!reuseEnabled || currentStoryIds.length === 0) return cached;
    const entries = loadStoryIndex(root);
    const fingerprints = visualRenderFingerprintsForPlan(currentPlan);
    for (const storyId of currentStoryIds) {
      for (const browser of browsers) {
        const entry = entries[storyId];
        const renderFingerprint = fingerprints[storyId];
        if (!entry || !renderFingerprint) continue;
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
        const result = recompareCachedActualSet({
          root,
          snapshotDir,
          baselinePath,
          storyId,
          browser,
          baselinePathMode,
          renderFingerprint,
          failureMode,
        });
        if (result) {
          cached.set(captureTargetKey(storyId, browser), {
            storyId,
            browser,
            result,
          });
        }
      }
    }
    return cached;
  };
  const completeCachedRun = (
    cached: ReadonlyMap<string, CachedCaptureTarget>,
    currentStoryIds: readonly string[],
  ): number | null => {
    if (cached.size !== currentStoryIds.length * browsers.length) return null;
    if (currentStoryIds.length > 0) {
      console.log(
        `[visual-delta] Reused canonical actuals for ${currentStoryIds.length} stor${currentStoryIds.length === 1 ? "y" : "ies"} across ${browsers.length} browser target${browsers.length === 1 ? "" : "s"}.`,
      );
    }
    const passed = [...cached.values()].every(
      (target) => target.result.passed,
    );
    const passingStoryIds = currentStoryIds.filter((storyId) =>
        browsers.every((browser) => {
          const target = cached.get(captureTargetKey(storyId, browser));
          return target?.result.sidecars.every(
            (sidecar) =>
              sidecar.passed === true && sidecar.policyStatus === "passed",
          );
        }),
      );
    recordAffectedVisualResultsForPlan(plan, passingStoryIds, hostOptions);
    return passed ? 0 : 1;
  };

  let cachedTargets = resolveCachedTargets(plan, selectedStoryIds);
  if (!forceRebuild) {
    const cachedExit = completeCachedRun(cachedTargets, selectedStoryIds);
    if (cachedExit != null) return cachedExit;
  }
  if (reuseEnabled && selectedStoryIds.length > 0) {
    console.log("[visual-delta] Cached actual set is stale or incomplete; launching canonical browser capture.");
  }

  const cacheRoot = resolveCanonicalBuildCacheRoot(root);
  const buildFingerprint = visualCanonicalBuildFingerprintForPlan(plan);
  const restored = restoreCanonicalBuildCache({
    root,
    cacheRoot,
    fingerprint: buildFingerprint,
    forceRebuild,
  });
  let built = false;
  if (!restored.restored) {
    console.log(
      `[visual-delta] Canonical Storybook build cache ${restored.reason}; rebuilding.`,
    );
    const build = await execute("pnpm", ["build-storybook"], root);
    if (build.code !== 0) return build.code;
    built = true;
  } else {
    console.log("[visual-delta] Restored verified canonical Storybook build.");
  }
  plan = planSelection({
    root,
    selection: options.selection,
    storyIds: requestedStoryIds,
    hostOptions,
  });
  printPlan(plan, Boolean(options.explain));
  if (built) {
    persistCanonicalBuildCache({
      root,
      cacheRoot,
      fingerprint: visualCanonicalBuildFingerprintForPlan(plan),
    });
  }
  if (options.selection === "affected" && plan.summary.noChange) {
    recordAffectedVisualResultsForPlan(plan, [], hostOptions);
    return 0;
  }

  const runnable = new Set(plan.runnableStoryIds);
  const missingStoryIds = requestedStoryIds.filter(
    (storyId) => !runnable.has(storyId),
  );
  if (options.selection === "stories" && missingStoryIds.length > 0) {
    console.error(
      `Stories are not runnable visual targets: ${missingStoryIds.join(", ")}`,
    );
    return 1;
  }
  selectedStoryIds =
    options.selection === "all"
      ? plan.runnableStoryIds
      : options.selection === "stories"
        ? requestedStoryIds
        : plan.selectedStoryIds;
  cachedTargets = resolveCachedTargets(plan, selectedStoryIds);
  const cachedExit = completeCachedRun(cachedTargets, selectedStoryIds);
  if (cachedExit != null) return cachedExit;
  const captureGroups = groupPendingCaptures(
    selectedStoryIds,
    browsers,
    cachedTargets,
  );
  if (cachedTargets.size > 0) {
    const totalTargets = selectedStoryIds.length * browsers.length;
    console.log(
      `[visual-delta] Reused ${cachedTargets.size}/${totalTargets} canonical actual targets; capturing ${totalTargets - cachedTargets.size}.`,
    );
  }
  const capturedResults: PlaywrightListResult[] = [];
  let infrastructureExitCode = 0;
  for (const group of captureGroups) {
    const capturesWholeSelection =
      group.storyIds.length === selectedStoryIds.length &&
      group.storyIds.every((storyId) => selectedStoryIds.includes(storyId));
    const grep = capturesWholeSelection &&
        (options.selection === "all" ||
          (options.selection === "affected" && plan.summary.fallbackReason))
      ? undefined
      : playwrightStoryIdGrep(group.storyIds);
    const result = await execute(
      "pnpm",
      [
        ...(options.testArgs?.length
          ? options.testArgs
          : DEFAULT_VISUAL_TEST_ARGS),
        "--reporter=list",
        ...group.browsers.flatMap((browser) => ["--project", browser]),
        ...(grep ? ["-g", grep] : []),
      ],
      root,
      {
        PLAYWRIGHT_UPDATE_SNAPSHOTS: "0",
        VISUAL_DELTA_SNAPSHOT_DIR: snapshotDir,
        VISUAL_DELTA_BASELINE_PATH_MODE: baselinePathMode,
        VISUAL_DELTA_FAILURE_MODE: failureMode,
        VISUAL_DELTA_DEFER_POLICY_FAILURES: "1",
        ...(options.interaction
          ? { PLAYWRIGHT_INTERACTION_CAPTURE: JSON.stringify(options.interaction) }
          : {}),
        ...(options.baselineRelativePath
          ? { VISUAL_DELTA_BASELINE_OVERRIDE: options.baselineRelativePath }
          : {}),
      },
    );
    capturedResults.push(...result.results);
    if (result.code !== 0) {
      infrastructureExitCode = result.code;
      break;
    }
  }
  const playwrightPassedStoryIds = selectedStoryIds.filter((storyId) =>
    browsers.every((browser) =>
      cachedTargets.has(captureTargetKey(storyId, browser)) ||
      capturedResults.some(
        (candidate) =>
          candidate.storyId === storyId &&
          candidate.browser === browser &&
          candidate.status === "passed",
      ),
    ),
  );
  const policy = policyPassingStoryIds({
    root,
    snapshotDir,
    baselinePathMode,
    storyIds: selectedStoryIds,
    browsers,
  });
  const passedByPlaywright = new Set(playwrightPassedStoryIds);
  recordAffectedVisualResultsForPlan(
    plan,
    policy.passing.filter((storyId) => passedByPlaywright.has(storyId)),
    hostOptions,
  );
  if (infrastructureExitCode !== 0) return infrastructureExitCode;
  return failureMode === "strict" && policy.strictFailure ? 1 : 0;
}
