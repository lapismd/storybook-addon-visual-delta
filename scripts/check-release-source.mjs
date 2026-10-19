#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isVersionPackagesReleaseCommit } from "./ensure-release-tag.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

export function validateReleaseApproval(context) {
  if (
    context.event !== "workflow_dispatch" ||
    context.ref !== "refs/heads/main" ||
    context.repository !== "lapismd/storybook-addon-visual-delta" ||
    context.approved !== "true"
  ) {
    throw new Error("Release tags require explicit approval on canonical main");
  }
  if (!/^[a-f0-9]{40}$/.test(context.source || "")) {
    throw new Error(
      "Release approval requires an exact 40-character source SHA"
    );
  }
  if (context.head !== context.source) {
    throw new Error("Checked-out source differs from the approved source");
  }
  if (
    context.version === "0.0.8" &&
    context.auditApprovedSource !== context.source
  ) {
    throw new Error("0.0.8 requires its exact reviewed audit-exception source");
  }
  if (!context.versionPackagesCommit || context.pendingChangesets.length) {
    throw new Error(
      "Approved source must be a completed Version Packages commit"
    );
  }
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function main() {
  const head = git("rev-parse", "HEAD");
  const parents = git("rev-list", "--parents", "-n", "1", head).split(/\s+/);
  validateReleaseApproval({
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
      (name) => name.endsWith(".md") && name !== "README.md"
    ),
    versionPackagesCommit: isVersionPackagesReleaseCommit({
      subject: git("log", "-1", "--pretty=%s", head),
      mergedParentSubjects: parents
        .slice(2)
        .map((parent) => git("log", "-1", "--pretty=%s", parent)),
    }),
  });
  git("merge-base", "--is-ancestor", head, "origin/main");
  console.log(`Approved main-history release source verified: ${head}`);
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
