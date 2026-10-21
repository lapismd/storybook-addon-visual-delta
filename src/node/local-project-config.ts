import type { VisualDeltaProjectConfigResult } from "./project-config.js";
import {
  readCaptureConfiguration,
  readConfigurationInputs,
  type CaptureProfileConfiguration,
} from "./capture-configuration.js";
import { validateVisualDeltaProjectDefaults } from "../shared/project-defaults.js";
import { validateVisualDeltaBrowsers } from "../shared/environments.js";

export function overlayLocalProjectConfig(
  shared: VisualDeltaProjectConfigResult,
  local: Record<string, unknown>,
): VisualDeltaProjectConfigResult {
  const { capture: _capture, browsers, projectDefaults, ...flat } = local;
  const defaults = validateVisualDeltaProjectDefaults(projectDefaults ?? flat, {
    rejectUnknown: true,
  });
  const errors = [...defaults.errors];
  if (browsers !== undefined) {
    const validated = validateVisualDeltaBrowsers(browsers);
    errors.push(...validated.errors);
    if (!validated.errors.length) shared.browsers = validated.value;
  }
  for (const key of defaults.present) {
    Object.assign(shared.defaults, { [key]: defaults.value[key] });
    shared.sources[key] = "local";
  }
  if (errors.length)
    shared.diagnostics.push({
      code: "local-config-invalid",
      severity: "error",
      setting: ".visual-delta/config.local.json",
      message: errors.join(" "),
    });
  return shared;
}
export function sharedProjectWriteInput(
  root: string,
  input: unknown,
  shared: VisualDeltaProjectConfigResult,
): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const inputs = readConfigurationInputs(root);
  const record = { ...(input as Record<string, unknown>) };
  const local = inputs.local;
  const capture = readCaptureConfiguration(root);
  const profile = capture.profiles[capture.profile]!;
  const localDefaults = (local.projectDefaults ?? local) as Record<
    string,
    unknown
  >;
  const defaults = (record.projectDefaults ?? record) as Record<
    string,
    unknown
  >;
  for (const key of Object.keys(shared.defaults) as Array<
    keyof typeof shared.defaults
  >) {
    if (
      key in localDefaults &&
      JSON.stringify(defaults[key]) === JSON.stringify(localDefaults[key])
    )
      defaults[key] = shared.defaults[key];
  }
  for (const key of Object.keys(profile.defaults ?? {}) as Array<
    keyof typeof shared.defaults
  >) {
    if (
      JSON.stringify(defaults[key]) === JSON.stringify(profile.defaults?.[key])
    )
      defaults[key] = shared.defaults[key];
  }
  if (
    profile.browsers &&
    JSON.stringify(record.browsers) === JSON.stringify(profile.browsers)
  )
    record.browsers = shared.browsers;
  if (
    local.browsers &&
    JSON.stringify(record.browsers) === JSON.stringify(local.browsers)
  )
    record.browsers = shared.browsers;
  if (!Object.hasOwn(record, "capture") && inputs.project.capture !== undefined)
    record.capture = inputs.project.capture;
  return record;
}

export function overlayCaptureProfileConfig(
  shared: VisualDeltaProjectConfigResult,
  profile: CaptureProfileConfiguration,
): VisualDeltaProjectConfigResult {
  const defaults = validateVisualDeltaProjectDefaults(profile.defaults);
  for (const key of defaults.present) {
    Object.assign(shared.defaults, { [key]: defaults.value[key] });
    shared.sources[key] = "profile";
  }
  if (profile.browsers) shared.browsers = [...profile.browsers];
  return shared;
}
