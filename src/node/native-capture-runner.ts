import {
  nativeCaptureFiles as inventory,
  stageNativeActualArtifacts,
} from "./native-artifact-inputs.js";
import { isCapturePathInside } from "./capture-path-safety.js";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  defineVisualDeltaCaptureRunner,
  type VisualDeltaCaptureRunner,
} from "../runner/index.js";
import { validateVisualCaptureProfile } from "../shared/capture-profile.js";
import {
  currentVisualCaptureProfile,
  hostPlaywright,
  VISUAL_DELTA_CAPTURE_PROFILE_METADATA_ENV,
} from "./capture-profile.js";
import {
  readCaptureConfiguration,
  readConfigurationInputs,
  captureSnapshotDir,
  VISUAL_DELTA_CONFIG_SNAPSHOT_ENV,
} from "./capture-configuration.js";
import { runNativeCaptureProcess } from "./capture-process.js";
import {
  nativeFileHash,
  VISUAL_DELTA_NATIVE_STAGE_ENV,
} from "./native-write-transaction.js";

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.lastIndexOf(name);
  return index < 0 ? undefined : argv[index + 1];
}
export function createNativeVisualDeltaCaptureRunner(
  root: string,
): VisualDeltaCaptureRunner {
  const configuration = readCaptureConfiguration(root);
  if (configuration.profiles[configuration.profile]!.adapter !== "native")
    throw new Error(
      "Select a native capture profile before constructing a native runner.",
    );
  const profile = currentVisualCaptureProfile(root);
  if (
    profile.schemaVersion !== 2 ||
    profile.os !== process.platform ||
    profile.architecture !== process.arch
  )
    throw new Error(
      "Native capture must identify the actual host operating system and architecture.",
    );
  const inputs = readConfigurationInputs(root);
  return defineVisualDeltaCaptureRunner({
    id: `visual-delta-native-${configuration.profile}`,
    kind: "native",
    profile,
    async doctor() {
      const diagnostics = validateVisualCaptureProfile(profile);
      try {
        const playwright = hostPlaywright(root);
        for (const name of profile.browsers) {
          const browser = await playwright[name].launch({
            headless: true,
            timeout: 15000,
          });
          try {
            if (browser.version() !== profile.browserVersions[name])
              diagnostics.push(
                `${name} version differs from the installed Playwright metadata; reinstall the project browser.`,
              );
          } finally {
            await browser.close();
          }
        }
      } catch (error) {
        diagnostics.push(
          `Native browser probe failed: ${String(error)}. Run pnpm exec playwright install.`,
        );
      }
      return { ok: diagnostics.length === 0, diagnostics };
    },
    async run(manifest, context) {
      if (path.resolve(manifest.root) !== path.resolve(root))
        throw new Error(
          "Native capture manifest belongs to another project root.",
        );
      const errors = validateVisualCaptureProfile(profile);
      if (errors.length) throw new Error(errors.join(" "));
      if (context.signal?.aborted) return { exitCode: 130, profile };
      // Validate installed executables without an additional browser launch.
      const playwright = hostPlaywright(root);
      for (const browser of manifest.browsers.length
        ? manifest.browsers
        : profile.browsers) {
        if (!existsSync(playwright[browser].executablePath()))
          throw new Error(
            `Native ${browser} is unavailable. Run pnpm exec playwright install ${browser}.`,
          );
      }
      const snapshotDir = captureSnapshotDir(
        root,
        flag(manifest.argv, "--snapshot-dir"),
      );
      const snapshotRelative = path.relative(root, snapshotDir);
      const external =
        path.isAbsolute(snapshotRelative) ||
        snapshotRelative.split(path.sep).includes("..") ||
        !isCapturePathInside(root, snapshotDir);
      if (external && manifest.operation !== "test")
        throw new Error(
          "Native baseline writes require snapshotDir inside the project root; external snapshots remain compare-only.",
        );
      const stage = mkdtempSync(path.join(tmpdir(), "visual-delta-native-"));
      try {
        const output = path.join(stage, "output");
        const snapshots = path.join(
          output,
          external ? ".native-input/snapshots" : snapshotRelative,
        );
        mkdirSync(snapshots, { recursive: true });
        const originals: Record<string, string | null> = {};
        if (existsSync(snapshotDir))
          cpSync(snapshotDir, snapshots, {
            recursive: true,
            dereference: true,
          });
        for (const file of inventory(snapshots))
          originals[path.relative(output, file)] = nativeFileHash(
            path.join(snapshotDir, path.relative(snapshots, file)),
          );
        writeFileSync(
          path.join(stage, "originals.json"),
          JSON.stringify(originals),
        );
        stageNativeActualArtifacts(root, output);
        const env = {
          ...process.env,
          VISUAL_DELTA_CAPTURE_WORKER: "1",
          VISUAL_DELTA_CAPTURE_PROFILE: configuration.profile,
          [VISUAL_DELTA_CONFIG_SNAPSHOT_ENV]: JSON.stringify({
            ...inputs,
            captureConfiguration: configuration,
          }),
          [VISUAL_DELTA_CAPTURE_PROFILE_METADATA_ENV]: JSON.stringify(profile),
          [VISUAL_DELTA_NATIVE_STAGE_ENV]: stage,
          VISUAL_DELTA_STAGED_SNAPSHOT_DIR: snapshots,
          VISUAL_DELTA_STAGED_ARTIFACT_ROOT: path.join(
            output,
            ".visual-delta/artifacts",
          ),
        };
        context.onEvent?.({ type: "start", profile });
        const packageRoot = path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "../..",
        );
        const worker = path.join(packageRoot, "dist/node/cli.js");
        if (
          fileURLToPath(import.meta.url).includes(
            `${path.sep}src${path.sep}node${path.sep}`,
          ) &&
          existsSync(path.join(packageRoot, "tsconfig.node-build.json"))
        ) {
          const requirePackage = createRequire(
            path.join(packageRoot, "package.json"),
          );
          const typescriptManifest = requirePackage.resolve(
            "typescript/package.json",
          );
          const bin = (
            JSON.parse(readFileSync(typescriptManifest, "utf8")) as {
              bin: { tsc: string };
            }
          ).bin.tsc;
          const built = await runNativeCaptureProcess(
            process.execPath,
            [
              path.resolve(path.dirname(typescriptManifest), bin),
              "-p",
              "tsconfig.node-build.json",
            ],
            packageRoot,
            process.env,
            context,
          );
          if (built !== 0)
            throw new Error(`Visual Delta worker build exited ${built}.`);
        }
        if (!existsSync(worker))
          throw new Error(
            "Build the initiating Visual Delta package before native capture.",
          );
        const exitCode = await runNativeCaptureProcess(
          process.execPath,
          [worker, ...manifest.argv],
          root,
          env,
          context,
        );
        context.onEvent?.({ type: "done", exitCode, profile });
        if (
          context.signal?.aborted ||
          (manifest.operation !== "test" && exitCode !== 0)
        ) {
          rmSync(stage, { recursive: true, force: true });
          return { exitCode, profile };
        }
        const before = JSON.parse(
          readFileSync(path.join(stage, "originals.json"), "utf8"),
        ) as Record<string, string | null>;
        const stagedArtifacts = inventory(output).flatMap((file) => {
          const relativePath = path
            .relative(output, file)
            .replaceAll(path.sep, "/");
          if (relativePath.startsWith(".native-input/")) return [];
          const sha256 = nativeFileHash(file)!;
          if (
            sha256 ===
            (before[relativePath] ??
              nativeFileHash(path.join(root, relativePath)))
          )
            return [];
          return [
            {
              relativePath,
              sha256,
              originalSha256: relativePath.startsWith(
                ".visual-delta/artifacts/",
              )
                ? undefined
                : (before[relativePath] ?? null),
            },
          ];
        });
        return {
          exitCode,
          profile,
          stagedArtifactRoot: output,
          stagedArtifacts,
        };
      } catch (error) {
        rmSync(stage, { recursive: true, force: true });
        throw error;
      }
    },
  });
}
