export const VISUAL_DELTA_BROWSERS = [
  "chromium",
  "firefox",
  "webkit",
] as const;

export type VisualDeltaBrowser = (typeof VISUAL_DELTA_BROWSERS)[number];

/** Canonical baseline identity. Platform and architecture are capture provenance. */
export type VisualBaselineTarget = {
  browser: VisualDeltaBrowser;
};

/** @deprecated Capture provenance only; never use this type for baseline lookup. */
export type VisualBaselineEnvironment = {
  browser: VisualDeltaBrowser;
  platform: string;
};

export const DEFAULT_VISUAL_DELTA_BROWSERS: readonly VisualDeltaBrowser[] = [
  "chromium",
];

export function isVisualDeltaBrowser(
  value: unknown,
): value is VisualDeltaBrowser {
  return (
    typeof value === "string" &&
    (VISUAL_DELTA_BROWSERS as readonly string[]).includes(value)
  );
}

export function visualDeltaBrowserLabel(browser: VisualDeltaBrowser): string {
  if (browser === "firefox") return "Firefox";
  if (browser === "webkit") return "WebKit";
  return "Chromium";
}

export function validateVisualDeltaBrowsers(input: unknown): {
  value: VisualDeltaBrowser[];
  errors: string[];
} {
  if (input == null) {
    return { value: [...DEFAULT_VISUAL_DELTA_BROWSERS], errors: [] };
  }
  if (!Array.isArray(input) || input.length === 0) {
    return {
      value: [...DEFAULT_VISUAL_DELTA_BROWSERS],
      errors: ["browsers must be a non-empty array."],
    };
  }
  const errors: string[] = [];
  const value: VisualDeltaBrowser[] = [];
  for (const browser of input) {
    if (!isVisualDeltaBrowser(browser)) {
      errors.push(
        `Unsupported browser ${JSON.stringify(browser)}; use chromium, firefox, or webkit.`,
      );
      continue;
    }
    if (value.includes(browser)) {
      errors.push(`browsers must not contain duplicate ${browser} entries.`);
      continue;
    }
    value.push(browser);
  }
  return {
    value: value.length > 0 ? value : [...DEFAULT_VISUAL_DELTA_BROWSERS],
    errors,
  };
}

const TARGET_SUFFIX_RE =
  /-(chromium|firefox|webkit)(?=\.(?:actual\.|diff\.)?png(?:\?|$)|\.json(?:\?|$))/i;

const LEGACY_ENVIRONMENT_SUFFIX_RE =
  /-(chromium|firefox|webkit)-([a-z0-9]+)(?=\.(?:actual\.|diff\.)?png(?:\?|$)|\.json(?:\?|$))/i;

export function parseVisualBaselineTarget(
  value: string,
): VisualBaselineTarget | null {
  const match = value.match(TARGET_SUFFIX_RE);
  const browser = match?.[1]?.toLowerCase();
  return browser && isVisualDeltaBrowser(browser) ? { browser } : null;
}

export function withVisualBaselineTarget(
  value: string,
  target: VisualBaselineTarget,
): string {
  if (!isVisualDeltaBrowser(target.browser)) return value;
  if (TARGET_SUFFIX_RE.test(value)) {
    return value.replace(TARGET_SUFFIX_RE, `-${target.browser}`);
  }
  if (LEGACY_ENVIRONMENT_SUFFIX_RE.test(value)) {
    return value.replace(LEGACY_ENVIRONMENT_SUFFIX_RE, `-${target.browser}`);
  }
  return value;
}

export function visualBaselineTargetKey(target: VisualBaselineTarget): string {
  return target.browser;
}

/** Parse legacy platform-qualified names for migration inventory only. */
export function parseVisualBaselineEnvironment(
  value: string,
): VisualBaselineEnvironment | null {
  const match = value.match(LEGACY_ENVIRONMENT_SUFFIX_RE);
  const browser = match?.[1]?.toLowerCase();
  const platform = match?.[2]?.toLowerCase();
  return browser && isVisualDeltaBrowser(browser) && platform
    ? { browser, platform }
    : null;
}

export function withVisualBaselineEnvironment(
  value: string,
  environment: VisualBaselineEnvironment,
): string {
  if (!isVisualDeltaBrowser(environment.browser) || !environment.platform) {
    return value;
  }
  return value.replace(
    LEGACY_ENVIRONMENT_SUFFIX_RE,
    `-${environment.browser}-${environment.platform}`,
  );
}

export function visualBaselineEnvironmentKey(
  environment: VisualBaselineEnvironment,
): string {
  return `${environment.browser}:${environment.platform}`;
}
