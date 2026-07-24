#!/usr/bin/env node
import {
  runBaselineUpdate,
  runInteractionUpdate,
  runSkipVisualTag,
  type BaselineCliOptions,
} from "./baseline-cli.js";
import { runVisualDeltaInit } from "./init-scaffold.js";

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function parseShared(argv: string[]): BaselineCliOptions {
  return {
    storyId: readFlag(argv, "--story-id"),
    component: readFlag(argv, "--component"),
    stepLabel: readFlag(argv, "--step-label"),
    stepId: readFlag(argv, "--step-id"),
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
    createOnly: hasFlag(argv, "--create-only"),
  };
}

function printHelp(): void {
  console.log(`visual-delta — packaged Visual Delta baseline CLI

Usage:
  visual-delta init [--force] [--port <n>]
  visual-delta update --story-id <id> [--create-only] [--approved] …
  visual-delta interaction-update --story-id <id> --step-label <label> …
  visual-delta skip --story-id <id>|--component <name>
  visual-delta include --story-id <id>|--component <name>

Commands:
  init                      Scaffold suite, Playwright config, snapshot dir, scripts
  update                    Create/overwrite primary baselines + CSF wiring
  interaction-update        Mid-play interaction baseline
  skip                      Add skip-visual (exclude from Playwright visual runs)
  include                   Remove skip-visual

Flags:
  --force                   Overwrite existing scaffold files (init)
  --story-id <id>           Storybook story id
  --component <name>        Grep / title substring (update / skip / include)
  --step-label <label>      Play step label (interaction-update)
  --step-id <id>            Override slugified step id
  --create-only             Missing PNGs only (no overwrite)
  --approved                Required unless VISUAL_UPDATE_APPROVED=1
  --allow-dirty             Reserved (host git gates may use this)
  --skip-build              Do not run build-storybook when index missing
  --snapshot-dir <path>     Override snapshot directory
  --baseline-path-mode      story-id | nested-import
  --port <n>                Playwright static server port (default: STORYBOOK_PORT+1)
`);
}

async function main(argv: string[]): Promise<void> {
  const command = argv[0];
  if (!command || command === "-h" || command === "--help") {
    printHelp();
    process.exit(command ? 0 : 1);
  }

  const rest = argv.slice(1);

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
      'Next: addons: ["storybook-addon-visual-delta"] in .storybook/main.ts, then Create visual in the panel.',
    );
    return;
  }

  const options = parseShared(rest);

  if (command === "update" || command === "visual-update") {
    await runBaselineUpdate(options);
    return;
  }
  if (
    command === "interaction-update" ||
    command === "visual-interaction-update"
  ) {
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
