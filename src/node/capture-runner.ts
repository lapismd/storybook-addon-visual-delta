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
  renameSync,
  rmSync,
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
const runningPackageFromSource =
  path.basename(path.dirname(path.dirname(currentPackageModulePath))) === "src";

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
  "blob-report",
  "dist",
  "node_modules",
  "playwright-report",
  "storybook-static",
  "test-results",
]);

function createStagedWorkspace(root: string): {
  parent: string;
  workspace: string;
} {
  const parent = mkdtempSync(path.join(tmpdir(), "visual-delta-capture-"));
  const workspace = path.join(parent, "workspace");
  cpSync(root, workspace, {
    recursive: true,
    filter(source) {
      return !STAGE_COPY_IGNORES.has(path.basename(source));
    },
  });
  return { parent, workspace };
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

function regularFiles(root: string): string[] {
  const files: string[] = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (STAGE_COPY_IGNORES.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  return files;
}

function changedStagedArtifacts(
  originalRoot: string,
  stagedRoot: string,
): NonNullable<VisualCaptureRunnerResult["stagedArtifacts"]> {
  return regularFiles(stagedRoot).flatMap((stagedPath) => {
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
      typescriptCli = currentPackageRequire.resolve("typescript/bin/tsc");
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
      const staged = createStagedWorkspace(manifest.root);
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
          [...commonArgs, ...dockerVisualDeltaWorkerCommand(manifest.argv)],
          { cwd: manifest.root },
          context,
        );
        context.onEvent?.({ type: "done", exitCode, profile });
        if (manifest.operation === "test" || exitCode !== 0) {
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
  if (options.operation === "test" && artifacts.length > 0) {
    throw new Error("Read-only comparison runners must not return staged artifacts.");
  }
  if (options.operation !== "test" && result.exitCode === 0) {
    const cleanupDockerStage =
      runner.kind === "docker" &&
      result.stagedArtifactRoot?.startsWith(
        `${path.join(tmpdir(), "visual-delta-capture-")}`,
      );
    try {
      if (
        runner.kind === "custom" &&
        (!result.stagedArtifactRoot || artifacts.length === 0)
      ) {
        throw new Error(
          "Custom mutation runners must return stagedArtifactRoot and stagedArtifacts.",
        );
      }
      if (result.stagedArtifactRoot && artifacts.length > 0) {
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
  }
  return result.exitCode;
}
