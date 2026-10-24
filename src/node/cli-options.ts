import type { BaselineCliOptions } from "./baseline-cli.js";
import { isVisualDeltaBrowser } from "../shared/environments.js";
export function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

export function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

export function readFlags(argv: string[], name: string): string[] {
  return argv.flatMap((value, index) =>
    value === name && argv[index + 1] ? [argv[index + 1]!] : [],
  );
}

export function parseShared(argv: string[]): BaselineCliOptions {
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
    updateReviewStatus: hasFlag(argv, "--update-status"),
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

export function printHelp(): void {
  console.log(`visual-delta — packaged Visual Delta baseline CLI

Usage:
  visual-delta init [--force] [--port <n>]
  visual-delta doctor [--runner] [--build] [--fix] [--strict] [--json] [--verbose]
  visual-delta test --affected|--all|--story-id <id> [--browser <id> …] [--fresh] [--failure-mode warn|strict] [--dry-run] [--explain]
  visual-delta update --story-id <id> [--story-id <id> …] [--create-only] [--approved] [--update-status] …
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
  --capture-profile <name>  Select a named Docker, native or custom profile
  --no-local-config         Ignore .visual-delta/config.local.json
  --force                   Overwrite existing scaffold files (init)
  --config-dir <path>       Storybook configuration directory (doctor)
  --affected                Trace from the last passing local run
  --all                     Run every visual story and seed affected state
  --browser <id>            chromium | firefox | webkit (repeatable for test)
  --failure-mode <mode>     warn | strict (test only; default warn)
  --fresh                   Force browser capture; bypass reusable actuals
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
  --update-status           Mark updated primary-baseline stories pending
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

export function configureCaptureCli(
  argv: string[],
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const args = [...argv];
  if (args.filter((value) => value === "--capture-profile").length > 1)
    throw new Error("--capture-profile accepts exactly one profile.");
  const index = args.indexOf("--capture-profile");
  if (index >= 0) {
    const profile = args[index + 1];
    if (!profile || profile.startsWith("--"))
      throw new Error("--capture-profile requires a profile name.");
    environment.VISUAL_DELTA_CAPTURE_PROFILE = profile;
    args.splice(index, 2);
  }
  if (args.includes("--no-local-config"))
    environment.VISUAL_DELTA_NO_LOCAL_CONFIG = "1";
  return args.filter((value) => value !== "--no-local-config");
}
