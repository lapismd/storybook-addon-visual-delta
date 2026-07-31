import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySpecFirstChanges,
  parseUnifiedDiff,
} from "./check-spec-first.mjs";

const SPEC = "spec/src/verification.md";

test("fails portable production code without a canonical spec update", () => {
  const result = classifySpecFirstChanges(["src/panel/Panel.tsx"]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.protectedFiles, ["src/panel/Panel.tsx"]);
});

test("passes protected code with a canonical content page", () => {
  const result = classifySpecFirstChanges(["src/node/middleware.ts", SPEC]);
  assert.equal(result.ok, true);
  assert.equal(result.requiresSpec, true);
  assert.deepEqual(result.specFiles, [SPEC]);
});

test("protects package configuration and workflows", () => {
  const result = classifySpecFirstChanges([
    "package.json",
    ".storybook/main.ts",
    ".github/workflows/visual-delta-spec-first.yml",
    ".github/workflows/npm-publish.yml",
    "playwright.panel.config.ts",
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.protectedFiles.length, 5);
});

test("ignores tests fixtures ordinary stories baselines and generated output", () => {
  const result = classifySpecFirstChanges([
    "src/panel/Panel.spec.tsx",
    "src/stories/PanelShell.tsx",
    "tests/manager.spec.ts",
    "dist/node/index.js",
    "spec/book/index.html",
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.requiresSpec, false);
});

test("does not accept SUMMARY or package documentation as specification", () => {
  const result = classifySpecFirstChanges([
    "src/manager.tsx",
    "spec/src/SUMMARY.md",
    "DEVELOPMENT.md",
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.specFiles, []);
});

test("protects spec tooling without letting tooling satisfy itself", () => {
  const result = classifySpecFirstChanges([
    "scripts/check-spec-first.mjs",
    "spec/book.toml",
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.protectedFiles.length, 2);
});

test("ignores unrelated package.json changes", () => {
  const result = classifySpecFirstChanges([
    {
      path: "package.json",
      changedLines: ['"chrono-node": "^3.0.0"'],
    },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.requiresSpec, false);
});

test("protects Visual Delta package.json script changes", () => {
  const result = classifySpecFirstChanges([
    {
      path: "package.json",
      changedLines: ['"spec:check": "pnpm spec:lint"'],
    },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.protectedFiles, ["package.json"]);
});

test("protects public package and release configuration", () => {
  const result = classifySpecFirstChanges([
    {
      path: "package.json",
      changedLines: ['"publishConfig": {', '"version": "1.0.0"'],
    },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.protectedFiles, ["package.json"]);
});

test("parses changed lines from a unified diff", () => {
  const changes = parseUnifiedDiff(`diff --git a/package.json b/package.json
index 1111111..2222222 100644
--- a/package.json
+++ b/package.json
@@ -1 +1 @@
-  "check": "old"
+  "spec:check": "new"
`);
  assert.deepEqual(changes, [
    {
      path: "package.json",
      changedLines: ['  "check": "old"', '  "spec:check": "new"'],
    },
  ]);
});

test("protects both sides of a cross-boundary rename", () => {
  const changes = parseUnifiedDiff(`diff --git a/src/panel/Panel.tsx b/tests/Panel.tsx
similarity index 100%
rename from src/panel/Panel.tsx
rename to tests/Panel.tsx
`);
  const result = classifySpecFirstChanges(changes);
  assert.equal(result.ok, false);
  assert.deepEqual(result.protectedFiles, ["src/panel/Panel.tsx"]);
});

test("fails closed for non-empty unparseable change-set output", () => {
  assert.throws(
    () => parseUnifiedDiff("Modified regular file package.json\n"),
    /no unified diff headers/,
  );
  assert.throws(
    () => parseUnifiedDiff("diff --git unsupported\n"),
    /Unsupported unified diff header/,
  );
});

test("parses quoted Git paths without treating unrelated files as protected", () => {
  const changes = parseUnifiedDiff(
    'diff --git "a/docs/path with space.md" "b/docs/path with space.md"\n',
  );
  assert.deepEqual(changes, [
    { path: "docs/path with space.md", changedLines: [] },
  ]);
  assert.equal(classifySpecFirstChanges(changes).ok, true);
});
