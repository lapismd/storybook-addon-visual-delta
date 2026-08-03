import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const snapshotRoot = path.join(
  root,
  ".cache",
  "visual-delta-matrix",
  "snapshots",
);
const fixtureRoot = path.dirname(snapshotRoot);
const artifactRoot = path.join(fixtureRoot, ".visual-delta", "artifacts");

function sidecars(directory = artifactRoot) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sidecars(absolute);
    if (!entry.isFile() || !entry.name.endsWith(".json")) return [];
    return [JSON.parse(readFileSync(absolute, "utf8"))];
  });
}

function runCase(testCase) {
  rmSync(fixtureRoot, { recursive: true, force: true });
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "-c",
      "playwright.browsers.config.ts",
      ...testCase.args,
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "1",
        FORCE_COLOR: "0",
        VISUAL_DELTA_MATRIX_CASE: testCase.story,
        VISUAL_DELTA_FAILURE_MODE: testCase.failureMode,
      },
    },
  );
  const exitCode = result.status ?? 1;
  if (exitCode !== testCase.exitCode) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(
      `${testCase.name}: expected exit ${testCase.exitCode}, received ${exitCode}`,
    );
  }
  const artifacts = sidecars();
  if (artifacts.length !== testCase.count) {
    throw new Error(
      `${testCase.name}: expected ${testCase.count} sidecars, received ${artifacts.length}`,
    );
  }
  for (const sidecar of artifacts) {
    if (
      sidecar.outcome !== testCase.outcome ||
      sidecar.policyStatus !== testCase.policyStatus
    ) {
      throw new Error(
        `${testCase.name}: unexpected ${sidecar.outcome}/${sidecar.policyStatus}`,
      );
    }
  }
  if (testCase.browser && artifacts[0]?.browser !== testCase.browser) {
    throw new Error(
      `${testCase.name}: expected ${testCase.browser}, received ${artifacts[0]?.browser}`,
    );
  }
  console.log(`✓ ${testCase.name}`);
}

const cases = [
  {
    name: "clean full Chromium/Firefox/WebKit matrix",
    story: "pass",
    failureMode: "strict",
    args: [],
    exitCode: 0,
    count: 3,
    outcome: "passed",
    policyStatus: "passed",
  },
  {
    name: "selected Firefox project",
    story: "pass",
    failureMode: "strict",
    args: ["--project", "firefox"],
    exitCode: 0,
    count: 1,
    browser: "firefox",
    outcome: "passed",
    policyStatus: "passed",
  },
  {
    name: "missing baselines warn without passing",
    story: "missing",
    failureMode: "warn",
    args: [],
    exitCode: 0,
    count: 3,
    outcome: "missing-baseline",
    policyStatus: "warning",
  },
  {
    name: "pixel mismatches warn without passing",
    story: "mismatch",
    failureMode: "warn",
    args: [],
    exitCode: 0,
    count: 3,
    outcome: "mismatch",
    policyStatus: "warning",
  },
  {
    name: "strict missing baseline fails",
    story: "missing",
    failureMode: "strict",
    args: ["--project", "chromium"],
    exitCode: 1,
    count: 1,
    browser: "chromium",
    outcome: "missing-baseline",
    policyStatus: "failed",
  },
  {
    name: "infrastructure failure remains fatal in warn mode",
    story: "broken",
    failureMode: "warn",
    args: ["--project", "chromium"],
    exitCode: 1,
    count: 0,
  },
  {
    name: "infrastructure failure remains fatal in strict mode",
    story: "broken",
    failureMode: "strict",
    args: ["--project", "chromium"],
    exitCode: 1,
    count: 0,
  },
];

for (const testCase of cases) runCase(testCase);
console.log("Visual Delta browser matrix acceptance passed.");
