#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isVersionPackagesReleaseCommit } from "./ensure-release-tag.mjs";
import {
  validateReleaseApproval,
  validateReleaseCandidate,
} from "./release-source-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

function git(...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function main() {
  const args = process.argv.slice(2);
  const candidateOnly = args.length === 1 && args[0] === "--candidate";
  if (args.length && !candidateOnly)
    throw new Error("Unknown release-source arguments");
  const validate = candidateOnly
    ? validateReleaseCandidate
    : validateReleaseApproval;
  const head = git("rev-parse", "HEAD");
  const parents = git("rev-list", "--parents", "-n", "1", head).split(/\s+/);
  validate({
    event: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    repository: process.env.GITHUB_REPOSITORY,
    approved: process.env.RELEASE_APPROVED,
    source: process.env.RELEASE_SOURCE,
    head,
    version: JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
      .version,
    auditApprovedSource: process.env.RELEASE_AUDIT_APPROVED_SOURCE,
    pendingChangesets: readdirSync(path.join(root, ".changeset")).filter(
      (name) => name.endsWith(".md") && name !== "README.md",
    ),
    versionPackagesCommit: isVersionPackagesReleaseCommit({
      subject: git("log", "-1", "--pretty=%s", head),
      mergedParentSubjects: parents
        .slice(2)
        .map((parent) => git("log", "-1", "--pretty=%s", parent)),
    }),
  });
  git("merge-base", "--is-ancestor", head, "origin/main");
  console.log(
    `Exact main-history release source verified: ${head}; candidateOnly=${candidateOnly}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
