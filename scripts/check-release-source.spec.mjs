import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  validateReleaseApproval,
  validateReleaseCandidate,
} from "./check-release-source.mjs";

const source = "a".repeat(40);
const approved = {
  event: "workflow_dispatch",
  ref: "refs/heads/main",
  repository: "lapismd/storybook-addon-visual-delta",
  approved: "true",
  source,
  head: source,
  pendingChangesets: [],
  versionPackagesCommit: true,
};

test("accepts the explicitly approved exact versioning source", () => {
  assert.doesNotThrow(() => validateReleaseApproval(approved));
});

test("0.0.8 tagging requires its separately reviewed exception source", () => {
  assert.doesNotThrow(() =>
    validateReleaseApproval({
      ...approved,
      version: "0.0.8",
      auditApprovedSource: source,
    }),
  );
  for (const auditApprovedSource of [undefined, "b".repeat(40)]) {
    assert.throws(() =>
      validateReleaseApproval({
        ...approved,
        version: "0.0.8",
        auditApprovedSource,
      }),
    );
  }
});

test("pushes, forks, other branches and unchecked dispatches cannot approve tags", () => {
  for (const change of [
    { event: "push" },
    { event: "pull_request" },
    { repository: "example/fork" },
    { ref: "refs/heads/release" },
    { approved: "false" },
    { approved: undefined },
  ]) {
    assert.throws(() => validateReleaseApproval({ ...approved, ...change }));
  }
});

test("a branch, abbreviated SHA or changed checkout cannot replace approval", () => {
  for (const change of [
    { source: "main" },
    { source: source.slice(0, 12) },
    { source: undefined },
    { head: "b".repeat(40) },
  ]) {
    assert.throws(() => validateReleaseApproval({ ...approved, ...change }));
  }
});

test("unconsumed changesets and ordinary commits are not release candidates", () => {
  for (const change of [
    { pendingChangesets: ["unfinished.md"] },
    { versionPackagesCommit: false },
  ]) {
    assert.throws(() => validateReleaseApproval({ ...approved, ...change }));
  }
});

test("workflow keeps automatic version PRs separate from approved tag creation", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  const tagJob = workflow.split("\n  tag:\n")[1];
  assert.match(workflow, /create_tag:[\s\S]*?default: false/);
  assert.match(
    workflow,
    /name: Update Version Packages pull request\n    if: github.event_name == 'push'/,
  );
  assert.match(
    tagJob,
    /if: github.event_name == 'workflow_dispatch'.*inputs.create_tag/,
  );
  assert.match(tagJob, /ref: \$\{\{ inputs.source \}\}/);
  assert.match(tagJob, /run: node scripts\/check-release-source.mjs/);
  assert.ok(
    tagJob.indexOf("check-release-source.mjs") <
      tagJob.indexOf("pnpm release:tag --push"),
  );
});

test("candidate qualification accepts exact source without publication approval", () => {
  assert.doesNotThrow(() =>
    validateReleaseCandidate({ ...approved, approved: "false" }),
  );
  assert.throws(() =>
    validateReleaseApproval({ ...approved, approved: "false" }),
  );
});

test("candidate qualification retains source, context and versioning checks", () => {
  for (const change of [
    { event: "push" },
    { ref: "refs/heads/topic" },
    { repository: "example/fork" },
    { source: "main" },
    { head: "b".repeat(40) },
    { pendingChangesets: ["pending.md"] },
    { versionPackagesCommit: false },
  ])
    assert.throws(() => validateReleaseCandidate({ ...approved, ...change }));
});

test("qualification workflow cannot tag or publish and retains candidate evidence", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/qualify-release.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /contents: read\n  packages: read/);
  assert.doesNotMatch(
    workflow,
    /(?:contents|packages|id-token): write|environment:|RELEASE_TAG_TOKEN|npm publish|release:tag|git tag|git push|workflow_run:/,
  );
  assert.match(workflow, /check-release-source\.mjs --candidate/);
  assert.match(workflow, /GITHUB_SHA: \$\{\{ inputs.source \}\}/);
  assert.match(workflow, /check-release-audit\.mjs/);
  assert.match(
    workflow,
    /image: ghcr\.io\/lapismd\/storybook-addon-visual-delta-ci@sha256:[a-f0-9]{64}/,
  );
  assert.match(workflow, /env:\n        HOME: \/root/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /actions\/upload-artifact@v6/);
  assert.match(workflow, /npm install --ignore-scripts/);
  assert.match(workflow, /npm audit/);
  assert.match(workflow, /include-hidden-files: true/);
  assert.ok(
    workflow.indexOf("check-release-source.mjs --candidate") <
      workflow.indexOf("pnpm install --frozen-lockfile"),
  );
});

test("unknown command arguments cannot opt out of source approval", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-release-source.mjs", "--candidate", "--publish"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown release-source arguments/);
});
