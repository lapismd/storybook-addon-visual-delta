import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateReleaseApproval } from "./check-release-source.mjs";

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
