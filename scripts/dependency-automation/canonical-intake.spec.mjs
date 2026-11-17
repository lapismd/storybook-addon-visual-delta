import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import { parse, stringify } from "yaml";
import {
  checkValidatorCanonicalIntake,
  validatorFacts,
  verifyValidatorCanonicalIntake,
} from "./check-canonical-intake.mjs";
import { sourceIntakeReader } from "./source-intake-reader.mjs";
const fixture = JSON.parse(
  gunzipSync(
    readFileSync(
      new URL("../fixtures/validator-intake.json.gz", import.meta.url),
    ),
  ),
);
const policyBytes = readFileSync(
  new URL(
    "../../.github/dependency-automation/canonical-intake.json",
    import.meta.url,
  ),
  "utf8",
);
const { chapters } = JSON.parse(policyBytes);
const document = (facts) =>
  "# Source\n\n<!-- dependency-intake:validator-development:start -->\n\n```json\n" +
  JSON.stringify(facts, null, 2) +
  "\n```\n\n<!-- dependency-intake:validator-development:end -->\n";
function input() {
  const before = structuredClone(fixture.before),
    files = structuredClone(fixture.after);
  return {
    before,
    files,
    policyBytes,
    basePolicyBytes: policyBytes,
    changedFiles: [...Object.keys(files), ...chapters],
    baseDocuments: Object.fromEntries(
      chapters.map((p) => [p, document(validatorFacts(before, policyBytes))]),
    ),
    documents: Object.fromEntries(
      chapters.map((p) => [p, document(validatorFacts(files, policyBytes))]),
    ),
  };
}
test("actual released validator patch pair is independently verified", () =>
  assert.equal(verifyValidatorCanonicalIntake(input()).version, "0.2.1"));
test("actual generated empty coordinator note preserves development-only intake", () => {
  const candidate = input();
  const path = ".changeset/lapis-dependencies-123456abcdef.md";
  candidate.changedFiles.push(path);
  candidate.files[path] =
    "---\n---\n\nUpdate the specification validator development tool.\n";
  assert.equal(verifyValidatorCanonicalIntake(candidate).version, "0.2.1");
});
for (const [name, mutate] of [
  [
    "stale facts",
    (d) => (d.documents[chapters[0]] = d.baseDocuments[chapters[0]]),
  ],
  ["missing facts", (d) => (d.documents[chapters[0]] = "none")],
  [
    "duplicate markers",
    (d) => (d.documents[chapters[0]] += d.documents[chapters[0]]),
  ],
  ["manual chapter edits", (d) => (d.documents[chapters[0]] += "Manual text")],
  ["changed policy", (d) => (d.basePolicyBytes += " ")],
  ["unexpected source", (d) => d.changedFiles.push("src/index.ts")],
  [
    "unrelated lock drift",
    (d) => (d.files["pnpm-lock.yaml"] += "\nunknownSetting: changed\n"),
  ],
  [
    "public contract drift",
    (d) => {
      const m = JSON.parse(d.files["package.json"]);
      m.peerDependencies.react = "^20";
      d.files["package.json"] = JSON.stringify(m);
    },
  ],
  [
    "forged integrity",
    (d) =>
      (d.files["pnpm-lock.yaml"] = d.files["pnpm-lock.yaml"].replace(
        validatorFacts(d.files, d.policyBytes).integrity,
        "sha512-" + Buffer.alloc(64, 3).toString("base64"),
      )),
  ],
  [
    "unrelated same-version dependency edge",
    (d) => {
      const lock = parse(d.files["pnpm-lock.yaml"]);
      const [key, row] = Object.entries(lock.snapshots).find(
        ([k, r]) =>
          !k.startsWith("@lapismd/spec-validator@") &&
          r.dependencies &&
          Object.keys(r.dependencies).length,
      );
      const key2 = Object.keys(row.dependencies)[0];
      lock.snapshots[key].dependencies[key2] += "(unreviewed@1.0.0)";
      d.files["pnpm-lock.yaml"] = stringify(lock);
    },
  ],
])
  test("rejects " + name + " without mutation", () => {
    const d = input();
    mutate(d);
    const saved = structuredClone(d);
    assert.throws(() => verifyValidatorCanonicalIntake(d));
    assert.deepEqual(d, saved);
  });
for (const hasJj of [true, false])
  test(
    "source reader uses only read-only " + (hasJj ? "JJ" : "Git") + " ancestry",
    () => {
      const calls = [];
      const read = sourceIntakeReader(
        "/source",
        (binary, args) => {
          calls.push([binary, args]);
          return calls.length === 1 ? "a".repeat(40) + "\n" : "source bytes";
        },
        hasJj,
      );
      assert.equal(read("package.json"), "source bytes");
      assert.equal(calls[0][0], hasJj ? "jj" : "git");
      assert.deepEqual(
        calls[1],
        hasJj
          ? [
              "jj",
              [
                "--ignore-working-copy",
                "file",
                "show",
                "-r",
                "a".repeat(40),
                "--",
                "package.json",
              ],
            ]
          : ["git", ["show", "a".repeat(40) + ":package.json"]],
      );
    },
  );
test("source reader fails on unavailable ancestry", () =>
  assert.throws(() => sourceIntakeReader("/source", () => "", false)));

const notePath = ".changeset/lapis-dependencies-123456abcdef.md";
const note = (header = "", body = "Development tooling maintenance.") =>
  "---\n" + (header ? header + "\n" : "") + "---\n\n" + body + "\n";
function withNote(text = note(), path = notePath) {
  const candidate = input();
  candidate.changedFiles.push(path);
  candidate.files[path] = text;
  return candidate;
}
for (const [name, text] of [
  ["blank YAML", note()],
  ["empty YAML mapping", note("{}")],
  ["CRLF", note("{}").replaceAll("\n", "\r\n")],
  ["exact8192byte limit", "---\n---\n\n" + "x".repeat(8183)],
])
  test("accepts bounded maintenance note: " + name, () => {
    const candidate = withNote(text);
    const saved = structuredClone(candidate);
    assert.equal(verifyValidatorCanonicalIntake(candidate).version, "0.2.1");
    assert.deepEqual(candidate, saved);
  });
for (const [name, text] of [
  ["release bump", note('"@lapismd/storybook-addon-visual-delta": patch')],
  ["explicit null", note("null")],
  ["YAML null shorthand", note("~")],
  ["array", note("[]")],
  ["scalar", note("maintenance")],
  ["malformed YAML", note("[broken")],
  ["unknown YAML tag", note("!arbitrary {}")],
  ["duplicate YAML keys", note("package: patch\npackage: minor")],
  ["missing body", note("{}", " \t")],
  ["missing closing delimiter", "---\n{}\nMaintenance"],
  ["missing opening delimiter", "{}\n---\nMaintenance"],
  ["leading arbitrary text", "Unexpected\n" + note()],
  ["oversized body", note("", "x".repeat(8192))],
  ["oversized UTF8 body", note("", "é".repeat(4096))],
])
  test("rejects maintenance note: " + name, () => {
    const candidate = withNote(text);
    const saved = structuredClone(candidate);
    assert.throws(
      () => verifyValidatorCanonicalIntake(candidate),
      /maintenance note/u,
    );
    assert.deepEqual(candidate, saved);
  });
for (const path of [
  ".changeset/arbitrary.md",
  ".changeset/lapis-dependencies-123456abcde.md",
  ".changeset/lapis-dependencies-123456abcdef0.md",
  ".changeset/lapis-dependencies-123456ABCDEF.md",
  ".changeset/sub/lapis-dependencies-123456abcdef.md",
])
  test("rejects arbitrary maintenance path: " + path, () =>
    assert.throws(() => verifyValidatorCanonicalIntake(withNote(note(), path))),
  );
for (const [name, mutate] of [
  ["missing note bytes", (d) => delete d.files[notePath]],
  [
    "multiple notes",
    (d) => {
      const path = ".changeset/lapis-dependencies-abcdef123456.md";
      d.changedFiles.push(path);
      d.files[path] = note();
    },
  ],
  ["duplicate note path", (d) => d.changedFiles.push(notePath)],
  ["unrelated source beside note", (d) => d.changedFiles.push("src/index.ts")],
])
  test("rejects " + name, () => {
    const candidate = withNote();
    mutate(candidate);
    assert.throws(() => verifyValidatorCanonicalIntake(candidate));
  });

test("real source reader verifies the regular generated note and rejects symlinks/directories", () => {
  const root = mkdtempSync(join(tmpdir(), "visual-delta-empty-note-"));
  const candidate = withNote();
  const put = (path, bytes) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes);
  };
  const jj = (args) =>
    execFileSync("jj", ["--config", "signing.behavior=drop", ...args], {
      cwd: root,
      stdio: "pipe",
    });
  try {
    jj(["git", "init", "--colocate"]);
    for (const [path, bytes] of Object.entries(candidate.before))
      put(path, bytes);
    for (const [path, bytes] of Object.entries(candidate.baseDocuments))
      put(path, bytes);
    put(".github/dependency-automation/canonical-intake.json", policyBytes);
    jj(["commit", "-m", "Actual released validator fixture baseline"]);
    for (const [path, bytes] of Object.entries(candidate.files))
      put(path, bytes);
    for (const [path, bytes] of Object.entries(candidate.documents))
      put(path, bytes);
    assert.equal(checkValidatorCanonicalIntake(root).version, "0.2.1");
    rmSync(join(root, notePath));
    symlinkSync(join(root, "package.json"), join(root, notePath));
    assert.throws(
      () => checkValidatorCanonicalIntake(root),
      /non-regular source path/u,
    );
    rmSync(join(root, notePath));
    mkdirSync(join(root, notePath));
    put(notePath + "/unexpected.md", note());
    assert.throws(
      () => checkValidatorCanonicalIntake(root),
      /invalid empty maintenance note/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
