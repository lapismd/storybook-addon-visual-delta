import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySpecFirstChanges,
  parseUnifiedDiff,
} from "./check-spec-first.mjs";

const PACKAGE = "packages/storybook-addon-visual-delta";
const SPEC = `${PACKAGE}/spec/src/verification.md`;

test("fails portable production code without a canonical spec update", () => {
  const result = classifySpecFirstChanges([`${PACKAGE}/src/panel/Panel.tsx`]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.protectedFiles, [`${PACKAGE}/src/panel/Panel.tsx`]);
});

test("passes protected code with a canonical content page", () => {
  const result = classifySpecFirstChanges([
    `${PACKAGE}/src/node/middleware.ts`,
    SPEC,
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.requiresSpec, true);
  assert.deepEqual(result.specFiles, [SPEC]);
});

test("protects package configuration and host integration", () => {
  const result = classifySpecFirstChanges([
    `${PACKAGE}/package.json`,
    ".storybook/main.ts",
    ".visual-delta/config.json",
    ".env.storybook.local.example",
    "playwright.config.ts",
    "scripts/storybook-process.mjs",
    "scripts/storybook-stop.sh",
    ".github/workflows/visual-delta-spec-first.yml",
    "scripts/ui-generator/visual/snapshot-paths.ts",
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.protectedFiles.length, 9);
});

test("ignores tests fixtures ordinary stories baselines and generated output", () => {
  const result = classifySpecFirstChanges([
    `${PACKAGE}/src/panel/Panel.spec.tsx`,
    `${PACKAGE}/src/stories/PanelShell.tsx`,
    `${PACKAGE}/tests/manager.spec.ts`,
    "src/storybook/visual-delta/PanelShell.stories.svelte",
    "tests/visual/storybook.spec.ts-snapshots/shadcn/button/preview-chromium-darwin.png",
    `${PACKAGE}/dist/node/index.js`,
    `${PACKAGE}/spec/book/index.html`,
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.requiresSpec, false);
});

test("does not accept SUMMARY or package documentation as specification", () => {
  const result = classifySpecFirstChanges([
    `${PACKAGE}/src/manager.tsx`,
    `${PACKAGE}/spec/src/SUMMARY.md`,
    `${PACKAGE}/DEVELOPMENT.md`,
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.specFiles, []);
});

test("protects spec tooling without letting tooling satisfy itself", () => {
  const result = classifySpecFirstChanges([
    `${PACKAGE}/scripts/check-spec-first.mjs`,
    `${PACKAGE}/spec/book.toml`,
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.protectedFiles.length, 2);
});

test("ignores unrelated root package changes", () => {
  const result = classifySpecFirstChanges([
    {
      path: "package.json",
      changedLines: ['"chrono-node": "^3.0.0"'],
    },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.requiresSpec, false);
});

test("protects Visual Delta root package changes", () => {
  const result = classifySpecFirstChanges([
    {
      path: "package.json",
      changedLines: [
        '"visual-delta:spec:check": "pnpm visual-delta:spec:lint"',
      ],
    },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.protectedFiles, ["package.json"]);
});

test("classifies shared generator CLI changes from their changed lines", () => {
  const unrelated = classifySpecFirstChanges([
    {
      path: "scripts/ui-generator/cli.ts",
      changedLines: ["registerGuideCommand(program);"],
    },
  ]);
  const visual = classifySpecFirstChanges([
    {
      path: "scripts/ui-generator/cli.ts",
      changedLines: ["registerVisualUpdateCommand(program);"],
    },
  ]);
  assert.equal(unrelated.ok, true);
  assert.equal(visual.ok, false);
});

test("parses changed lines from a unified diff", () => {
  const changes = parseUnifiedDiff(`diff --git a/package.json b/package.json
index 1111111..2222222 100644
--- a/package.json
+++ b/package.json
@@ -1 +1 @@
-  "check": "old"
+  "visual-delta:spec:check": "new"
`);
  assert.deepEqual(changes, [
    {
      path: "package.json",
      changedLines: ['  "check": "old"', '  "visual-delta:spec:check": "new"'],
    },
  ]);
});

test("protects both sides of a cross-boundary rename", () => {
  const changes =
    parseUnifiedDiff(`diff --git a/${PACKAGE}/src/panel/Panel.tsx b/${PACKAGE}/tests/Panel.tsx
similarity index 100%
rename from ${PACKAGE}/src/panel/Panel.tsx
rename to ${PACKAGE}/tests/Panel.tsx
`);
  const result = classifySpecFirstChanges(changes);
  assert.equal(result.ok, false);
  assert.deepEqual(result.protectedFiles, [`${PACKAGE}/src/panel/Panel.tsx`]);
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
