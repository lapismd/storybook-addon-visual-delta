#!/usr/bin/env node
import {
  runBaselineUpdate,
  runInteractionUpdate,
  runSkipVisualTag,
  type BaselineCliOptions,
} from "./baseline-cli.js";
import { runVisualDeltaInit } from "./init-scaffold.js";
import {
  formatAffectedVisualSummary,
  runVisualTestCli,
} from "./visual-test-cli.js";
import {
  planAffectedVisualTests,
  recordAffectedVisualResultsForPlan,
} from "./affected-visual-tests.js";
import {
  isVisualDeltaBrowser,
  type VisualDeltaBrowser,
} from "../shared/environments.js";
import {
  isVisualTestFailureMode,
  type VisualTestFailureMode,
} from "../shared/failure-mode.js";
import {
  VISUAL_DELTA_CAPTURE_WORKER_ENV,
  resolveVisualDeltaCaptureRunner,
  runVisualDeltaInCaptureRunner,
} from "./capture-runner.js";
import {
  applyVisualBaselineMigration,
  planVisualBaselineMigration,
} from "./baseline-migration.js";
import {
  formatVisualDeltaDoctorReport,
  runVisualDeltaDoctor,
  visualDeltaDoctorExitCode,
} from "./doctor.js";

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function readFlags(argv: string[], name: string): string[] {
  return argv.flatMap((value, index) =>
    value === name && argv[index + 1] ? [argv[index + 1]!] : [],
  );
}

function parseShared(argv: string[]): BaselineCliOptions {
  const browser = readFlag(argv, "--browser");
  const storySourceFormatterCommand = readFlag(
    argv,
    "--story-source-formatter-command",
  );
  return {
    storyIds: readFlags(argv, "--story-id"),
    storyId: readFlag(argv, "--story-id"),
    component: readFlag(argv, "--component"),
    stepLabel: readFlag(argv, "--step-label"),
    stepId: readFlag(argv, "--step-id"),
    captureCallId: readFlag(argv, "--capture-call-id"),
    snapshotDir: readFlag(argv, "--snapshot-dir"),
    baselinePathMode: readFlag(argv, "--baseline-path-mode") as
      | "story-id"
      | "nested-import"
      | undefined,
    visualServerPort: readFlag(argv, "--port")
      ? Number(readFlag(argv, "--port"))
      : undefined,
    approved: hasFlag(argv, "--approved"),
    allowDirty: hasFlag(argv, "--allow-dirty"),
    skipBuild: hasFlag(argv, "--skip-build"),
    forceRebuild: hasFlag(argv, "--rebuild"),
    createOnly: hasFlag(argv, "--create-only"),
    browser: isVisualDeltaBrowser(browser) ? browser : undefined,
    storySourceFormatter: storySourceFormatterCommand
      ? {
          command: storySourceFormatterCommand,
          args: readFlags(argv, "--story-source-formatter-arg"),
        }
      : undefined,
  };
}

function printHelp(): void {
  console.log(`visual-delta — packaged Visual Delta baseline CLI

Usage:
  visual-delta init [--force] [--port <n>]
  visual-delta doctor [--runner] [--build] [--fix] [--strict] [--json] [--verbose]
  visual-delta test --affected|--all|--story-id <id> [--browser <id> …] [--fresh] [--failure-mode warn|strict] [--dry-run] [--explain]
  visual-delta update --story-id <id> [--story-id <id> …] [--create-only] [--approved] …
  visual-delta interaction-update --story-id <id> --step-label <label> …
  visual-delta harness doctor
  visual-delta migrate-baselines [--snapshot-dir <path> …] [--dry-run|--apply --approved]
  visual-delta skip --story-id <id>|--component <name>
  visual-delta include --story-id <id>|--component <name>

Commands:
  init                      Scaffold suite, Playwright config, snapshot dir, scripts
  doctor                    Validate installation, snapshots, artifacts, and caches
  test                      Compare affected, all, or exact visual stories
  update                    Create/overwrite primary baselines + CSF wiring
  interaction-update        Mid-play interaction baseline
  skip                      Add skip-visual (exclude from Playwright visual runs)
  include                   Remove skip-visual
  harness doctor            Validate Docker/custom runner and capture profile
  migrate-baselines         Inventory or apply browser-only filename cutover

Flags:
  --force                   Overwrite existing scaffold files (init)
  --config-dir <path>       Storybook configuration directory (doctor)
  --affected                Trace from the last passing local run
  --all                     Run every visual story and seed affected state
  --browser <id>            chromium | firefox | webkit (repeatable for test)
  --failure-mode <mode>     warn | strict (test only; default warn)
  --fresh                   Force canonical browser capture; bypass reusable actuals
  --dry-run                 Plan selection without building or capturing
  --explain                 Print changed inputs, selected stories, and fallback
  --cache-dir <path>        Override affected cache directory
  --external <glob>         Full-run bailout input (repeatable)
  --untraced <glob>         Ignore a known non-rendering input (repeatable; reduces coverage)
  --story-id <id>           Exact Storybook story id (repeatable for test/update)
  --component <name>        Grep / title substring (update / skip / include)
  --step-label <label>      Play step label (interaction-update)
  --step-id <id>            Override slugified step id
  --capture-call-id <id>    Replay an exact Storybook Interactions call
  --create-only             Missing PNGs only (no overwrite)
  --approved                Required unless VISUAL_UPDATE_APPROVED=1
  --allow-dirty             Reserved (host git gates may use this)
  --skip-build              Prefer existing storybook-static when complete
  --rebuild                 Force build-storybook before capture (overrides --skip-build)
  --snapshot-dir <path>     Override snapshot directory
  --baseline-path-mode      story-id | nested-import
  --story-source-formatter-command <command>
                            Formatter executable for changed CSF source
  --story-source-formatter-arg <arg>
                            Repeatable formatter arg; include {filePath}
  --runner                  Run the full capture-runner probe (doctor)
  --build                   Rebuild Storybook before ownership checks (doctor)
  --fix                     Move or quarantine safe derived state (doctor)
  --strict                  Fail doctor when warnings remain
  --json                    Print the complete versioned doctor report as JSON
  --verbose                 Print every doctor finding path
  --port <n>                Playwright static server port (default: STORYBOOK_PORT+1)
  --apply                   Apply a migration plan after canonical recapture
`);
}

async function main(argv: string[]): Promise<void> {
  const command = argv[0];
  if (!command || command === "-h" || command === "--help") {
    printHelp();
    process.exit(command ? 0 : 1);
  }

  const rest = argv.slice(1);

  if (command === "doctor") {
    const valueFlags = new Set([
      "--config-dir",
      "--snapshot-dir",
      "--baseline-path-mode",
    ]);
    const booleanFlags = new Set([
      "--runner",
      "--build",
      "--fix",
      "--strict",
      "--json",
      "--verbose",
      "--help",
      "-h",
    ]);
    for (let index = 0; index < rest.length; index += 1) {
      const value = rest[index]!;
      if (valueFlags.has(value)) {
        if (!rest[index + 1] || rest[index + 1]!.startsWith("--")) {
          throw new Error(`${value} requires a value.`);
        }
        index += 1;
      } else if (!booleanFlags.has(value)) {
        throw new Error(`Unknown doctor flag: ${value}`);
      }
    }
    if (hasFlag(rest, "--help") || hasFlag(rest, "-h")) {
      printHelp();
      return;
    }
    const pathMode = readFlag(rest, "--baseline-path-mode");
    if (pathMode && pathMode !== "story-id" && pathMode !== "nested-import") {
      throw new Error("--baseline-path-mode must be story-id or nested-import.");
    }
    const json = hasFlag(rest, "--json");
    const strict = hasFlag(rest, "--strict");
    const report = await runVisualDeltaDoctor({
      configDir: readFlag(rest, "--config-dir"),
      snapshotDir: readFlag(rest, "--snapshot-dir"),
      baselinePathMode: pathMode as
        | "story-id"
        | "nested-import"
        | undefined,
      runner: hasFlag(rest, "--runner"),
      build: hasFlag(rest, "--build"),
      fix: hasFlag(rest, "--fix"),
      strict,
      json,
      verbose: hasFlag(rest, "--verbose"),
    });
    console.log(
      json
        ? JSON.stringify(report, null, 2)
        : formatVisualDeltaDoctorReport(report, {
            verbose: hasFlag(rest, "--verbose"),
          }),
    );
    process.exitCode = visualDeltaDoctorExitCode(report, strict);
    return;
  }

  if (command === "harness") {
    if (rest[0] !== "doctor") {
      throw new Error("Usage: visual-delta harness doctor");
    }
    const runner = await resolveVisualDeltaCaptureRunner(process.cwd());
    const result = runner.doctor
      ? await runner.doctor()
      : { ok: true, diagnostics: [] };
    console.log(
      JSON.stringify(
        {
          ok: result.ok,
          runner: { id: runner.id, kind: runner.kind },
          profile: runner.profile,
          diagnostics: result.diagnostics,
        },
        null,
        2,
      ),
    );
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (command === "migrate-baselines") {
    if (hasFlag(rest, "--apply") && hasFlag(rest, "--dry-run")) {
      throw new Error("Choose --dry-run or --apply, not both.");
    }
    const plan = planVisualBaselineMigration({
      root: process.cwd(),
      snapshotDirs: readFlags(rest, "--snapshot-dir"),
      cacheDirs: readFlags(rest, "--cache-dir"),
    });
    if (!hasFlag(rest, "--apply")) {
      console.log(JSON.stringify(plan, null, 2));
      process.exitCode = plan.canApply ? 0 : 2;
      return;
    }
    const result = applyVisualBaselineMigration(plan, {
      approved: hasFlag(rest, "--approved"),
    });
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    return;
  }

  if (command === "init") {
    const result = runVisualDeltaInit({
      force: hasFlag(rest, "--force"),
      port: readFlag(rest, "--port")
        ? Number(readFlag(rest, "--port"))
        : undefined,
      skipPackageJson: hasFlag(rest, "--skip-package-json"),
    });
    console.log("Visual Delta init");
    if (result.written.length) {
      console.log(`  wrote: ${result.written.join(", ")}`);
    }
    if (result.skipped.length) {
      console.log(`  skipped (exists): ${result.skipped.join(", ")}`);
    }
    if (result.scriptsUpdated.length) {
      console.log(`  scripts: ${result.scriptsUpdated.join(", ")}`);
    }
    console.log(
      'Next: register the addon in .storybook/main.ts, run "visual-delta doctor", then Create visual in the panel.',
    );
    return;
  }

  const options = parseShared(rest);

  if (
    command === "test" &&
    process.env[VISUAL_DELTA_CAPTURE_WORKER_ENV] !== "1" &&
    !hasFlag(rest, "--dry-run") &&
    hasFlag(rest, "--affected")
  ) {
    const preflight = planAffectedVisualTests(process.cwd(), {
      snapshotDir: options.snapshotDir,
      baselinePathMode: options.baselinePathMode,
      affectedTests: {
        cacheDir: readFlag(rest, "--cache-dir"),
        externals: readFlags(rest, "--external"),
        untraced: readFlags(rest, "--untraced"),
      },
    });
    console.log(
      formatAffectedVisualSummary(preflight.summary, hasFlag(rest, "--explain")),
    );
    if (preflight.summary.noChange) {
      recordAffectedVisualResultsForPlan(preflight, [], {
        snapshotDir: options.snapshotDir,
        baselinePathMode: options.baselinePathMode,
        affectedTests: {
          cacheDir: readFlag(rest, "--cache-dir"),
          externals: readFlags(rest, "--external"),
          untraced: readFlags(rest, "--untraced"),
        },
      });
      process.exitCode = 0;
      return;
    }
  }

  if (
    process.env[VISUAL_DELTA_CAPTURE_WORKER_ENV] !== "1" &&
    ((command === "test" && !hasFlag(rest, "--dry-run")) ||
      command === "update" ||
      command === "visual-update" ||
      command === "interaction-update" ||
      command === "visual-interaction-update")
  ) {
    const operation = command === "test"
      ? "test"
      : command === "update" || command === "visual-update"
        ? "update"
        : "interaction-update";
    const browserValues = readFlags(rest, "--browser").filter(
      isVisualDeltaBrowser,
    );
    const exitCode = await runVisualDeltaInCaptureRunner({
      root: process.cwd(),
      argv,
      operation,
      storyIds: readFlags(rest, "--story-id"),
      browsers: browserValues,
      failureMode: readFlag(rest, "--failure-mode") as
        | VisualTestFailureMode
        | undefined,
      mutationApproved:
        hasFlag(rest, "--approved") ||
        process.env.VISUAL_UPDATE_APPROVED === "1",
    });
    process.exitCode = exitCode;
    return;
  }

  if (command === "test") {
    const affected = hasFlag(rest, "--affected");
    const all = hasFlag(rest, "--all");
    const storyIds = readFlags(rest, "--story-id");
    const selections = Number(affected) + Number(all) + Number(storyIds.length > 0);
    if (selections !== 1) {
      throw new Error("Choose exactly one of --affected, --all, or --story-id");
    }
    if (
      (readFlag(rest, "--step-id") || readFlag(rest, "--baseline-rel")) &&
      storyIds.length !== 1
    ) {
      throw new Error("Interaction and baseline-target tests require one exact --story-id");
    }
    const browserValues = readFlags(rest, "--browser");
    const invalidBrowser = browserValues.find(
      (browser) => !isVisualDeltaBrowser(browser),
    );
    if (invalidBrowser) {
      throw new Error(`Unsupported browser: ${invalidBrowser}`);
    }
    if (new Set(browserValues).size !== browserValues.length) {
      throw new Error("--browser values must be unique");
    }
    const failureModeValue = readFlag(rest, "--failure-mode");
    if (failureModeValue && !isVisualTestFailureMode(failureModeValue)) {
      throw new Error('failure mode must be "warn" or "strict"');
    }
    if (hasFlag(rest, "--rebuild")) {
      process.env.VISUAL_DELTA_FORCE_REBUILD = "1";
    }
    const exitCode = await runVisualTestCli({
      selection: affected ? "affected" : all ? "all" : "stories",
      storyIds,
      ...(readFlag(rest, "--step-id")
        ? {
            interaction: {
              storyId: storyIds[0]!,
              stepId: readFlag(rest, "--step-id")!,
              ...(readFlag(rest, "--step-label")
                ? { stepLabel: readFlag(rest, "--step-label") }
                : {}),
              ...(readFlag(rest, "--capture-call-id")
                ? { captureCallId: readFlag(rest, "--capture-call-id") }
                : {}),
            },
          }
        : {}),
      baselineRelativePath: readFlag(rest, "--baseline-rel"),
      testArgs: readFlags(rest, "--visual-test-arg"),
      dryRun: hasFlag(rest, "--dry-run"),
      explain: hasFlag(rest, "--explain"),
      browsers: browserValues as VisualDeltaBrowser[],
      failureMode: failureModeValue as VisualTestFailureMode | undefined,
      fresh: hasFlag(rest, "--fresh"),
      hostOptions: {
        snapshotDir: options.snapshotDir,
        baselinePathMode: options.baselinePathMode,
        affectedTests: {
          cacheDir: readFlag(rest, "--cache-dir"),
          externals: readFlags(rest, "--external"),
          untraced: readFlags(rest, "--untraced"),
        },
      },
    });
    process.exitCode = exitCode;
    return;
  }

  if (command === "update" || command === "visual-update") {
    const browser = readFlag(rest, "--browser");
    if (browser && !isVisualDeltaBrowser(browser)) {
      throw new Error(`Unsupported browser: ${browser}`);
    }
    if (readFlags(rest, "--browser").length > 1) {
      throw new Error("Baseline updates accept one --browser value");
    }
    await runBaselineUpdate(options);
    return;
  }
  if (
    command === "interaction-update" ||
    command === "visual-interaction-update"
  ) {
    const browser = readFlag(rest, "--browser");
    if (browser && !isVisualDeltaBrowser(browser)) {
      throw new Error(`Unsupported browser: ${browser}`);
    }
    if (readFlags(rest, "--browser").length > 1) {
      throw new Error("Interaction updates accept one --browser value");
    }
    await runInteractionUpdate(options);
    return;
  }
  if (command === "skip" || command === "include") {
    const result = runSkipVisualTag({
      ...options,
      skip: command === "skip",
    });
    console.log(
      `${command}: ${result.updated.length} stor${result.updated.length === 1 ? "y" : "ies"}`,
    );
    if (result.errors.length) {
      for (const err of result.errors) console.error(`  ${err}`);
      process.exitCode = 1;
    }
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
