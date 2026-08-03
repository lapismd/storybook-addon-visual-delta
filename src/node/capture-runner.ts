import { createHash, randomUUID } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  CANONICAL_VISUAL_CAPTURE_PROFILE,
  validateVisualCaptureProfile,
  visualCaptureProfileImageReference,
} from "../shared/capture-profile.js";
import type { VisualDeltaBrowser } from "../shared/environments.js";
import type { VisualTestFailureMode } from "../shared/failure-mode.js";
import {
  defineVisualDeltaCaptureRunner,
  type VisualCaptureJobManifest,
  type VisualCaptureOperation,
  type VisualCaptureRunnerResult,
  type VisualCaptureRunnerContext,
  type VisualDeltaCaptureRunner,
} from "../runner/index.js";
import type { VisualDiffSidecar } from "../visual-diff-sidecar.js";
import { readVisualDeltaProjectConfig } from "./project-config.js";

export const VISUAL_DELTA_RUNNER_MODULE_REL = ".visual-delta/runner.mjs";
export const VISUAL_DELTA_CAPTURE_WORKER_ENV =
  "VISUAL_DELTA_CAPTURE_WORKER";
export const DOCKER_VISUAL_DELTA_WORKER_ROOT =
  "/build/visual-delta-worker";

const currentPackageModulePath = fileURLToPath(import.meta.url);
const currentPackageRequire = createRequire(import.meta.url);
const currentPackageRoot = path.resolve(
  path.dirname(currentPackageModulePath),
  "../..",
);

export function shouldBuildVisualDeltaPackageWorker(options: {
  modulePath: string;
  packageRoot: string;
}): boolean {
  const packageRoot = path.resolve(options.packageRoot);
  const relativeModulePath = path
    .relative(packageRoot, path.resolve(options.modulePath))
    .replaceAll(path.sep, "/");
  return (
    relativeModulePath.startsWith("src/node/") &&
    existsSync(path.join(packageRoot, "tsconfig.node-build.json"))
  );
}

export function resolveTypescriptCli(
  packageRequire: Pick<NodeRequire, "resolve"> = currentPackageRequire,
): string {
  const packageJsonPath = packageRequire.resolve("typescript/package.json");
  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    bin?: string | Record<string, string>;
  };
  const configuredBin =
    typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.tsc;
  if (!configuredBin || path.isAbsolute(configuredBin)) {
    throw new Error(
      "The installed TypeScript package does not declare a tsc executable.",
    );
  }
  const typescriptCli = path.resolve(
    path.dirname(packageJsonPath),
    configuredBin,
  );
  if (!existsSync(typescriptCli)) {
    throw new Error(
      "The installed TypeScript package is missing its tsc executable.",
    );
  }
  return typescriptCli;
}

const runningPackageFromSource = shouldBuildVisualDeltaPackageWorker({
  modulePath: currentPackageModulePath,
  packageRoot: currentPackageRoot,
});

function commandAvailable(command: string): boolean {
  try {
    execFileSync(command, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function commandOutput(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function cacheKey(root: string): string {
  const lockPath = path.join(root, "pnpm-lock.yaml");
  const lock = existsSync(lockPath) ? readFileSync(lockPath) : Buffer.alloc(0);
  return createHash("sha256")
    .update(root)
    .update(lock)
    .update(CANONICAL_VISUAL_CAPTURE_PROFILE.id)
    .digest("hex")
    .slice(0, 16);
}

const STAGE_COPY_IGNORES = new Set([
  ".git",
  ".jj",
  ".cache",
  ".turbo",
  "blob-report",
  "dist",
  "node_modules",
  "playwright-report",
  "storybook-static",
  "test-results",
]);
const DEFAULT_AFFECTED_CACHE_DIR_REL = ".visual-delta/cache";
const ARTIFACT_DIR_REL = ".visual-delta/artifacts";
const CAPTURE_INPUTS_DIR_REL = ".visual-delta/capture-inputs";
const EXTERNAL_SNAPSHOT_INPUT_REL = `${CAPTURE_INPUTS_DIR_REL}/snapshot-dir`;
const AFFECTED_CACHE_FILE_NAMES = [
  "affected-state-v1.json",
  "preview-stats.json",
] as const;

function isPathAtOrBelow(relative: string, directory: string): boolean {
  return relative === directory || relative.startsWith(`${directory}/`);
}

function isPathAncestorOf(relative: string, directory: string): boolean {
  return !relative || directory.startsWith(`${relative}/`);
}

export function shouldStageVisualDeltaWorkspacePath(
  relativePath: string,
  affectedCacheDir = DEFAULT_AFFECTED_CACHE_DIR_REL,
  captureWorkspaceIgnore: readonly string[] = [],
): boolean {
  const relative = relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!relative) return true;
  if (isPathAtOrBelow(relative, CAPTURE_INPUTS_DIR_REL)) return false;
  if (relative === affectedCacheDir || isPathAncestorOf(relative, affectedCacheDir)) {
    return true;
  }
  if (isPathAtOrBelow(relative, affectedCacheDir)) {
    return AFFECTED_CACHE_FILE_NAMES.some(
      (name) => relative === `${affectedCacheDir}/${name}`,
    );
  }
  if (relative.startsWith(".cache/")) {
    return false;
  }
  if (
    captureWorkspaceIgnore.some((directory) =>
      isPathAtOrBelow(relative, directory),
    )
  ) {
    return false;
  }
  return !relative.split("/").some((segment) => STAGE_COPY_IGNORES.has(segment));
}

function affectedCacheDirRelative(root: string, argv: readonly string[]): string {
  const flagIndex = argv.lastIndexOf("--cache-dir");
  const configured = flagIndex >= 0 ? argv[flagIndex + 1]?.trim() : undefined;
  const absolute = path.resolve(root, configured || DEFAULT_AFFECTED_CACHE_DIR_REL);
  const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
  if (!relative || path.posix.isAbsolute(relative) || relative.split("/").includes("..")) {
    throw new Error("Affected cache directory must be inside the capture workspace.");
  }
  return relative;
}

function affectedCacheArtifactPaths(
  root: string,
  argv: readonly string[],
): string[] {
  const directory = affectedCacheDirRelative(root, argv);
  return AFFECTED_CACHE_FILE_NAMES.map((name) => `${directory}/${name}`);
}

function copyDereferencedCaptureInput(
  source: string,
  destination: string,
  ancestorDirectories: ReadonlySet<string> = new Set(),
): void {
  const realSource = realpathSync(source);
  const sourceStat = statSync(realSource);
  if (sourceStat.isDirectory()) {
    if (ancestorDirectories.has(realSource)) {
      throw new Error(`Cyclic link in external snapshot directory: ${source}`);
    }
    mkdirSync(destination, { recursive: true });
    const descendants = new Set(ancestorDirectories);
    descendants.add(realSource);
    for (const entry of readdirSync(realSource)) {
      copyDereferencedCaptureInput(
        path.join(realSource, entry),
        path.join(destination, entry),
        descendants,
      );
    }
    return;
  }
  if (!sourceStat.isFile()) {
    throw new Error(
      `External snapshot input must contain only files and directories: ${source}`,
    );
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(realSource, destination);
}

export function stageExternalVisualDeltaSnapshotDir(options: {
  root: string;
  workspace: string;
  argv: readonly string[];
}): string | undefined {
  const flagIndex = options.argv.lastIndexOf("--snapshot-dir");
  const configured = flagIndex >= 0 ? options.argv[flagIndex + 1]?.trim() : undefined;
  if (!configured) return undefined;
  const root = path.resolve(options.root);
  const snapshotDir = path.resolve(root, configured);
  const relative = path.relative(root, snapshotDir).replaceAll(path.sep, "/");
  if (
    !path.posix.isAbsolute(relative) &&
    !relative.split("/").includes("..")
  ) {
    return undefined;
  }
  if (!existsSync(snapshotDir) || !statSync(snapshotDir).isDirectory()) {
    throw new Error(`External snapshot directory does not exist: ${snapshotDir}`);
  }
  const stagedSnapshotDir = path.join(
    options.workspace,
    ...EXTERNAL_SNAPSHOT_INPUT_REL.split("/"),
  );
  mkdirSync(path.dirname(stagedSnapshotDir), { recursive: true });
  copyDereferencedCaptureInput(snapshotDir, stagedSnapshotDir);
  return `/workspace/${EXTERNAL_SNAPSHOT_INPUT_REL}`;
}

function createStagedWorkspace(
  root: string,
  affectedCacheDir: string,
  captureWorkspaceIgnore: readonly string[],
  argv: readonly string[],
): {
  parent: string;
  workspace: string;
  externalSnapshotDir?: string;
} {
  const parent = mkdtempSync(path.join(tmpdir(), "visual-delta-capture-"));
  const workspace = path.join(parent, "workspace");
  cpSync(root, workspace, {
    recursive: true,
    filter(source) {
      const relative = path.relative(root, source).replaceAll(path.sep, "/");
      return shouldStageVisualDeltaWorkspacePath(
        relative,
        affectedCacheDir,
        captureWorkspaceIgnore,
      );
    },
  });
  const externalSnapshotDir = stageExternalVisualDeltaSnapshotDir({
    root,
    workspace,
    argv,
  });
  return { parent, workspace, externalSnapshotDir };
}

function changedExactArtifacts(
  originalRoot: string,
  stagedRoot: string,
  relativePaths: readonly string[],
): NonNullable<VisualCaptureRunnerResult["stagedArtifacts"]> {
  return relativePaths.flatMap((relativePath) => {
    const stagedPath = path.resolve(stagedRoot, ...relativePath.split("/"));
    if (!existsSync(stagedPath) || !lstatSync(stagedPath).isFile()) return [];
    const originalPath = path.resolve(originalRoot, ...relativePath.split("/"));
    const stagedBytes = readFileSync(stagedPath);
    const stagedHash = createHash("sha256").update(stagedBytes).digest("hex");
    if (
      existsSync(originalPath) &&
      createHash("sha256").update(readFileSync(originalPath)).digest("hex") === stagedHash
    ) {
      return [];
    }
    return [{ relativePath, sha256: stagedHash }];
  });
}

export function stageVisualDeltaPackageWorker(options: {
  packageRoot: string;
  stagingParent: string;
}): string {
  const packageRoot = path.resolve(options.packageRoot);
  const packageJson = path.join(packageRoot, "package.json");
  const distRoot = path.join(packageRoot, "dist");
  const workerCli = path.join(distRoot, "node", "cli.js");
  if (!existsSync(packageJson) || !existsSync(workerCli)) {
    throw new Error(
      "Visual Delta package worker is unavailable. Build the package worker before capture.",
    );
  }
  const workerRoot = path.join(options.stagingParent, "visual-delta-worker");
  mkdirSync(workerRoot, { recursive: true });
  copyFileSync(packageJson, path.join(workerRoot, "package.json"));
  cpSync(distRoot, path.join(workerRoot, "dist"), { recursive: true });
  return workerRoot;
}

export function dockerVisualDeltaWorkerCommand(
  argv: readonly string[],
): string[] {
  return [
    "node",
    `${DOCKER_VISUAL_DELTA_WORKER_ROOT}/dist/node/cli.js`,
    ...argv,
  ];
}

export function dockerWorkspaceArgv(
  root: string,
  argv: readonly string[],
  options: { externalSnapshotDir?: string } = {},
): string[] {
  const pathFlags = new Set(["--snapshot-dir", "--cache-dir"]);
  return argv.map((value, index) => {
    if (!pathFlags.has(argv[index - 1] ?? "") || !path.isAbsolute(value)) {
      return value;
    }
    const relative = path.relative(root, value).replaceAll(path.sep, "/");
    if (path.posix.isAbsolute(relative) || relative.split("/").includes("..")) {
      if (argv[index - 1] === "--snapshot-dir" && options.externalSnapshotDir) {
        return options.externalSnapshotDir;
      }
      throw new Error(`${argv[index - 1]} must resolve inside the capture workspace.`);
    }
    return relative ? `/workspace/${relative}` : "/workspace";
  });
}

function regularFiles(
  root: string,
  captureWorkspaceIgnore: readonly string[],
): string[] {
  const files: string[] = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (STAGE_COPY_IGNORES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
      if (isPathAtOrBelow(relative, CAPTURE_INPUTS_DIR_REL)) continue;
      if (
        captureWorkspaceIgnore.some((ignored) =>
          isPathAtOrBelow(relative, ignored),
        )
      ) {
        continue;
      }
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  return files;
}

export function changedStagedArtifacts(
  originalRoot: string,
  stagedRoot: string,
  captureWorkspaceIgnore: readonly string[] = [],
): NonNullable<VisualCaptureRunnerResult["stagedArtifacts"]> {
  return regularFiles(stagedRoot, captureWorkspaceIgnore).flatMap((stagedPath) => {
    const relativePath = path.relative(stagedRoot, stagedPath).replaceAll(path.sep, "/");
    const originalPath = path.join(originalRoot, ...relativePath.split("/"));
    const stagedBytes = readFileSync(stagedPath);
    if (existsSync(originalPath)) {
      const originalHash = createHash("sha256").update(readFileSync(originalPath)).digest("hex");
      const stagedHash = createHash("sha256").update(stagedBytes).digest("hex");
      if (originalHash === stagedHash) return [];
    }
    return [{
      relativePath,
      sha256: createHash("sha256").update(stagedBytes).digest("hex"),
    }];
  });
}

function testArtifactKind(
  relativePath: string,
  affectedCacheArtifacts: ReadonlySet<string>,
): "sidecar" | "actual" | "diff" | "affected-cache" | null {
  if (affectedCacheArtifacts.has(relativePath)) return "affected-cache";
  if (!isPathAtOrBelow(relativePath, ARTIFACT_DIR_REL)) return null;
  if (/\.actual\.png$/i.test(relativePath)) return "actual";
  if (/\.diff\.png$/i.test(relativePath)) return "diff";
  if (/\.result\.json$/i.test(relativePath)) return "sidecar";
  return null;
}

function validateTestArtifacts(options: {
  stagedArtifactRoot: string;
  artifacts: NonNullable<VisualCaptureRunnerResult["stagedArtifacts"]>;
  profile: VisualCaptureRunnerResult["profile"];
  storyIds: readonly string[];
  browsers: readonly VisualDeltaBrowser[];
  affectedCacheArtifacts: ReadonlySet<string>;
}): void {
  const sidecarBases = new Set<string>();
  for (const artifact of options.artifacts) {
    const relative = artifact.relativePath.replaceAll("\\", "/");
    if (
      !relative ||
      path.posix.isAbsolute(relative) ||
      relative.split("/").includes("..")
    ) {
      throw new Error(`Unsafe compare-only artifact path: ${artifact.relativePath}`);
    }
    const kind = testArtifactKind(relative, options.affectedCacheArtifacts);
    if (kind === "affected-cache") {
      try {
        const parsed = JSON.parse(
          readFileSync(
            path.resolve(options.stagedArtifactRoot, ...relative.split("/")),
            "utf8",
          ),
        ) as unknown;
        if (!parsed || typeof parsed !== "object") throw new Error("invalid");
      } catch {
        throw new Error(`Compare-only affected cache is not valid JSON: ${relative}`);
      }
      continue;
    }
    if (kind !== "sidecar") continue;
    const sidecarPath = path.resolve(
      options.stagedArtifactRoot,
      ...relative.split("/"),
    );
    let sidecar: VisualDiffSidecar;
    try {
      sidecar = JSON.parse(readFileSync(sidecarPath, "utf8")) as VisualDiffSidecar;
    } catch {
      throw new Error(`Compare-only staged JSON is not a visual sidecar: ${relative}`);
    }
    if (
      sidecar.version !== 4 ||
      typeof sidecar.storyId !== "string" ||
      sidecar.tool !== "playwright"
    ) {
      throw new Error(`Compare-only staged JSON is not a visual sidecar: ${relative}`);
    }
    if (options.storyIds.length > 0 && !options.storyIds.includes(sidecar.storyId)) {
      throw new Error(`Comparison sidecar escaped the frozen story scope: ${relative}`);
    }
    const sidecarBrowser = sidecar.target?.browser ?? sidecar.browser;
    if (
      options.browsers.length > 0 &&
      (!sidecarBrowser || !options.browsers.includes(sidecarBrowser))
    ) {
      throw new Error(`Comparison sidecar escaped the frozen browser scope: ${relative}`);
    }
    if (!sidecar.captureProfile || !isDeepStrictEqual(sidecar.captureProfile, options.profile)) {
      throw new Error(`Comparison sidecar profile does not match the capture runner: ${relative}`);
    }
    const base = relative.replace(/\.result\.json$/i, "");
    const publicBase = base.slice(`${ARTIFACT_DIR_REL}/`.length);
    if (
      (sidecar.actualRel && sidecar.actualRel !== `${publicBase}.actual.png`) ||
      (sidecar.diffRel && sidecar.diffRel !== `${publicBase}.diff.png`)
    ) {
      throw new Error(`Comparison sidecar diagnostic paths do not match its result: ${relative}`);
    }
    sidecarBases.add(base);
  }
  for (const artifact of options.artifacts) {
    const relative = artifact.relativePath.replaceAll("\\", "/");
    const kind = testArtifactKind(relative, options.affectedCacheArtifacts);
    if (!kind) {
      throw new Error(`Compare-only runner returned a forbidden artifact: ${relative}`);
    }
    if (kind === "actual" || kind === "diff") {
      const base = relative.replace(/\.(?:actual|diff)\.png$/i, "");
      if (!sidecarBases.has(base)) {
        throw new Error(`Compare-only diagnostic has no matching sidecar: ${relative}`);
      }
    }
  }
}

function runProcess(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
  context: VisualCaptureRunnerContext,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, {
      cwd: options.cwd,
      env: options.env,
      maxBuffer: 10 * 1024 * 1024,
    });
    const abort = () => child.kill("SIGTERM");
    context.signal?.addEventListener("abort", abort, { once: true });
    child.stdout?.on("data", (chunk) => {
      const message = String(chunk);
      process.stdout.write(message);
      context.onEvent?.({ type: "log", message });
    });
    child.stderr?.on("data", (chunk) => {
      const message = String(chunk);
      process.stderr.write(message);
      context.onEvent?.({ type: "log", message });
    });
    child.on("error", reject);
    child.on("close", (code) => {
      context.signal?.removeEventListener("abort", abort);
      resolve(code ?? 1);
    });
  });
}

async function prepareVisualDeltaPackageWorker(
  stagingParent: string,
  context: VisualCaptureRunnerContext,
): Promise<string> {
  if (runningPackageFromSource) {
    context.onEvent?.({
      type: "log",
      message: "Preparing the Visual Delta package worker…\n",
    });
    let typescriptCli: string;
    try {
      typescriptCli = resolveTypescriptCli();
    } catch {
      throw new Error(
        "Visual Delta package worker cannot be built because TypeScript is unavailable.",
      );
    }
    const buildExit = await runProcess(
      process.execPath,
      [
        typescriptCli,
        "-p",
        path.join(currentPackageRoot, "tsconfig.node-build.json"),
      ],
      { cwd: currentPackageRoot },
      context,
    );
    if (buildExit !== 0) {
      throw new Error(`Visual Delta package worker build exited ${buildExit}.`);
    }
  }
  return stageVisualDeltaPackageWorker({
    packageRoot: currentPackageRoot,
    stagingParent,
  });
}

export function createDockerVisualDeltaCaptureRunner(): VisualDeltaCaptureRunner {
  const profile = CANONICAL_VISUAL_CAPTURE_PROFILE;
  return defineVisualDeltaCaptureRunner({
    id: "visual-delta-docker",
    kind: "docker",
    profile,
    async doctor() {
      const diagnostics = validateVisualCaptureProfile(profile);
      if (!commandAvailable("docker")) {
        diagnostics.push("Docker is unavailable. Install Docker or configure .visual-delta/runner.mjs.");
        return { ok: false, diagnostics };
      }
      try {
        commandOutput("docker", ["buildx", "version"]);
      } catch {
        diagnostics.push("Docker Buildx is unavailable; install the Buildx plugin for ARM64 image validation.");
      }
      const image = visualCaptureProfileImageReference(profile);
      if (image) {
        try {
          commandOutput("docker", ["buildx", "imagetools", "inspect", image]);
        } catch {
          diagnostics.push(`Canonical image is unavailable at ${image}.`);
        }
        try {
          const probe = commandOutput("docker", [
            "run",
            "--rm",
            "--platform",
            "linux/arm64",
            "--mount",
            `type=bind,src=${process.cwd()},dst=/workspace,readonly`,
            image,
            "bash",
            "-lc",
            [
              'test "$(uname -m)" = "aarch64"',
              "test -r /workspace/package.json",
              'cd /build && pnpm exec playwright --version | grep -Fx "Version 1.61.1"',
              "test -n \"$(find /ms-playwright -type f -name firefox -perm -u=x -print -quit)\"",
              "test -n \"$(find /ms-playwright -type f -name MiniBrowser -perm -u=x -print -quit)\"",
            ].join(" && "),
          ]);
          void probe;
        } catch {
          diagnostics.push(
            "Canonical ARM64 container probe failed (architecture/emulation, read-only mount, browser, or tool mismatch).",
          );
        }
      }
      return { ok: diagnostics.length === 0, diagnostics };
    },
    async run(manifest, context) {
      const diagnostics = validateVisualCaptureProfile(profile);
      if (diagnostics.length) throw new Error(diagnostics.join(" "));
      if (!commandAvailable("docker")) {
        throw new Error(
          "Docker is unavailable. Install Docker or configure .visual-delta/runner.mjs.",
        );
      }
      const image = visualCaptureProfileImageReference(profile)!;
      const key = cacheKey(manifest.root);
      const cacheDir = affectedCacheDirRelative(manifest.root, manifest.argv);
      const cacheArtifacts = affectedCacheArtifactPaths(
        manifest.root,
        manifest.argv,
      );
      const captureWorkspaceIgnore = readVisualDeltaProjectConfig(
        manifest.root,
      ).captureWorkspaceIgnore;
      const staged = createStagedWorkspace(
        manifest.root,
        cacheDir,
        captureWorkspaceIgnore,
        manifest.argv,
      );
      const nodeModulesVolume = `visual-delta-node-modules-${key}`;
      const storeVolume = `visual-delta-pnpm-store-${key}`;
      try {
        context.onEvent?.({ type: "start", profile });
        const packageWorkerRoot = await prepareVisualDeltaPackageWorker(
          staged.parent,
          context,
        );
        const commonArgs = [
          "run",
          "--rm",
          "--init",
          "--ipc=host",
          "--platform",
          "linux/arm64",
          "--workdir",
          "/workspace",
          "--mount",
          `type=bind,src=${staged.workspace},dst=/workspace`,
          "--mount",
          `type=bind,src=${packageWorkerRoot},dst=${DOCKER_VISUAL_DELTA_WORKER_ROOT},readonly`,
          "--mount",
          `type=volume,src=${nodeModulesVolume},dst=/workspace/node_modules`,
          "--mount",
          `type=volume,src=${storeVolume},dst=/pnpm/store`,
          "--env",
          `${VISUAL_DELTA_CAPTURE_WORKER_ENV}=1`,
          image,
        ];
        const installExit = await runProcess(
          "docker",
          [...commonArgs, "pnpm", "install", "--frozen-lockfile"],
          { cwd: manifest.root },
          context,
        );
        if (installExit !== 0) {
          rmSync(staged.parent, { recursive: true, force: true });
          return { exitCode: installExit, profile };
        }
        const exitCode = await runProcess(
          "docker",
          [
            ...commonArgs,
            ...dockerVisualDeltaWorkerCommand(
              dockerWorkspaceArgv(manifest.root, manifest.argv, {
                externalSnapshotDir: staged.externalSnapshotDir,
              }),
            ),
          ],
          { cwd: manifest.root },
          context,
        );
        context.onEvent?.({ type: "done", exitCode, profile });
        if (manifest.operation === "test") {
          const stagedArtifacts = [
            ...changedStagedArtifacts(
              manifest.root,
              staged.workspace,
              captureWorkspaceIgnore,
            ),
            ...changedExactArtifacts(
              manifest.root,
              staged.workspace,
              cacheArtifacts,
            ),
          ].filter(
            (artifact, index, all) =>
              all.findIndex(
                (candidate) => candidate.relativePath === artifact.relativePath,
              ) === index,
          );
          return {
            exitCode,
            profile,
            stagedArtifactRoot: staged.workspace,
            stagedArtifacts,
          };
        }
        if (exitCode !== 0) {
          rmSync(staged.parent, { recursive: true, force: true });
          return { exitCode, profile };
        }
        return {
          exitCode,
          profile,
          stagedArtifactRoot: staged.workspace,
          stagedArtifacts: changedStagedArtifacts(
            manifest.root,
            staged.workspace,
            captureWorkspaceIgnore,
          ),
        };
      } catch (error) {
        rmSync(staged.parent, { recursive: true, force: true });
        throw error;
      }
    },
  });
}

export async function resolveVisualDeltaCaptureRunner(
  root: string,
): Promise<VisualDeltaCaptureRunner> {
  const modulePath = path.join(root, VISUAL_DELTA_RUNNER_MODULE_REL);
  if (!existsSync(modulePath)) return createDockerVisualDeltaCaptureRunner();
  const loaded = (await import(
    /* @vite-ignore */ pathToFileURL(modulePath).href
  )) as { default?: unknown; runner?: unknown };
  const candidate = loaded.default ?? loaded.runner;
  const runner = defineVisualDeltaCaptureRunner(
    candidate as VisualDeltaCaptureRunner,
  );
  const diagnostics = validateVisualCaptureProfile(runner.profile);
  if (diagnostics.length > 0) {
    throw new Error(`Custom capture runner profile is invalid: ${diagnostics.join(" ")}`);
  }
  return runner;
}

export function createCaptureJobManifest(options: {
  root: string;
  argv: string[];
  operation: VisualCaptureOperation;
  storyIds?: string[];
  browsers?: VisualDeltaBrowser[];
  failureMode?: VisualTestFailureMode;
  mutationApproved?: boolean;
}): VisualCaptureJobManifest {
  const manifest: VisualCaptureJobManifest = {
    schemaVersion: 1,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    operation: options.operation,
    root: path.resolve(options.root),
    argv: Object.freeze([...options.argv]) as unknown as string[],
    storyIds: Object.freeze([...new Set(options.storyIds ?? [])]) as unknown as string[],
    browsers: Object.freeze([...new Set(options.browsers ?? [])]) as unknown as VisualDeltaBrowser[],
    failureMode: options.failureMode,
    mutationApproved: options.mutationApproved === true,
  };
  return Object.freeze(manifest);
}

function applyStagedArtifacts(options: {
  root: string;
  stagedArtifactRoot: string;
  artifacts: NonNullable<VisualCaptureRunnerResult["stagedArtifacts"]>;
}): void {
  const root = path.resolve(options.root);
  const stagedRoot = path.resolve(options.stagedArtifactRoot);
  for (const artifact of options.artifacts) {
    const relative = artifact.relativePath.replaceAll("\\", "/");
    if (!relative || path.posix.isAbsolute(relative) || relative.split("/").includes("..")) {
      throw new Error(`Unsafe staged artifact path: ${artifact.relativePath}`);
    }
    const source = path.resolve(stagedRoot, ...relative.split("/"));
    const destination = path.resolve(root, ...relative.split("/"));
    if (!source.startsWith(`${stagedRoot}${path.sep}`) || !destination.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Staged artifact escapes its approved root: ${relative}`);
    }
    const stat = lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Staged artifact must be a regular file: ${relative}`);
    }
    const actualHash = createHash("sha256").update(readFileSync(source)).digest("hex");
    const expectedHash = artifact.sha256.replace(/^sha256:/, "");
    if (actualHash !== expectedHash) {
      throw new Error(`Staged artifact checksum mismatch: ${relative}`);
    }
    mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    copyFileSync(source, temporary);
    renameSync(temporary, destination);
  }
}

export async function runVisualDeltaCaptureJob(options: {
  root: string;
  argv: string[];
  operation: VisualCaptureOperation;
  storyIds?: string[];
  browsers?: VisualDeltaBrowser[];
  failureMode?: VisualTestFailureMode;
  mutationApproved?: boolean;
  context?: VisualCaptureRunnerContext;
}): Promise<VisualCaptureRunnerResult> {
  const runner = await resolveVisualDeltaCaptureRunner(options.root);
  const manifest = createCaptureJobManifest(options);
  if (options.operation !== "test" && !options.mutationApproved) {
    throw new Error("Capture runner mutation requires --approved.");
  }
  const result = await runner.run(manifest, options.context ?? {});
  if (!result || typeof result !== "object" || !result.profile) {
    throw new Error("Capture runner did not return terminal profile metadata.");
  }
  const resultProfileErrors = validateVisualCaptureProfile(result.profile);
  if (resultProfileErrors.length > 0) {
    throw new Error(
      `Capture runner returned an invalid profile: ${resultProfileErrors.join(" ")}`,
    );
  }
  if (!isDeepStrictEqual(result.profile, runner.profile)) {
    throw new Error(
      "Capture runner result profile does not match its resolved profile.",
    );
  }
  const artifacts = result.stagedArtifacts ?? [];
  const affectedCacheArtifacts = new Set(
    affectedCacheArtifactPaths(options.root, manifest.argv),
  );
  const cleanupDockerStage =
    runner.kind === "docker" &&
    result.stagedArtifactRoot?.startsWith(
      `${path.join(tmpdir(), "visual-delta-capture-")}`,
    );
  try {
    if (options.operation === "test" && artifacts.length > 0) {
      if (!result.stagedArtifactRoot) {
        throw new Error("Compare-only staged artifacts require stagedArtifactRoot.");
      }
      validateTestArtifacts({
        stagedArtifactRoot: result.stagedArtifactRoot,
        artifacts,
        profile: result.profile,
        storyIds: manifest.storyIds,
        browsers: manifest.browsers,
        affectedCacheArtifacts,
      });
    }
    if (
      options.operation !== "test" &&
      result.exitCode === 0 &&
      runner.kind === "custom" &&
      (!result.stagedArtifactRoot || artifacts.length === 0)
    ) {
      throw new Error(
        "Custom mutation runners must return stagedArtifactRoot and stagedArtifacts.",
      );
    }
    if (
      result.stagedArtifactRoot &&
      artifacts.length > 0 &&
      (options.operation === "test" || result.exitCode === 0)
    ) {
      applyStagedArtifacts({
        root: options.root,
        stagedArtifactRoot: result.stagedArtifactRoot,
        artifacts,
      });
    }
  } finally {
    if (cleanupDockerStage && result.stagedArtifactRoot) {
      rmSync(path.dirname(result.stagedArtifactRoot), {
        recursive: true,
        force: true,
      });
    }
  }
  return result;
}

export async function runVisualDeltaInCaptureRunner(options: {
  root: string;
  argv: string[];
  operation: VisualCaptureOperation;
  storyIds?: string[];
  browsers?: VisualDeltaBrowser[];
  failureMode?: VisualTestFailureMode;
  mutationApproved?: boolean;
  context?: VisualCaptureRunnerContext;
}): Promise<number> {
  return (await runVisualDeltaCaptureJob(options)).exitCode;
}
