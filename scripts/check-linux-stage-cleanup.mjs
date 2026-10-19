import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanupCaptureStage } from "../dist/node/capture-stage-cleanup.js";
import {
  CANONICAL_VISUAL_CAPTURE_PROFILE,
  visualCaptureProfileImageReference,
} from "../dist/shared/capture-profile.js";

assert.equal(process.platform, "linux");
assert.notEqual(
  process.getuid(),
  0,
  "Qualification must run as the non-root host user",
);
const image = visualCaptureProfileImageReference(
  CANONICAL_VISUAL_CAPTURE_PROFILE,
);
assert.ok(image?.includes("@sha256:"));
const stage = mkdtempSync(path.join(tmpdir(), "visual-delta-capture-"));
const outside = mkdtempSync(path.join(tmpdir(), "visual-delta-preserve-"));
const sentinel = path.join(outside, "user-data");
writeFileSync(sentinel, "preserve");
try {
  execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "--platform",
      "linux/arm64",
      "--network=none",
      "--mount",
      `type=bind,src=${stage},dst=/stage`,
      image,
      "node",
      "--input-type=module",
      "-e",
      'import { mkdirSync, writeFileSync, symlinkSync } from "node:fs"; mkdirSync("/stage/root-owned", { mode: 0o700 }); writeFileSync("/stage/root-owned/result", "derived"); symlinkSync(process.argv[1], "/stage/root-owned/outside");',
      sentinel,
    ],
    { stdio: "inherit" },
  );
  assert.throws(() => rmSync(stage, { recursive: true, force: true }), {
    code: "EACCES",
  });
  cleanupCaptureStage(stage, image);
  assert.equal(existsSync(stage), false);
  assert.equal(readFileSync(sentinel, "utf8"), "preserve");
  console.log(
    "Native non-root Linux cleanup passed; external user data preserved.",
  );
} finally {
  if (existsSync(stage)) cleanupCaptureStage(stage, image);
  rmSync(outside, { recursive: true, force: true });
}
