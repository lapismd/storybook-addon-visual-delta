import assert from "node:assert/strict";
import test from "node:test";

import specValidatorConfig from "../spec-validator.config.mjs";
import { validateReleaseIntent } from "./check-release-intent.mjs";

test("requires release intent for public runtime changes", () => {
  const result = validateReleaseIntent(["src/index.ts"]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.publicChanges, ["src/index.ts"]);
});

test("requires release intent for package manifest changes", () => {
  const result = validateReleaseIntent(["package.json"]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.publicChanges, ["package.json"]);
});

test("accepts a version-bearing or explicit empty Changeset file", () => {
  const result = validateReleaseIntent([
    "src/preset.ts",
    ".changeset/quiet-visual-delta.md",
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.changesets, [".changeset/quiet-visual-delta.md"]);
});

test("ignores changelog, test-only, stories, and non-public paths", () => {
  const result = validateReleaseIntent([
    "CHANGELOG.md",
    "src/panel/Panel.spec.ts",
    "src/stories/PanelShell.stories.tsx",
    "scripts/check-release-intent.mjs",
    "DEVELOPMENT.md",
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.publicChanges.length, 0);
});

test("keeps generated Version Packages metadata outside spec-first protection", () => {
  const packageMatcher = new RegExp(
    specValidatorConfig.validators.specFirst.conditional["package.json"],
  );

  assert.equal(packageMatcher.test('"version": "0.0.7",'), false);
  assert.equal(packageMatcher.test('"spec:check": "spec-validator check",'), true);
  assert.equal(packageMatcher.test('"repository": {'), true);
  assert.equal(packageMatcher.test('"publishConfig": {'), true);
  assert.equal(packageMatcher.test('"private": true,'), true);
  assert.equal(packageMatcher.test('"release:tag": "node script.mjs"'), true);
});
