import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  validateReleaseApproval,
  validateReleaseCandidate,
} from "./release-source-policy.mjs";

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

test("0.1.5 tagging requires its separately reviewed exception source", () => {
  assert.doesNotThrow(() =>
    validateReleaseApproval({
      ...approved,
      version: "0.1.5",
      auditApprovedSource: source,
    }),
  );
  for (const auditApprovedSource of [undefined, "b".repeat(40)]) {
    assert.throws(() =>
      validateReleaseApproval({
        ...approved,
        version: "0.1.5",
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

test("unknown command arguments cannot opt out of source approval", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-release-source.mjs", "--candidate", "--publish"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown release-source arguments/);
});
