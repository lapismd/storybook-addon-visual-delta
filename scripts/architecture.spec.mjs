import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { countedLines } from "./architecture-lines.mjs";
import { fileKind } from "./architecture-policy.mjs";
import { parseArgs } from "./check-architecture.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const checker = path.join(repoRoot, "scripts/check-architecture.mjs");
const fixtures = path.join(repoRoot, "scripts/architecture-fixtures");

function run(name, extra = [], env = {}) {
  return spawnSync(
    process.execPath,
    [checker, "--root", path.join(fixtures, name), ...extra],
    {
      encoding: "utf8",
      cwd: repoRoot,
      env: { ...process.env, ...env },
    },
  );
}

function output(result) {
  return `${result.stdout}\n${result.stderr}`;
}

test("counted-line metric ignores blank and comment-only lines", () => {
  assert.equal(
    countedLines(
      [
        "export const n = 1;",
        "",
        "// comment",
        "/* block */",
        "/**",
        " * docs",
        " */",
        "export const m = 2;",
        "<!-- html -->",
      ].join("\n"),
    ),
    2,
  );
});

test("counts code on the same line as a comment", () => {
  assert.equal(countedLines("export const n = 1; // trailing\n"), 1);
});

test("classifies each file kind", () => {
  assert.equal(fileKind("src/panel/Panel.tsx"), "production");
  assert.equal(fileKind("src/panel/Panel.spec.tsx"), "test");
  assert.equal(fileKind("scripts/check-ci-image.mjs"), "script");
  assert.equal(fileKind(".storybook/main.ts"), "script");
  assert.equal(fileKind("src/stories/PanelShell.stories.tsx"), "story");
});

test("budgets published src/stories fixtures as production", () => {
  assert.equal(fileKind("src/stories/PanelShell.tsx"), "production");
  assert.equal(fileKind("src/stories/panel-fixtures.tsx"), "production");
  assert.equal(fileKind("src/stories/mock-visual-backend.ts"), "production");
});

test("budgets the acceptance and harness trees as test kind", () => {
  assert.equal(fileKind("tests/manager.spec.ts"), "test");
  assert.equal(fileKind("tests/manager-test-support.ts"), "test");
  assert.equal(fileKind("tests/visual-matrix/fixture.ts"), "test");
  assert.equal(fileKind("src/test/setup.ts"), "test");
  assert.equal(fileKind("src/test/render.tsx"), "test");
});

test("parses --root, --baseline, and --write-baseline", () => {
  const options = parseArgs([
    "--root",
    ".",
    "--baseline",
    "scripts/architecture-baseline.json",
    "--write-baseline",
  ]);
  assert.equal(options.writeBaseline, true);
  assert.equal(options.baseline, path.resolve("scripts/architecture-baseline.json"));
  assert.equal(options.root, path.resolve("."));
});

test("fails a new production file over 300 counted lines", () => {
  const result = run("new-oversize");
  assert.equal(result.status, 1);
  assert.match(output(result), /new-file-budget/);
});

test("fails a published src/stories fixture over the production budget", () => {
  const result = run("published-fixture-oversize");
  assert.equal(result.status, 1);
  assert.match(output(result), /new-file-budget/);
  assert.match(output(result), /new production file 305\/300/);
});

test("budgets stories and harness trees against their own limits", () => {
  const result = run("story-and-test-kinds");
  assert.equal(result.status, 0, output(result));
  assert.doesNotMatch(output(result), /new-file-budget/);
});

test("fails counted-line growth of an existing file", () => {
  const result = run("growth");
  assert.equal(result.status, 1);
  assert.match(output(result), /counted-line-growth/);
});

test("passes a valid extraction with updated budgets", () => {
  const result = run("extraction");
  assert.equal(result.status, 0, output(result));
  assert.doesNotMatch(
    output(result),
    /\[(?:new-file-budget|counted-line-growth)\]/,
  );
});

test("fails production imports of tests", () => {
  const result = run("production-test-import");
  assert.equal(result.status, 1);
  assert.match(output(result), /production-test-import/);
});

test("fails a generic dump filename", () => {
  const result = run("dump-filename");
  assert.equal(result.status, 1);
  assert.match(output(result), /dump-filename/);
});

test("fails when a baseline path is missing on disk", () => {
  const result = run("rename-missing");
  assert.equal(result.status, 1);
  assert.match(output(result), /missing-baseline-path/);
});

test("fails when the baseline JSON is missing", () => {
  const result = run("missing-baseline");
  assert.equal(result.status, 1);
  assert.match(output(result), /architecture-baseline-missing/);
});

test("fails when the root has no source files", () => {
  const result = run("empty-root");
  assert.equal(result.status, 1);
  assert.match(output(result), /no-inputs/);
});

test("passes a comment-only edit that does not change counted lines", () => {
  const result = run("comment-only");
  assert.equal(result.status, 0, output(result));
  assert.doesNotMatch(output(result), /counted-line-growth/);
});

test("fails stale budgets when metric plus slack is under the budget", () => {
  const result = run("stale-budget");
  assert.equal(result.status, 1);
  assert.match(output(result), /stale-budget/);
});

test("refuses --write-baseline when CI=true", () => {
  const result = run("empty-root", ["--write-baseline"], { CI: "true" });
  assert.equal(result.status, 1);
  assert.match(output(result), /write-baseline-forbidden/);
});

test("passes the current repository tree against its baseline", () => {
  const result = spawnSync(process.execPath, [checker], {
    encoding: "utf8",
    cwd: repoRoot,
    env: process.env,
    timeout: 120_000,
  });
  assert.equal(
    result.status,
    0,
    `expected pnpm check:architecture to pass:\n${output(result)}`,
  );
});
