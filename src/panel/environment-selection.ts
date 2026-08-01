import {
  DEFAULT_VISUAL_DELTA_BROWSERS,
  parseVisualBaselineEnvironment,
  visualDeltaBrowserLabel,
  type VisualBaselineEnvironment,
  type VisualDeltaBrowser,
} from "../shared/environments.js";

export const VISUAL_DELTA_ENVIRONMENT_STORAGE_KEY =
  "storybook-addon-visual-delta/environment";

export type VisualEnvironmentOption = {
  value: string;
  label: string;
  enabled: boolean;
};

export function platformLabel(platform: string): string {
  if (platform === "darwin") return "macOS";
  if (platform === "win32") return "Windows";
  if (platform === "linux") return "Linux";
  return platform;
}

export function discoverVisualEnvironments(options: {
  sources: readonly string[];
  configuredBrowsers?: readonly VisualDeltaBrowser[];
  runtimePlatform: string;
}): {
  browsers: VisualEnvironmentOption[];
  platforms: VisualEnvironmentOption[];
} {
  const configured = options.configuredBrowsers?.length
    ? [...options.configuredBrowsers]
    : [...DEFAULT_VISUAL_DELTA_BROWSERS];
  const discovered = options.sources
    .map(parseVisualBaselineEnvironment)
    .filter((value): value is VisualBaselineEnvironment => Boolean(value));
  const browsers = [
    ...new Set([
      ...configured,
      ...discovered.map((environment) => environment.browser),
    ]),
  ];
  const platforms = [
    ...new Set([
      options.runtimePlatform,
      ...discovered.map((environment) => environment.platform),
    ]),
  ];
  return {
    browsers: browsers.map((browser) => ({
      value: browser,
      label: `${visualDeltaBrowserLabel(browser)}${configured.includes(browser) ? "" : " (view only)"}`,
      enabled: configured.includes(browser),
    })),
    platforms: platforms.map((platform) => ({
      value: platform,
      label: `${platformLabel(platform)}${platform === options.runtimePlatform ? "" : " (view only)"}`,
      enabled: platform === options.runtimePlatform,
    })),
  };
}

export function sourceMatchesEnvironment(
  source: string,
  environment: VisualBaselineEnvironment,
): boolean {
  const parsed = parseVisualBaselineEnvironment(source);
  return (
    parsed?.browser === environment.browser &&
    parsed.platform === environment.platform
  );
}

export function loadVisualEnvironmentPreference(): Partial<VisualBaselineEnvironment> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(VISUAL_DELTA_ENVIRONMENT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<VisualBaselineEnvironment>) : {};
  } catch {
    return {};
  }
}

export function saveVisualEnvironmentPreference(
  environment: VisualBaselineEnvironment,
): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      VISUAL_DELTA_ENVIRONMENT_STORAGE_KEY,
      JSON.stringify(environment),
    );
  } catch {
    /* disposable presentation preference */
  }
}
