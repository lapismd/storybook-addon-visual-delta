#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const VERSION_PACKAGES_SUBJECT = "Version Packages";

export function resolveReleaseTagPlan({
  version,
  headSha,
  existingTagSha = null,
  versionChanged = false,
  versionPackagesCommit = false,
}) {
  if (!versionPackagesCommit) {
    return {
      action: "noop",
      tag: STABLE_VERSION.test(version) ? `v${version}` : null,
      reason: null,
    };
  }
  if (!STABLE_VERSION.test(version)) {
    return {
      action: "fail",
      tag: null,
      reason: `version must be stable SemVer X.Y.Z, got ${version}`,
    };
  }
  if (!/^[0-9a-f]{7,40}$/i.test(headSha)) {
    return {
      action: "fail",
      tag: `v${version}`,
      reason: "headSha must be a git commit SHA",
    };
  }

  const tag = `v${version}`;
  if (!existingTagSha) {
    return { action: "create", tag, reason: null };
  }
  if (existingTagSha.toLowerCase() === headSha.toLowerCase()) {
    return { action: "noop", tag, reason: null };
  }
  if (!versionChanged) {
    return { action: "noop", tag, reason: null };
  }
  return {
    action: "fail",
    tag,
    reason: `tag ${tag} already points at ${existingTagSha}, not ${headSha}`,
  };
}

function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (allowFailure) return null;
    throw new Error(
      `${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function parseArgs(argv) {
  const options = { dryRun: false, push: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--push") options.push = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function packageVersion(at = "HEAD") {
  if (at === "HEAD" || at === ":") {
    const manifest = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
    );
    return String(manifest.version);
  }
  const source = run("git", ["show", `${at}:package.json`], {
    allowFailure: true,
  });
  if (!source) return null;
  return String(JSON.parse(source).version);
}

function existingTagSha(tag) {
  return run("git", ["rev-list", "-n", "1", tag], { allowFailure: true });
}

function headSubject() {
  return run("git", ["log", "-1", "--pretty=%s"]);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: node scripts/ensure-release-tag.mjs [--dry-run] [--push]",
    );
    return;
  }

  const version = packageVersion();
  const headSha = run("git", ["rev-parse", "HEAD"]);
  const parentVersion = packageVersion("HEAD^");
  const versionPackagesCommit = headSubject() === VERSION_PACKAGES_SUBJECT;
  const plan = resolveReleaseTagPlan({
    version,
    headSha,
    existingTagSha: existingTagSha(`v${version}`),
    versionChanged: parentVersion !== null && parentVersion !== version,
    versionPackagesCommit,
  });

  if (plan.action === "fail") {
    throw new Error(plan.reason);
  }

  if (plan.action === "noop") {
    if (!versionPackagesCommit) {
      console.log(
        "Skipping release tag: HEAD is not a Version Packages commit.",
      );
      return;
    }
    console.log(
      plan.tag
        ? `Release tag ${plan.tag} already satisfied for this Version Packages commit.`
        : "No release tag action required.",
    );
    return;
  }

  if (options.dryRun) {
    console.log(`Would create release tag ${plan.tag} at ${headSha}.`);
    return;
  }

  run("git", ["tag", plan.tag, headSha]);
  console.log(`Created release tag ${plan.tag} at ${headSha}.`);

  if (options.push) {
    run("git", ["push", "origin", plan.tag]);
    console.log(`Pushed release tag ${plan.tag}.`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    console.error(
      `Release tag ensure failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
