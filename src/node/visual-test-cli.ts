import { spawn } from "node:child_process";
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

export type VisualTestCliOptions = {
  root?: string;
  selection: "affected" | "all";
  dryRun?: boolean;
  explain?: boolean;
  hostOptions?: VisualDeltaHostOptions;
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
 * Affected mode rebuilds before capture; all mode preserves the existing
 * compare-only Playwright behavior and opportunistically seeds the cache.
 */
export async function runVisualTestCli(
  options: VisualTestCliOptions,
): Promise<number> {
  const root = options.root?.trim() || process.cwd();
  const hostOptions = options.hostOptions;
  let plan =
    options.selection === "affected"
      ? planAffectedVisualTests(root, hostOptions)
      : planAllVisualTests(root, hostOptions);
  printPlan(plan, Boolean(options.explain));

  if (options.dryRun) return 0;
  if (options.selection === "affected" && plan.summary.noChange) return 0;

  if (options.selection === "affected") {
    const build = await runCommand("pnpm", ["build-storybook"], root);
    if (build.code !== 0) return build.code;
    plan = planAffectedVisualTests(root, hostOptions);
    printPlan(plan, Boolean(options.explain));
    if (plan.summary.noChange) {
      recordAffectedVisualResults({
        root,
        hostOptions,
        passedStoryIds: [],
      });
      return 0;
    }
  }

  const selectedStoryIds =
    options.selection === "all" ? plan.runnableStoryIds : plan.selectedStoryIds;
  const grep =
    options.selection === "affected" && !plan.summary.fallbackReason
      ? playwrightStoryIdGrep(selectedStoryIds)
      : undefined;
  const result = await runCommand(
    "pnpm",
    [
      ...DEFAULT_VISUAL_TEST_ARGS,
      "--reporter=list",
      ...(grep ? ["-g", grep] : []),
    ],
    root,
    {
      PLAYWRIGHT_UPDATE_SNAPSHOTS: "0",
    },
  );
  const passedStoryIds =
    result.code === 0
      ? selectedStoryIds
      : successfulStoryIdsFromPlaywrightResults({
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
