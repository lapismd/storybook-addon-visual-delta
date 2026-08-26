import assert from "node:assert/strict";
import test from "node:test";

import { resolveReleaseTagPlan } from "./ensure-release-tag.mjs";

const HEAD = "abcdef0123456789abcdef0123456789abcdef01";
const OTHER = "1234567890abcdef1234567890abcdef12345678";

test("no-ops when HEAD is not a Version Packages commit", () => {
  const plan = resolveReleaseTagPlan({
    version: "0.1.0",
    headSha: HEAD,
    existingTagSha: null,
    versionPackagesCommit: false,
    versionChanged: true,
  });
  assert.equal(plan.action, "noop");
});

test("plans a new stable release tag for Version Packages", () => {
  const plan = resolveReleaseTagPlan({
    version: "0.1.0",
    headSha: HEAD,
    existingTagSha: null,
    versionPackagesCommit: true,
    versionChanged: true,
  });
  assert.deepEqual(plan, {
    action: "create",
    tag: "v0.1.0",
    reason: null,
  });
});

test("no-ops when the tag already points at HEAD", () => {
  const plan = resolveReleaseTagPlan({
    version: "0.1.0",
    headSha: HEAD,
    existingTagSha: HEAD.toUpperCase(),
    versionPackagesCommit: true,
    versionChanged: true,
  });
  assert.equal(plan.action, "noop");
  assert.equal(plan.tag, "v0.1.0");
});

test("no-ops when an empty Changeset leaves an existing tag elsewhere", () => {
  const plan = resolveReleaseTagPlan({
    version: "0.0.1",
    headSha: HEAD,
    existingTagSha: OTHER,
    versionPackagesCommit: true,
    versionChanged: false,
  });
  assert.equal(plan.action, "noop");
});

test("fails closed when a bumped version tag points at another commit", () => {
  const plan = resolveReleaseTagPlan({
    version: "0.1.0",
    headSha: HEAD,
    existingTagSha: OTHER,
    versionPackagesCommit: true,
    versionChanged: true,
  });
  assert.equal(plan.action, "fail");
  assert.match(plan.reason, /already points at/);
});

test("rejects prerelease versions on Version Packages commits", () => {
  const plan = resolveReleaseTagPlan({
    version: "0.1.0-beta.1",
    headSha: HEAD,
    versionPackagesCommit: true,
    versionChanged: true,
  });
  assert.equal(plan.action, "fail");
  assert.match(plan.reason, /stable SemVer/);
});
