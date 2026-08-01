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
  declaredEnvironments?: readonly (VisualBaselineEnvironment | undefined)[];
  availableEnvironments?: readonly VisualBaselineEnvironment[];
  configuredBrowsers?: readonly VisualDeltaBrowser[];
  runtimePlatform: string;
}): {
  browsers: VisualEnvironmentOption[];
  platforms: VisualEnvironmentOption[];
} {
  const configured = options.configuredBrowsers?.length
    ? [...options.configuredBrowsers]
    : [...DEFAULT_VISUAL_DELTA_BROWSERS];
  const declared = options.declaredEnvironments ?? [];
  const discovered = [
    ...(options.availableEnvironments ?? []),
    ...options.sources.map(
      (source, index) =>
        parseVisualBaselineEnvironment(source) ?? declared[index],
    ),
    ...declared.slice(options.sources.length),
  ].filter((value): value is VisualBaselineEnvironment => Boolean(value));
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
  declaredEnvironment?: VisualBaselineEnvironment,
): boolean {
  // A canonical filename is authoritative. Explicit metadata only identifies
  // non-canonical, story-wired demo assets and cannot override that suffix.
  const parsed = parseVisualBaselineEnvironment(source) ?? declaredEnvironment;
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
