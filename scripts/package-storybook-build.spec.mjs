import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("package Storybook build emits the dependency graph used for fingerprints", () => {
  const denoConfig = JSON.parse(
    readFileSync(new URL("../deno.json", import.meta.url), "utf8"),
  );
  const command = denoConfig.tasks?.["build-storybook"];

  assert.equal(typeof command, "string");
  assert.match(command, /Deno\.mkdirSync\("\.visual-delta\/cache"/);
  assert.match(
    command,
    /node \.\/node_modules\/storybook\/dist\/bin\/dispatcher\.js build --stats-json \.visual-delta\/cache(?:\s|$)/,
  );
});

test("package Storybook writers invoke the freshly built checkout CLI", () => {
  const denoConfig = JSON.parse(
    readFileSync(new URL("../deno.json", import.meta.url), "utf8"),
  );
  const mainSource = readFileSync(
    new URL("../.storybook/main.ts", import.meta.url),
    "utf8",
  );

  assert.equal(
    denoConfig.tasks?.["visual-delta:self"],
    "deno task build:node && deno run -A ./dist/node/cli.js",
  );
  assert.match(
    mainSource,
    /const packageVisualUpdateArgs = \[\s*"visual-delta:self",\s*"update",/,
  );
  assert.match(
    mainSource,
    /const packageVisualInteractionUpdateArgs = \[\s*"visual-delta:self",\s*"interaction-update",/,
  );
  assert.match(
    mainSource,
    /const packageVisualUpdateArgs = \[[\s\S]*?"--snapshot-dir",\s*hostSnapshots,\s*"--baseline-path-mode",\s*"nested-import",\s*\];/,
  );
  assert.match(
    mainSource,
    /const packageVisualInteractionUpdateArgs = \[[\s\S]*?"--snapshot-dir",\s*hostSnapshots,\s*"--baseline-path-mode",\s*"nested-import",\s*\];/,
  );
  assert.match(mainSource, /visualUpdateArgs: packageVisualUpdateArgs/);
  assert.match(
    mainSource,
    /visualInteractionUpdateArgs: packageVisualInteractionUpdateArgs/,
  );
});
