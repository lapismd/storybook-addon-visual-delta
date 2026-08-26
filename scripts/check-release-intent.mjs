#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function validateReleaseIntent(files) {
  const normalized = files.map((file) => file.replaceAll("\\", "/"));
  const publicChanges = normalized.filter((file) => {
    if (file === "package.json") return true;
    if (!file.startsWith("src/")) return false;
    if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file)) return false;
    if (/\.stories\.[cm]?[jt]sx?$/.test(file)) return false;
    return true;
  });
  const changesets = normalized.filter(
    (file) =>
      /^\.changeset\/[^/]+\.md$/.test(file) && file !== ".changeset/README.md",
  );
  return {
    ok: publicChanges.length === 0 || changesets.length > 0,
    publicChanges,
    changesets,
  };
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function parseArgs(argv) {
  const options = { files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--base") options.base = argv[++index];
    else if (argument === "--head") options.head = argv[++index];
    else if (argument === "--file") options.files.push(argv[++index]);
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.head && !options.base) throw new Error("--head requires --base");
  return options;
}

function changedFiles(options) {
  if (options.files.length > 0) return options.files;
  if (options.base) {
    return run("git", [
      "diff",
      "--name-only",
      options.base,
      options.head ?? "HEAD",
      "--",
    ]);
  }
  const jj = spawnSync("jj", ["--no-pager", "diff", "--name-only", "-r", "@"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (jj.status === 0) {
    return jj.stdout.split(/\r?\n/).filter(Boolean);
  }
  return run("git", ["diff", "--name-only", "HEAD", "--"]);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: node scripts/check-release-intent.mjs [--base rev --head rev] [--file path...]",
    );
    return;
  }
  const result = validateReleaseIntent(changedFiles(options));
  if (!result.ok) {
    console.error(
      "Public package changes require a Changeset or explicit empty Changeset:",
    );
    for (const file of result.publicChanges) console.error(`  - ${file}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Release intent validated: ${result.publicChanges.length} public change(s), ${result.changesets.length} Changeset(s).`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    console.error(
      `Release intent check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
