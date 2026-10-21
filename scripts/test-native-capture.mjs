import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareNativeCaptureFixture } from "./native-capture-fixture.mjs";

const toolingRoot = fileURLToPath(new URL("..", import.meta.url));
const packageRoot = process.env.VISUAL_DELTA_NATIVE_PACKAGE_ROOT || toolingRoot;
const root = path.join(toolingRoot, ".visual-delta/cache/native-example");
rmSync(root, { recursive: true, force: true });
const browsers = (
  process.env.VISUAL_DELTA_NATIVE_EXAMPLE_BROWSERS ?? "chromium"
).split(",");
prepareNativeCaptureFixture(root, packageRoot, browsers, toolingRoot);
chmodSync(path.join(root, "node_modules/.bin/playwright"), 0o755);
const env = {
  ...process.env,
  CI: "",
  VISUAL_DELTA_NO_LOCAL_CONFIG: "",
  VISUAL_DELTA_CAPTURE_PROFILE: "native",
};
const run = (args, expected = 0) => {
  const result = spawnSync(
    process.execPath,
    [path.join(packageRoot, "dist/node/cli.js"), ...args],
    { cwd: root, env, encoding: "utf8", timeout: 180_000 },
  );
  if (result.status !== expected) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
  }
  assert.equal(result.status, expected, `visual-delta ${args.join(" ")}`);
  return result;
};
const namespace = `profiles/native/${process.platform}-${process.arch}`;
const baselineRoot = path.join(root, "snapshots", namespace);
const artifactRoot = path.join(root, ".visual-delta/artifacts", namespace);
const baseline = path.join(baselineRoot, "native--basic-chromium.png");
const compare = [
  "test",
  "--story-id",
  "native--basic",
  "--snapshot-dir",
  "snapshots",
  "--failure-mode",
  "strict",
  "--fresh",
];
run(["harness", "doctor"]);
for (const browser of browsers)
  run([
    "update",
    "--browser",
    browser,
    "--story-id",
    "native--basic",
    "--snapshot-dir",
    "snapshots",
    "--approved",
    "--create-only",
  ]);
assert(existsSync(baseline));
assert(
  existsSync(path.join(baselineRoot, "native--basic--contrast-chromium.png")),
);
const bytes = readFileSync(baseline);
run(compare);
const result = JSON.parse(
  readFileSync(
    path.join(artifactRoot, "native--basic-chromium.result.json"),
    "utf8",
  ),
);
assert.equal(result.captureProfile.os, process.platform);
assert.equal(result.captureProfile.kind, "native");
assert.equal(result.outcome, "passed");
assert.equal(result.passThresholdPercent, 0.5);
for (const browser of browsers)
  run([
    "interaction-update",
    "--browser",
    browser,
    "--story-id",
    "native--basic",
    "--step-label",
    "Active",
    "--snapshot-dir",
    "snapshots",
    "--approved",
  ]);
assert(
  existsSync(path.join(baselineRoot, "native--basic--active-chromium.png")),
);
run([...compare, "--step-id", "active"]);
writeFileSync(path.join(root, "color.json"), JSON.stringify([220, 80, 40]));
run([...compare, "--rebuild"], 1);
assert.equal(
  JSON.parse(
    readFileSync(
      path.join(artifactRoot, "native--basic-chromium.result.json"),
      "utf8",
    ),
  ).outcome,
  "mismatch",
);
assert.deepEqual(readFileSync(baseline), bytes);
run(
  [
    "test",
    "--story-id",
    "native--basic",
    "--snapshot-dir",
    "missing-pngs",
    "--failure-mode",
    "strict",
    "--fresh",
  ],
  1,
);
assert.equal(
  JSON.parse(
    readFileSync(
      path.join(artifactRoot, "native--basic-chromium.result.json"),
      "utf8",
    ),
  ).outcome,
  "missing-baseline",
);
assert.deepEqual(readFileSync(baseline), bytes);
assert(readdirSync(baselineRoot).every((file) => file.endsWith(".png")));
console.log(`Native capture acceptance passed. Persistent example: ${root}`);
