import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DOCKER_VISUAL_DELTA_WORKER_ROOT,
  changedStagedArtifacts,
  createCaptureJobManifest,
  dockerLinkedVisualDeltaPackageMountArgs,
  dockerVisualDeltaWorkerCommand,
  dockerVisualDeltaWorkerTransactionCommand,
  dockerWorkspaceArgv,
  resolveDockerImageAvailability,
  resolveLinkedVisualDeltaPackage,
  resolveTypescriptCli,
  resolveVisualDeltaCaptureRunner,
  runVisualDeltaCaptureJob,
  runVisualDeltaInCaptureRunner,
  shouldBuildVisualDeltaPackageWorker,
  shouldStageVisualDeltaWorkspacePath,
  stageExternalVisualDeltaSnapshotDir,
  stageLinkedVisualDeltaBuildInput,
  stageLinkedVisualDeltaPackage,
  stageVisualDeltaPackageWorker,
  visualDeltaDependencyInstallKey,
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
  it("accepts an exact locally cached image when registry inspection is unavailable", () => {
    const calls: string[][] = [];
    const output = (_command: string, args: string[]) => {
      calls.push(args);
      if (args[0] === "buildx") throw new Error("registry unavailable");
      return "cached image";
    };

    expect(resolveDockerImageAvailability("fixture@sha256:digest", output)).toBe(
      "local",
    );
    expect(calls).toEqual([
      ["buildx", "imagetools", "inspect", "fixture@sha256:digest"],
      ["image", "inspect", "fixture@sha256:digest"],
    ]);
  });

  it("rejects a pinned image absent from both the registry and local store", () => {
    expect(
      resolveDockerImageAvailability("fixture@sha256:missing", () => {
        throw new Error("unavailable");
      }),
    ).toBeNull();
  });

  it("stages only Visual Delta artifacts and affected-planning cache", () => {
    expect(shouldStageVisualDeltaWorkspacePath(".visual-delta")).toBe(true);
    expect(
      shouldStageVisualDeltaWorkspacePath(
        ".visual-delta/cache/affected-state-v1.json",
      ),
    ).toBe(true);
    expect(
      shouldStageVisualDeltaWorkspacePath(
        ".visual-delta/cache/preview-stats.json",
      ),
    ).toBe(true);
    expect(
      shouldStageVisualDeltaWorkspacePath(".visual-delta/cache/unrelated.json"),
    ).toBe(false);
    expect(
      shouldStageVisualDeltaWorkspacePath(
        ".visual-delta/capture-inputs/snapshot-dir/card.png",
      ),
    ).toBe(false);
    expect(shouldStageVisualDeltaWorkspacePath(".cache/vite/deps.json")).toBe(
      false,
    );
    expect(
      shouldStageVisualDeltaWorkspacePath(".turbo/cache/manifest.json"),
    ).toBe(false);
    expect(
      shouldStageVisualDeltaWorkspacePath("storybook-static/index.json"),
    ).toBe(true);
    expect(shouldStageVisualDeltaWorkspacePath("storybook-static")).toBe(true);
    expect(
      shouldStageVisualDeltaWorkspacePath("storybook-static/iframe.html"),
    ).toBe(false);
    expect(
      shouldStageVisualDeltaWorkspacePath(
        ".nx/cache/manifest.json",
        ".visual-delta/cache",
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

  it("resolves the compiler through the TypeScript package manifest", () => {
    const root = mkdtempSync(
      path.join(process.cwd(), ".visual-delta-typescript-"),
    );
    const packageRoot = path.join(root, "node_modules", "typescript");
    const typescriptCli = path.join(packageRoot, "bin", "tsc");
    mkdirSync(path.dirname(typescriptCli), { recursive: true });
    mkdirSync(path.join(packageRoot, "lib"), { recursive: true });
    writeFileSync(typescriptCli, "#!/usr/bin/env node\n");
    writeFileSync(path.join(packageRoot, "lib", "version.js"), "export {};\n");
    writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: "typescript",
        type: "module",
        exports: {
          ".": "./lib/version.js",
          "./package.json": "./package.json",
        },
        bin: { tsc: "./bin/tsc" },
      }),
    );
    const packageRequire = createRequire(path.join(root, "consumer.cjs"));
    try {
      expect(() => packageRequire.resolve("typescript/bin/tsc")).toThrow(
        "Package subpath './bin/tsc' is not defined by \"exports\"",
      );
      expect(resolveTypescriptCli(packageRequire)).toBe(typescriptCli);
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

  it("relinks every fresh workspace while reusing a warm dependency volume", () => {
    const command = dockerVisualDeltaWorkerTransactionCommand([
      "test",
      "--story-id",
      "card--default",
    ]);
    expect(command.slice(0, 2)).toEqual(["bash", "-lc"]);
    expect(command[2]).toContain('if [ -f "$marker" ]');
    expect(command[2]).toContain(
      "pnpm install --frozen-lockfile --offline",
    );
    expect(command[2]).toContain("pnpm install --frozen-lockfile");
    expect(command[2]).toContain('exec "$@"');
    expect(command.slice(4)).toEqual([
      "node",
      `${DOCKER_VISUAL_DELTA_WORKER_ROOT}/dist/node/cli.js`,
      "test",
      "--story-id",
      "card--default",
    ]);
  });

  it("stages a linked source checkout without host dependencies", () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-link-"));
    const workspace = path.join(root, "consumer");
    const packageRoot = path.join(root, "visual-delta-source");
    const stagingParent = path.join(root, "stage");
    mkdirSync(workspace, { recursive: true });
    mkdirSync(path.join(packageRoot, "src"), { recursive: true });
    mkdirSync(path.join(packageRoot, "dist", "node"), { recursive: true });
    mkdirSync(path.join(packageRoot, "node_modules", "host-only"), {
      recursive: true,
    });
    mkdirSync(stagingParent, { recursive: true });
    writeFileSync(
      path.join(workspace, "package.json"),
      JSON.stringify({
        devDependencies: {
          "@lapismd/storybook-addon-visual-delta":
            "link:../visual-delta-source",
        },
      }),
    );
    writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ name: "@lapismd/storybook-addon-visual-delta" }),
    );
    writeFileSync(
      path.join(packageRoot, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\n",
    );
    writeFileSync(path.join(packageRoot, "src", "preview.ts"), "export {};\n");
    writeFileSync(
      path.join(packageRoot, "dist", "node", "cli.js"),
      "export {};\n",
    );
    writeFileSync(
      path.join(packageRoot, "node_modules", "host-only", "index.js"),
      "throw new Error('wrong platform');\n",
    );
    try {
      const linkedPackage = resolveLinkedVisualDeltaPackage({
        workspaceRoot: workspace,
        packageRoot,
      });
      expect(linkedPackage).toEqual({
        sourceRoot: packageRoot,
        containerRoot: "/visual-delta-source",
        dependencyKey: visualDeltaDependencyInstallKey(packageRoot),
      });
      const stagedRoot = stageLinkedVisualDeltaPackage({
        packageRoot,
        stagingParent,
      });
      expect(readFileSync(path.join(stagedRoot, "src", "preview.ts"), "utf8"))
        .toBe("export {};\n");
      expect(
        readFileSync(path.join(stagedRoot, "dist", "node", "cli.js"), "utf8"),
      ).toBe("export {};\n");
      expect(existsSync(path.join(stagedRoot, "node_modules", "host-only"))).toBe(
        false,
      );
      expect(statSync(path.join(stagedRoot, "node_modules")).isDirectory()).toBe(
        true,
      );
      const buildInput = stageLinkedVisualDeltaBuildInput({
        packageRoot,
        workspace,
      });
      const initialBuildInput = readFileSync(buildInput, "utf8");
      expect(initialBuildInput).not.toContain(packageRoot);
      writeFileSync(
        path.join(packageRoot, "src", "preview.ts"),
        "export const changed = true;\n",
      );
      stageLinkedVisualDeltaBuildInput({ packageRoot, workspace });
      expect(readFileSync(buildInput, "utf8")).not.toBe(initialBuildInput);
      expect(
        dockerLinkedVisualDeltaPackageMountArgs({
          stagedRoot,
          linkedPackage: linkedPackage!,
        }),
      ).toEqual([
        "--mount",
        `type=bind,src=${stagedRoot},dst=/visual-delta-source`,
        "--mount",
        `type=volume,src=visual-delta-linked-node-modules-${linkedPackage!.dependencyKey},dst=/visual-delta-source/node_modules`,
      ]);

      const command = dockerVisualDeltaWorkerTransactionCommand(["test"], {
        linkedPackageRoot: linkedPackage!.containerRoot,
      });
      expect(command[2]).toContain(
        'pnpm --dir "$linked_root" install --frozen-lockfile --ignore-scripts',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keys dependency installs by manifests rather than checkout location or source files", () => {
    const first = mkdtempSync(path.join(process.cwd(), ".visual-delta-deps-a-"));
    const second = mkdtempSync(path.join(process.cwd(), ".visual-delta-deps-b-"));
    const seed = (root: string) => {
      mkdirSync(path.join(root, "packages", "ui", "src"), { recursive: true });
      writeFileSync(path.join(root, "package.json"), '{"name":"fixture"}\n');
      writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
      writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
      writeFileSync(path.join(root, "packages/ui/package.json"), '{"name":"ui"}\n');
      writeFileSync(path.join(root, "packages/ui/src/index.ts"), "export {};\n");
    };
    try {
      seed(first);
      seed(second);
      const initial = visualDeltaDependencyInstallKey(first);
      expect(visualDeltaDependencyInstallKey(second)).toBe(initial);
      writeFileSync(path.join(second, "packages/ui/src/index.ts"), "export const value = 1;\n");
      expect(visualDeltaDependencyInstallKey(second)).toBe(initial);
      writeFileSync(path.join(second, "packages/ui/package.json"), '{"name":"ui","version":"2"}\n');
      expect(visualDeltaDependencyInstallKey(second)).not.toBe(initial);
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
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
        path.join(root, ".visual-delta", "cache"),
      ]),
    ).toEqual([
      "test",
      "--snapshot-dir",
      "/workspace/snapshots",
      "--cache-dir",
      "/workspace/.visual-delta/cache",
    ]);
    expect(() =>
      dockerWorkspaceArgv(root, [
        "test",
        "--snapshot-dir",
        path.resolve(root, "..", "outside"),
      ]),
    ).toThrow("inside the capture workspace");
    expect(
      dockerWorkspaceArgv(
        root,
        [
          "test",
          "--snapshot-dir",
          path.resolve(root, "..", "outside"),
        ],
        {
          externalSnapshotDir:
            "/workspace/.visual-delta/capture-inputs/snapshot-dir",
        },
      ),
    ).toEqual([
      "test",
      "--snapshot-dir",
      "/workspace/.visual-delta/capture-inputs/snapshot-dir",
    ]);
    expect(() =>
      dockerWorkspaceArgv(
        root,
        ["test", "--cache-dir", path.resolve(root, "..", "outside-cache")],
        {
          externalSnapshotDir:
            "/workspace/.visual-delta/capture-inputs/snapshot-dir",
        },
      ),
    ).toThrow("--cache-dir must resolve inside the capture workspace");
  });

  it("stages an external snapshot directory without returning it as an artifact", () => {
    const parent = mkdtempSync(
      path.join(process.cwd(), ".visual-delta-external-snapshots-"),
    );
    const root = path.join(parent, "project");
    const workspace = path.join(parent, "workspace");
    const snapshotDir = path.join(parent, "external-snapshots");
    const linkedBaselines = path.join(parent, "linked-baselines");
    mkdirSync(root, { recursive: true });
    mkdirSync(workspace, { recursive: true });
    mkdirSync(snapshotDir, { recursive: true });
    mkdirSync(path.join(linkedBaselines, "modes"), { recursive: true });
    writeFileSync(path.join(linkedBaselines, "modes", "default.png"), "baseline\n");
    symlinkSync(linkedBaselines, path.join(snapshotDir, "examples"), "dir");
    try {
      expect(
        stageExternalVisualDeltaSnapshotDir({
          root,
          workspace,
          argv: ["test", "--snapshot-dir", snapshotDir],
        }),
      ).toBe("/workspace/.visual-delta/capture-inputs/snapshot-dir");
      const stagedBaseline = path.join(
        workspace,
        ".visual-delta",
        "capture-inputs",
        "snapshot-dir",
        "examples",
        "modes",
        "default.png",
      );
      expect(readFileSync(stagedBaseline, "utf8")).toBe("baseline\n");
      expect(statSync(stagedBaseline).isFile()).toBe(true);
      expect(
        lstatSync(
          path.join(
            workspace,
            ".visual-delta",
            "capture-inputs",
            "snapshot-dir",
            "examples",
          ),
        ).isSymbolicLink(),
      ).toBe(false);
      expect(changedStagedArtifacts(root, workspace)).toEqual([]);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("rejects cyclic links in an external snapshot directory", () => {
    const parent = mkdtempSync(
      path.join(process.cwd(), ".visual-delta-external-cycle-"),
    );
    const root = path.join(parent, "project");
    const workspace = path.join(parent, "workspace");
    const snapshotDir = path.join(parent, "external-snapshots");
    mkdirSync(root, { recursive: true });
    mkdirSync(workspace, { recursive: true });
    mkdirSync(snapshotDir, { recursive: true });
    symlinkSync(snapshotDir, path.join(snapshotDir, "cycle"), "dir");
    try {
      expect(() =>
        stageExternalVisualDeltaSnapshotDir({
          root,
          workspace,
          argv: ["test", "--snapshot-dir", snapshotDir],
        }),
      ).toThrow("Cyclic link in external snapshot directory");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
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
    const sidecarRelative = ".visual-delta/artifacts/snapshots/card-chromium.result.json";
    const actualRelative = ".visual-delta/artifacts/snapshots/card-chromium.actual.png";
    const cacheRelative = ".visual-delta/cache/affected-state-v1.json";
    const sidecar = `${JSON.stringify({
      version: 4,
      storyId: "examples-card--default",
      snapshotRel: "card.png",
      status: "passed",
      generatedAt: new Date(0).toISOString(),
      tool: "playwright",
      target: { browser: "chromium" },
      captureProfile: fixtureProfile,
    })}\n`;
    const actual = Buffer.from("actual png fixture");
    mkdirSync(path.dirname(path.join(stage, sidecarRelative)), { recursive: true });
    mkdirSync(path.join(stage, ".visual-delta", "cache"), { recursive: true });
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
      ).rejects.toThrow("forbidden artifact");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects comparison sidecars with false runner provenance", async () => {
    const root = mkdtempSync(path.join(process.cwd(), ".visual-delta-runner-"));
    const stage = path.join(root, "stage");
    const relativePath = ".visual-delta/artifacts/snapshots/card-chromium.result.json";
    const sidecar = JSON.stringify({
      version: 4,
      storyId: "examples-card--default",
      snapshotRel: "card.png",
      status: "passed",
      generatedAt: new Date(0).toISOString(),
      tool: "playwright",
      captureProfile: { ...fixtureProfile, id: "not-the-runner" },
    });
    mkdirSync(path.dirname(path.join(stage, relativePath)), { recursive: true });
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
