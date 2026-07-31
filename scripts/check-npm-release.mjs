#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PACKAGE_JSON = path.resolve(SCRIPT_DIR, "..", "package.json");
export const PACKAGE_NAME = "@lapismd/storybook-addon-visual-delta";
export const REPOSITORY_URL =
  "https://github.com/stevejuma/storybook-addon-visual-delta.git";
export const NPM_REGISTRY = "https://registry.npmjs.org";

const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function validateNpmRelease(manifest, { tag } = {}) {
  const errors = [];
  const version = manifest?.version;

  if (manifest?.name !== PACKAGE_NAME) {
    errors.push(`name must be ${PACKAGE_NAME}`);
  }
  if (typeof version !== "string" || !STABLE_VERSION.test(version)) {
    errors.push("version must be a stable X.Y.Z SemVer value");
  }
  if (manifest?.private === true) {
    errors.push("package must not be private");
  }
  if (manifest?.publishConfig?.access !== "public") {
    errors.push('publishConfig.access must be "public"');
  }
  if (manifest?.publishConfig?.registry !== NPM_REGISTRY) {
    errors.push(`publishConfig.registry must be ${NPM_REGISTRY}`);
  }
  if (manifest?.repository?.type !== "git") {
    errors.push('repository.type must be "git"');
  }
  if (manifest?.repository?.url !== REPOSITORY_URL) {
    errors.push(`repository.url must be ${REPOSITORY_URL}`);
  }
  if (!tag) {
    errors.push("--tag is required");
  } else if (typeof version === "string" && tag !== `v${version}`) {
    errors.push(`tag must exactly equal v${version}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    version,
  };
}

function parseArgs(argv) {
  const options = { packageJson: DEFAULT_PACKAGE_JSON };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--tag") {
      options.tag = argv[++index];
    } else if (argument === "--package-json") {
      options.packageJson = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!options.help && (!options.tag || !options.packageJson)) {
    throw new Error("--tag and --package-json values must not be empty");
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/check-npm-release.mjs --tag vX.Y.Z [--package-json path]

Checks the public npm manifest and requires the exact stable release tag.`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }
    const manifest = JSON.parse(readFileSync(options.packageJson, "utf8"));
    const result = validateNpmRelease(manifest, options);
    if (!result.ok) {
      console.error("Visual Delta npm release validation failed:");
      for (const error of result.errors) console.error(`  - ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `Visual Delta npm release validation passed for ${manifest.name}@${result.version} (${options.tag}).`,
    );
  } catch (error) {
    console.error(
      `Visual Delta npm release validation could not complete: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
