import {
  DEFAULT_VISUAL_DELTA_BROWSERS,
  parseVisualBaselineTarget,
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
  availableBrowsers?: readonly VisualDeltaBrowser[];
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
      ...(options.availableBrowsers ?? []),
      ...discovered.map((environment) => environment.browser),
      ...options.sources
        .map((source) => parseVisualBaselineTarget(source)?.browser)
        .filter((browser): browser is VisualDeltaBrowser => Boolean(browser)),
    ]),
  ];
  return {
    browsers: browsers.map((browser) => ({
      value: browser,
      label: `${visualDeltaBrowserLabel(browser)}${configured.includes(browser) ? "" : " (view only)"}`,
      enabled: configured.includes(browser),
    })),
    platforms: [
      {
        value: "linux",
        label: "Linux · ARM64",
        enabled: true,
      },
    ],
  };
}

export function sourceMatchesEnvironment(
  source: string,
  environment: VisualBaselineEnvironment,
  declaredEnvironment?: VisualBaselineEnvironment,
): boolean {
  // A canonical filename is authoritative. Explicit metadata only identifies
  // non-canonical, story-wired demo assets and cannot override that suffix.
  const target = parseVisualBaselineTarget(source);
  if (target) return target.browser === environment.browser;
  const legacy = parseVisualBaselineEnvironment(source) ?? declaredEnvironment;
  return legacy?.browser === environment.browser;
}

/** Non-canonical teaching fixtures are exact compare targets, not write paths. */
export function baselineSourcesAllowMutation(
  sources: readonly string[],
): boolean {
  return sources.every((source) => Boolean(parseVisualBaselineTarget(source)));
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
