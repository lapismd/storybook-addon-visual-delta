#!/usr/bin/env node
import {
  readFlag,
  readFlags,
  hasFlag,
  parseShared,
  printHelp,
  configureCaptureCli,
} from "./cli-options.js";
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

async function main(argv: string[]): Promise<void> {
  argv = configureCaptureCli(argv);
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
      throw new Error(
        "--baseline-path-mode must be story-id or nested-import.",
      );
    }
    const json = hasFlag(rest, "--json");
    const strict = hasFlag(rest, "--strict");
    const report = await runVisualDeltaDoctor({
      configDir: readFlag(rest, "--config-dir"),
      snapshotDir: readFlag(rest, "--snapshot-dir"),
      baselinePathMode: pathMode as "story-id" | "nested-import" | undefined,
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
      formatAffectedVisualSummary(
        preflight.summary,
        hasFlag(rest, "--explain"),
      ),
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
    const operation =
      command === "test"
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
    const selections =
      Number(affected) + Number(all) + Number(storyIds.length > 0);
    if (selections !== 1) {
      throw new Error("Choose exactly one of --affected, --all, or --story-id");
    }
    if (
      (readFlag(rest, "--step-id") || readFlag(rest, "--baseline-rel")) &&
      storyIds.length !== 1
    ) {
      throw new Error(
        "Interaction and baseline-target tests require one exact --story-id",
      );
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
