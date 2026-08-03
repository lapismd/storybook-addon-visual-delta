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
