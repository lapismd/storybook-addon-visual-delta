import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DOCKER_VISUAL_DELTA_WORKER_ROOT,
  createCaptureJobManifest,
  dockerVisualDeltaWorkerCommand,
  dockerWorkspaceArgv,
  resolveVisualDeltaCaptureRunner,
  runVisualDeltaCaptureJob,
  runVisualDeltaInCaptureRunner,
  shouldStageVisualDeltaWorkspacePath,
  stageVisualDeltaPackageWorker,
} from "./capture-runner.js";

const fixtureProfile = {
  schemaVersion: 1,
  id: "fixture",
  os: "linux",
  architecture: "arm64",
  image: "fixture",
  imageDigest: `sha256:${"a".repeat(64)}`,
  arm64ImageDigest: `sha256:${"c".repeat(64)}`,
  nodeVersion: "24",
  npmVersion: "12",
  pnpmVersion: "10",
  playwrightVersion: "1",
  browsers: ["chromium"],
  browserVersions: { chromium: "fixture" },
  locale: "en-GB",
  timezoneId: "Europe/London",
  colorScheme: "light",
  reducedMotion: "reduce",
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  rendering: {
    animations: "disabled",
    caret: "hide",
    screenshotScale: "device",
  },
  fontManifestSha256: `sha256:${"b".repeat(64)}`,
} as const;

function hash(contents: string | Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function writeFixtureRunner(options: {
  root: string;
  stage: string;
  artifacts: Array<{ relativePath: string; sha256: string }>;
  resultProfile?: unknown;
}): void {
  const configDir = path.join(options.root, ".visual-delta");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    path.join(configDir, "runner.mjs"),
    `const profile = ${JSON.stringify(fixtureProfile)}; export default { id: "fixture", kind: "custom", profile, async run() { return { exitCode: 0, profile: ${JSON.stringify(options.resultProfile ?? fixtureProfile)}, stagedArtifactRoot: ${JSON.stringify(options.stage)}, stagedArtifacts: ${JSON.stringify(options.artifacts)} }; } };\n`,
  );
}

describe("capture runner", () => {
  it("stages only the affected-planning cache under .cache", () => {
    expect(shouldStageVisualDeltaWorkspacePath(".cache")).toBe(true);
    expect(
      shouldStageVisualDeltaWorkspacePath(
        ".cache/visual-delta/affected-state-v1.json",
      ),
    ).toBe(true);
    expect(
      shouldStageVisualDeltaWorkspacePath(
        ".cache/visual-delta/preview-stats.json",
      ),
    ).toBe(true);
    expect(
      shouldStageVisualDeltaWorkspacePath(".cache/visual-delta/unrelated.json"),
    ).toBe(false);
    expect(shouldStageVisualDeltaWorkspacePath(".cache/vite/deps.json")).toBe(false);
    expect(shouldStageVisualDeltaWorkspacePath("storybook-static/index.json")).toBe(false);
    expect(
      shouldStageVisualDeltaWorkspacePath(
        "artifacts/affected/affected-state-v1.json",
        "artifacts/affected",
      ),
    ).toBe(true);
  });

  it("freezes and de-duplicates the requested scope", () => {
    const manifest = createCaptureJobManifest({
      root: ".",
      argv: ["test", "--all"],
      operation: "test",
      storyIds: ["a--one", "a--one"],
      browsers: ["chromium", "chromium"],
    });
    expect(manifest.storyIds).toEqual(["a--one"]);
    expect(manifest.browsers).toEqual(["chromium"]);
    expect(manifest.root).toBe(path.resolve("."));
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.storyIds)).toBe(true);
  });

  it("stages and invokes the initiating package worker independently of workspace bins", async () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-worker-"));
    const stagingParent = path.join(root, "stage");
    const { mkdirSync, readFileSync } = await import("node:fs");
    mkdirSync(path.join(root, "dist", "node"), { recursive: true });
    mkdirSync(stagingParent, { recursive: true });
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "@lapismd/storybook-addon-visual-delta",
        type: "module",
      }),
    );
    writeFileSync(path.join(root, "dist", "node", "cli.js"), "export {};\n");
    try {
      const workerRoot = stageVisualDeltaPackageWorker({
        packageRoot: root,
        stagingParent,
      });
      expect(
        readFileSync(path.join(workerRoot, "dist", "node", "cli.js"), "utf8"),
      ).toBe("export {};\n");
      expect(dockerVisualDeltaWorkerCommand(["update", "--approved"])).toEqual([
        "node",
        `${DOCKER_VISUAL_DELTA_WORKER_ROOT}/dist/node/cli.js`,
        "update",
        "--approved",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("maps absolute host artifact paths into the Docker workspace", () => {
    const root = path.join(path.sep, "Users", "fixture", "project");
    expect(
      dockerWorkspaceArgv(root, [
        "test",
        "--snapshot-dir",
        path.join(root, "snapshots"),
        "--cache-dir",
        path.join(root, ".cache", "visual-delta"),
      ]),
    ).toEqual([
      "test",
      "--snapshot-dir",
      "/workspace/snapshots",
      "--cache-dir",
      "/workspace/.cache/visual-delta",
    ]);
    expect(() =>
      dockerWorkspaceArgv(root, [
        "test",
        "--snapshot-dir",
        path.resolve(root, "..", "outside"),
      ]),
    ).toThrow("inside the capture workspace");
  });

  it("loads a project-owned custom module", async () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-runner-"));
    const configDir = path.join(root, ".visual-delta");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      path.join(configDir, "runner.mjs"),
      `export default { id: "fixture", kind: "custom", profile: { schemaVersion: 1, id: "fixture", os: "linux", architecture: "arm64", image: "fixture", imageDigest: "sha256:${"a".repeat(64)}", arm64ImageDigest: "sha256:${"c".repeat(64)}", nodeVersion: "24", npmVersion: "12", pnpmVersion: "10", playwrightVersion: "1", browsers: ["chromium"], browserVersions: { chromium: "fixture" }, locale: "en-GB", timezoneId: "Europe/London", colorScheme: "light", reducedMotion: "reduce", viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, rendering: { animations: "disabled", caret: "hide", screenshotScale: "device" }, fontManifestSha256: "sha256:${"b".repeat(64)}" }, async run() { return { exitCode: 0, profile: this.profile }; } };\n`,
    );
    try {
      await expect(resolveVisualDeltaCaptureRunner(root)).resolves.toMatchObject({
        id: "fixture",
        kind: "custom",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("applies checksum-verified custom mutation artifacts only after approval", async () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-runner-"));
    const configDir = path.join(root, ".visual-delta");
    const stage = path.join(root, "stage");
    const { mkdirSync, readFileSync } = await import("node:fs");
    mkdirSync(configDir, { recursive: true });
    mkdirSync(stage, { recursive: true });
    const contents = "staged output\n";
    const hash = createHash("sha256").update(contents).digest("hex");
    writeFileSync(path.join(stage, "generated.txt"), contents);
    writeFileSync(
      path.join(configDir, "runner.mjs"),
      `const profile = { schemaVersion: 1, id: "fixture", os: "linux", architecture: "arm64", image: "fixture", imageDigest: "sha256:${"a".repeat(64)}", arm64ImageDigest: "sha256:${"c".repeat(64)}", nodeVersion: "24", npmVersion: "12", pnpmVersion: "10", playwrightVersion: "1", browsers: ["chromium"], browserVersions: { chromium: "fixture" }, locale: "en-GB", timezoneId: "Europe/London", colorScheme: "light", reducedMotion: "reduce", viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, rendering: { animations: "disabled", caret: "hide", screenshotScale: "device" }, fontManifestSha256: "sha256:${"b".repeat(64)}" }; export default { id: "fixture", kind: "custom", profile, async run() { return { exitCode: 0, profile, stagedArtifactRoot: ${JSON.stringify(stage)}, stagedArtifacts: [{ relativePath: "generated.txt", sha256: ${JSON.stringify(hash)} }] }; } };\n`,
    );
    try {
      await expect(
        runVisualDeltaInCaptureRunner({
          root,
          argv: ["update", "--approved"],
          operation: "update",
          mutationApproved: true,
        }),
      ).resolves.toBe(0);
      expect(readFileSync(path.join(root, "generated.txt"), "utf8")).toBe(contents);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects terminal metadata that differs from the resolved profile", async () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-runner-"));
    const configDir = path.join(root, ".visual-delta");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      path.join(configDir, "runner.mjs"),
      `const profile = { schemaVersion: 1, id: "declared", os: "linux", architecture: "arm64", image: "fixture", imageDigest: "sha256:${"a".repeat(64)}", arm64ImageDigest: "sha256:${"c".repeat(64)}", nodeVersion: "24", npmVersion: "12", pnpmVersion: "10", playwrightVersion: "1", browsers: ["chromium"], browserVersions: { chromium: "fixture" }, locale: "en-GB", timezoneId: "Europe/London", colorScheme: "light", reducedMotion: "reduce", viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, rendering: { animations: "disabled", caret: "hide", screenshotScale: "device" }, fontManifestSha256: "sha256:${"b".repeat(64)}" }; export default { id: "fixture", kind: "custom", profile, async run() { return { exitCode: 0, profile: { ...profile, id: "different" } }; } };\n`,
    );
    try {
      await expect(
        runVisualDeltaInCaptureRunner({
          root,
          argv: ["test", "--all"],
          operation: "test",
        }),
      ).rejects.toThrow(/does not match/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("copies checksum-verified compare sidecars and diagnostics", async () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-runner-"));
    const stage = path.join(root, "stage");
    const sidecarRelative = "snapshots/card-chromium.json";
    const actualRelative = "snapshots/card-chromium.actual.png";
    const cacheRelative = ".cache/visual-delta/affected-state-v1.json";
    const sidecar = `${JSON.stringify({
      version: 3,
      storyId: "examples-card--default",
      snapshotRel: "card.png",
      status: "passed",
      generatedAt: new Date(0).toISOString(),
      tool: "playwright",
      target: { browser: "chromium" },
      captureProfile: fixtureProfile,
    })}\n`;
    const actual = Buffer.from("actual png fixture");
    mkdirSync(path.join(stage, "snapshots"), { recursive: true });
    mkdirSync(path.join(stage, ".cache", "visual-delta"), { recursive: true });
    writeFileSync(path.join(stage, sidecarRelative), sidecar);
    writeFileSync(path.join(stage, actualRelative), actual);
    writeFileSync(path.join(stage, cacheRelative), "{}\n");
    writeFixtureRunner({
      root,
      stage,
      artifacts: [
        { relativePath: sidecarRelative, sha256: hash(sidecar) },
        { relativePath: actualRelative, sha256: hash(actual) },
        { relativePath: cacheRelative, sha256: hash("{}\n") },
      ],
    });
    try {
      await expect(
        runVisualDeltaCaptureJob({
          root,
          argv: ["test", "--story-id", "examples-card--default"],
          operation: "test",
          storyIds: ["examples-card--default"],
          browsers: ["chromium"],
        }),
      ).resolves.toMatchObject({ exitCode: 0, profile: fixtureProfile });
      expect(readFileSync(path.join(root, sidecarRelative), "utf8")).toBe(sidecar);
      expect(readFileSync(path.join(root, actualRelative))).toEqual(actual);
      expect(readFileSync(path.join(root, cacheRelative), "utf8")).toBe("{}\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects baseline PNGs returned by compare-only runners", async () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-runner-"));
    const stage = path.join(root, "stage");
    const relativePath = "snapshots/card-chromium.png";
    const baseline = Buffer.from("forbidden baseline");
    mkdirSync(path.join(stage, "snapshots"), { recursive: true });
    writeFileSync(path.join(stage, relativePath), baseline);
    writeFixtureRunner({
      root,
      stage,
      artifacts: [{ relativePath, sha256: hash(baseline) }],
    });
    try {
      await expect(
        runVisualDeltaCaptureJob({
          root,
          argv: ["test", "--all"],
          operation: "test",
        }),
      ).rejects.toThrow("forbidden artifact");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects comparison sidecars with false runner provenance", async () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-runner-"));
    const stage = path.join(root, "stage");
    const relativePath = "snapshots/card-chromium.json";
    const sidecar = JSON.stringify({
      version: 3,
      storyId: "examples-card--default",
      snapshotRel: "card.png",
      status: "passed",
      generatedAt: new Date(0).toISOString(),
      tool: "playwright",
      captureProfile: { ...fixtureProfile, id: "not-the-runner" },
    });
    mkdirSync(path.join(stage, "snapshots"), { recursive: true });
    writeFileSync(path.join(stage, relativePath), sidecar);
    writeFixtureRunner({
      root,
      stage,
      artifacts: [{ relativePath, sha256: hash(sidecar) }],
    });
    try {
      await expect(
        runVisualDeltaCaptureJob({
          root,
          argv: ["test", "--all"],
          operation: "test",
        }),
      ).rejects.toThrow("profile does not match");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
