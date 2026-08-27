import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("package Storybook build emits the dependency graph used for fingerprints", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const command = packageJson.scripts?.["build-storybook"];

  assert.equal(typeof command, "string");
  assert.match(command, /mkdirSync\('\.visual-delta\/cache'/);
  assert.match(
    command,
    /storybook build --stats-json \.visual-delta\/cache(?:\s|$)/,
  );
});

test("the compiled Node adapter exposes host result invalidation", async () => {
  const nodeApi = await import("../dist/node/index.js");
  assert.equal(typeof nodeApi.baselinePngExistsForStoryId, "function");
  assert.equal(typeof nodeApi.invalidateVisualResultArtifacts, "function");
  assert.equal(typeof nodeApi.markStorybookStaticFresh, "function");
  assert.equal(typeof nodeApi.previewModulesNewerThanIndex, "function");
  assert.equal(typeof nodeApi.isVisualReviewStatus, "function");
  assert.equal(Array.isArray(nodeApi.VISUAL_REVIEW_TAGS), true);
});

test("package Storybook writers invoke the freshly built checkout CLI", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const mainSource = readFileSync(
    new URL("../.storybook/main.ts", import.meta.url),
    "utf8",
  );

  assert.equal(
    packageJson.scripts?.["visual-delta:self"],
    "tsc -p tsconfig.node-build.json && node ./scripts/prepare-cli-bin.mjs && node ./dist/node/cli.js",
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
