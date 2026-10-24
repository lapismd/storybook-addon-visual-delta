import {
  validateVisualDeltaBrowsers,
  type VisualDeltaBrowser,
} from "../shared/environments.js";
import type { VisualDeltaProjectDefaults } from "../shared/config-types.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  validateVisualDeltaProjectDefaults,
  VISUAL_DELTA_PROJECT_DEFAULT_KEYS,
} from "../shared/project-defaults.js";

export const VISUAL_DELTA_LOCAL_CONFIG_REL = ".visual-delta/config.local.json";
export const VISUAL_DELTA_CONFIG_SNAPSHOT_ENV = "VISUAL_DELTA_CONFIG_SNAPSHOT";
export type CaptureProfileConfiguration = {
  adapter: "docker" | "native" | "custom";
  snapshotDir?: string;
  runner?: string;
  defaults?: Partial<VisualDeltaProjectDefaults>;
  browsers?: VisualDeltaBrowser[];
};
export type CaptureConfiguration = {
  profile: string;
  profiles: Record<string, CaptureProfileConfiguration>;
  source: "environment" | "local" | "project" | "legacy" | "built-in";
};
type ConfigInput = Record<string, unknown>;
export type ConfigurationInputs = {
  project: ConfigInput;
  local: ConfigInput;
  captureConfiguration?: CaptureConfiguration;
};
const slug = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
function record(input: unknown, name: string): ConfigInput {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error(`${name} must be an object.`);
  return input as ConfigInput;
}
function read(root: string, file: string): ConfigInput {
  const absolute = path.join(root, file);
  return existsSync(absolute)
    ? record(JSON.parse(readFileSync(absolute, "utf8")), file)
    : {};
}
export function readConfigurationInputs(
  root: string,
  sharedOnly = false,
): ConfigurationInputs {
  const frozen = process.env[VISUAL_DELTA_CONFIG_SNAPSHOT_ENV];
  const inputs: ConfigurationInputs =
    frozen && !sharedOnly
      ? (JSON.parse(frozen) as ConfigurationInputs)
      : {
          project: read(root, ".visual-delta/config.json"),
          local:
            !sharedOnly &&
            !process.env.CI &&
            process.env.VISUAL_DELTA_NO_LOCAL_CONFIG !== "1"
              ? read(root, VISUAL_DELTA_LOCAL_CONFIG_REL)
              : {},
        };
  const allowed = new Set<string>([
    ...VISUAL_DELTA_PROJECT_DEFAULT_KEYS,
    "projectDefaults",
    "browsers",
    "capture",
  ]);
  for (const key of Object.keys(inputs.local))
    if (!allowed.has(key))
      throw new Error(
        `${VISUAL_DELTA_LOCAL_CONFIG_REL}: unsupported local setting ${key}.`,
      );
  return inputs;
}
function applyCapture(
  input: unknown,
  profiles: CaptureConfiguration["profiles"],
): string | undefined {
  if (input === undefined) return undefined;
  const capture = record(input, "capture");
  for (const key of Object.keys(capture))
    if (!["profile", "profiles"].includes(key))
      throw new Error(`Unknown capture setting ${key}.`);
  if (capture.profiles !== undefined) {
    for (const [name, inputProfile] of Object.entries(
      record(capture.profiles, "capture.profiles"),
    )) {
      if (!slug.test(name)) throw new Error(`Invalid capture profile ${name}.`);
      const profile = {
        ...profiles[name],
        ...record(inputProfile, `capture.profiles.${name}`),
      };
      for (const key of Object.keys(profile))
        if (
          ![
            "adapter",
            "runner",
            "snapshotDir",
            "defaults",
            "browsers",
          ].includes(key)
        )
          throw new Error(`Unknown capture profile setting ${key}.`);
      if (!["docker", "native", "custom"].includes(String(profile.adapter)))
        throw new Error(`Invalid adapter for capture profile ${name}.`);
      if (
        profile.snapshotDir !== undefined &&
        (typeof profile.snapshotDir !== "string" || !profile.snapshotDir.trim())
      )
        throw new Error(`Invalid snapshotDir for capture profile ${name}.`);
      if (
        profile.adapter === "custom" &&
        (typeof profile.runner !== "string" || !profile.runner.trim())
      )
        throw new Error(
          `Custom capture profile ${name} requires a runner module.`,
        );
      if (name === "docker" && profile.adapter !== "docker")
        throw new Error(
          "The docker profile is reserved; choose a named native or custom profile.",
        );
      if (
        profile.runner !== undefined &&
        (typeof profile.runner !== "string" || !profile.runner.trim())
      )
        throw new Error(`Invalid runner module for capture profile ${name}.`);
      if (profile.defaults !== undefined) {
        const validated = validateVisualDeltaProjectDefaults(profile.defaults, {
          rejectUnknown: true,
        });
        if (validated.errors.length)
          throw new Error(validated.errors.join(" "));
        profile.defaults = {
          ...profiles[name]?.defaults,
          ...Object.fromEntries(
            [...validated.present].map((key) => [key, validated.value[key]]),
          ),
        };
      }
      if (profile.browsers !== undefined) {
        const validated = validateVisualDeltaBrowsers(profile.browsers);
        if (validated.errors.length)
          throw new Error(validated.errors.join(" "));
        profile.browsers = validated.value;
      }
      profiles[name] = profile as CaptureProfileConfiguration;
    }
  }
  if (capture.profile === undefined) return undefined;
  if (typeof capture.profile !== "string" || !slug.test(capture.profile))
    throw new Error("Invalid capture profile identifier.");
  return capture.profile;
}
const activeCaptureConfigurations = new Map<string, CaptureConfiguration>();
export function pinCaptureConfiguration(root: string): void {
  if (!activeCaptureConfigurations.has(path.resolve(root)))
    activeCaptureConfigurations.set(
      path.resolve(root),
      readCaptureConfiguration(root),
    );
}
export function readCaptureConfiguration(root: string): CaptureConfiguration {
  const active = activeCaptureConfigurations.get(path.resolve(root));
  if (active) return active;
  const inputs = readConfigurationInputs(root);
  if (inputs.captureConfiguration) return inputs.captureConfiguration;
  const profiles: CaptureConfiguration["profiles"] = {
    docker: { adapter: "docker" },
    native: { adapter: "native" },
  };
  const shared = applyCapture(inputs.project.capture, profiles);
  const local = applyCapture(inputs.local.capture, profiles);
  const explicit = process.env.VISUAL_DELTA_CAPTURE_PROFILE;
  let profile = explicit ?? local ?? shared;
  let source: CaptureConfiguration["source"] =
    explicit !== undefined
      ? "environment"
      : local
        ? "local"
        : shared
          ? "project"
          : "built-in";
  if (!profile && existsSync(path.join(root, ".visual-delta/runner.mjs"))) {
    profile = "legacy";
    source = "legacy";
    profiles.legacy = { adapter: "custom", runner: ".visual-delta/runner.mjs" };
  }
  profile ??= "docker";
  if (!slug.test(profile) || !Object.hasOwn(profiles, profile))
    throw new Error(`Unknown capture profile ${JSON.stringify(profile)}.`);
  return { profile, profiles, source };
}
export {
  captureNamespace,
  captureSnapshotDir,
  logicalCaptureSnapshotDir,
  captureCacheDir,
} from "./capture-profile-paths.js";

export function validateCaptureConfigurationInput(input: unknown): void {
  const profiles: CaptureConfiguration["profiles"] = {
    docker: { adapter: "docker" },
    native: { adapter: "native" },
  };
  const selected = applyCapture(input, profiles);
  if (selected && !Object.hasOwn(profiles, selected))
    throw new Error(`Unknown capture profile ${selected}.`);
}
