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
  changedStagedArtifacts,
  createCaptureJobManifest,
  dockerVisualDeltaWorkerCommand,
  dockerWorkspaceArgv,
  resolveVisualDeltaCaptureRunner,
  runVisualDeltaCaptureJob,
  runVisualDeltaInCaptureRunner,
  shouldBuildVisualDeltaPackageWorker,
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
    expect(shouldStageVisualDeltaWorkspacePath(".cache/vite/deps.json")).toBe(
      false,
    );
    expect(
      shouldStageVisualDeltaWorkspacePath(".turbo/cache/manifest.json"),
    ).toBe(false);
    expect(
      shouldStageVisualDeltaWorkspacePath("storybook-static/index.json"),
    ).toBe(false);
    expect(
      shouldStageVisualDeltaWorkspacePath(
        ".nx/cache/manifest.json",
        ".cache/visual-delta",
        [".nx/cache"],
      ),
    ).toBe(false);
    expect(
      shouldStageVisualDeltaWorkspacePath(
        "artifacts/affected/affected-state-v1.json",
        "artifacts/affected",
      ),
    ).toBe(true);
  });

  it("builds a worker only for a buildable package source checkout", () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-package-"));
    const sourceModule = path.join(root, "src", "node", "capture-runner.ts");
    const builtModule = path.join(root, "dist", "node", "capture-runner.js");
    mkdirSync(path.dirname(sourceModule), { recursive: true });
    mkdirSync(path.dirname(builtModule), { recursive: true });
    writeFileSync(sourceModule, "export {};\n");
    writeFileSync(builtModule, "export {};\n");
    try {
      expect(
        shouldBuildVisualDeltaPackageWorker({
          modulePath: sourceModule,
          packageRoot: root,
        }),
      ).toBe(false);

      writeFileSync(path.join(root, "tsconfig.node-build.json"), "{}\n");
      expect(
        shouldBuildVisualDeltaPackageWorker({
          modulePath: sourceModule,
          packageRoot: root,
        }),
      ).toBe(true);
      expect(
        shouldBuildVisualDeltaPackageWorker({
          modulePath: builtModule,
          packageRoot: root,
        }),
      ).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("excludes generated Turbo manifests from the post-run artifact inventory", () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-audit-"));
    const original = path.join(root, "original");
    const staged = path.join(root, "staged");
    mkdirSync(path.join(original, "snapshots"), { recursive: true });
    mkdirSync(path.join(staged, "snapshots"), { recursive: true });
    mkdirSync(path.join(staged, ".turbo", "cache"), { recursive: true });
    writeFileSync(path.join(staged, "snapshots", "card-chromium.json"), "{}\n");
    writeFileSync(
      path.join(staged, ".turbo", "cache", "manifest.json"),
      "{}\n",
    );
    mkdirSync(path.join(staged, ".nx", "cache"), { recursive: true });
    writeFileSync(path.join(staged, ".nx", "cache", "manifest.json"), "{}\n");
    try {
      expect(changedStagedArtifacts(original, staged, [".nx/cache"])).toEqual([
        expect.objectContaining({
          relativePath: "snapshots/card-chromium.json",
        }),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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

  it("rejects a configured cache when a custom runner explicitly returns it", async () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-runner-"));
    const stage = path.join(root, "stage");
    const relativePath = ".nx/cache/manifest.json";
    const manifest = "{}\n";
    mkdirSync(path.join(stage, ".nx", "cache"), { recursive: true });
    writeFileSync(path.join(stage, relativePath), manifest);
    writeFixtureRunner({
      root,
      stage,
      artifacts: [{ relativePath, sha256: hash(manifest) }],
    });
    writeFileSync(
      path.join(root, ".visual-delta", "config.json"),
      `${JSON.stringify({ captureWorkspaceIgnore: [".nx/cache"] })}\n`,
    );
    try {
      await expect(
        runVisualDeltaCaptureJob({
          root,
          argv: ["test", "--all"],
          operation: "test",
        }),
      ).rejects.toThrow("not a visual sidecar");
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
