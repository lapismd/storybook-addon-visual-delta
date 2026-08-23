import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CLI_SHEBANG, prepareCliBin } from "./prepare-cli-bin.ts";

function temporaryCli(t, source) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "visual-delta-cli-"));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const cliPath = path.join(directory, "cli.js");
  writeFileSync(cliPath, source, { mode: 0o644 });
  return cliPath;
}

test("makes the built CLI executable without changing its contents", (t) => {
  const source = `${CLI_SHEBANG}\nconsole.log("ready");\n`;
  const cliPath = temporaryCli(t, source);

  const result = prepareCliBin(cliPath);

  assert.equal(readFileSync(cliPath, "utf8"), source);
  assert.notEqual(statSync(cliPath).mode & 0o111, 0);
  assert.equal(result.mode, 0o755);
});

test("rejects a built CLI without the Node shebang", (t) => {
  const cliPath = temporaryCli(t, 'console.log("not executable");\n');

  assert.throws(() => prepareCliBin(cliPath), /must start with/);
});
