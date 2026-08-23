import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { StoryIndexEntry } from "./snapshot-paths.js";
import { VISUAL_DELTA_CACHE_DIR_REL } from "./visual-artifacts.js";

export type StaticBuildReason =
  | "missing-index"
  | "incomplete-static"
  | "unskip"
  | "stale-source"
  | "stale-config"
  | "affected-plan"
  | "explicit-rebuild"
  | "reuse"
  | "skip-build-missing";

export type StaticBuildDecision = {
  shouldBuild: boolean;
  reason: StaticBuildReason;
  message: string;
};

export function isStorybookStaticComplete(packageRoot: string): boolean {
  const root = path.join(packageRoot, "storybook-static");
  return (
    existsSync(path.join(root, "index.json")) &&
    existsSync(path.join(root, "iframe.html"))
  );
}

function loadStoryEntries(packageRoot: string): StoryIndexEntry[] {
  const indexPath = path.join(packageRoot, "storybook-static", "index.json");
  if (!existsSync(indexPath)) return [];
  try {
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
      entries?: Record<string, StoryIndexEntry>;
    };
    return Object.values(index.entries ?? {}).filter(
      (entry) => entry.type === "story" || !entry.type,
    );
  } catch {
    return [];
  }
}

function mtime(filePath: string): number | null {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function resolveImportPath(
  packageRoot: string,
  importPath: string,
): string | null {
  const normalized = importPath.replace(/\\/g, "/").replace(/^\.\//, "");
  const absolute = path.resolve(packageRoot, normalized);
  return existsSync(absolute) ? absolute : null;
}

export function storySourcesNewerThanIndex(
  packageRoot: string,
  storyIdPrefix: string,
  storyIds?: string[],
): boolean {
  const indexPath = path.join(packageRoot, "storybook-static", "index.json");
  const indexMtime = mtime(indexPath);
  if (indexMtime == null) return false;
  const prefix = storyIdPrefix.trim();
  const exactIds = storyIds?.length ? new Set(storyIds) : undefined;
  const entries = loadStoryEntries(packageRoot).filter((entry) => {
    if (exactIds) return exactIds.has(entry.id);
    if (!prefix) return true;
    return entry.id === prefix || entry.id.startsWith(prefix);
  });
  return entries.some((entry) => {
    if (!entry.importPath) return false;
    const source = resolveImportPath(packageRoot, entry.importPath);
    const sourceMtime = source ? mtime(source) : null;
    return sourceMtime != null && sourceMtime > indexMtime;
  });
}

const STATIC_CONFIG_INPUTS = [
  ".visual-delta/config.json",
  ".storybook/main.ts",
  ".storybook/main.js",
  ".storybook/preview.ts",
  ".storybook/preview.js",
  "playwright.config.ts",
  "playwright.config.js",
  "package.json",
] as const;

export function staticConfigNewerThanIndex(packageRoot: string): boolean {
  const indexMtime = mtime(
    path.join(packageRoot, "storybook-static", "index.json"),
  );
  if (indexMtime == null) return false;
  return STATIC_CONFIG_INPUTS.some((relative) => {
    const inputMtime = mtime(path.join(packageRoot, relative));
    return inputMtime != null && inputMtime > indexMtime;
  });
}

/**
 * The Storybook stats file records the complete preview module graph. Checking
 * its project-local modules catches component/import changes that are newer
 * than the static index even when the colocated story file itself is unchanged.
 */
export function previewModulesNewerThanIndex(packageRoot: string): boolean {
  const indexMtime = mtime(
    path.join(packageRoot, "storybook-static", "index.json"),
  );
  if (indexMtime == null) return false;
  const statsPath = path.join(
    packageRoot,
    VISUAL_DELTA_CACHE_DIR_REL,
    "preview-stats.json",
  );
  if (!existsSync(statsPath)) return false;
  try {
    const stats = JSON.parse(readFileSync(statsPath, "utf8")) as {
      modules?: Array<{ id?: string; name?: string }>;
    };
    return (stats.modules ?? []).some((module) => {
      const raw = (module.id ?? module.name ?? "")
        .replace(/^\0/, "")
        .split(/[?#]/, 1)[0]
        ?.trim();
      if (!raw || raw.startsWith("virtual:")) return false;
      const absolute = path.isAbsolute(raw)
        ? raw
        : path.resolve(packageRoot, raw.replace(/^\.\//, ""));
      const relative = path.relative(packageRoot, absolute);
      if (relative.startsWith("../") || path.isAbsolute(relative)) return false;
      const moduleMtime = mtime(absolute);
      return moduleMtime != null && moduleMtime > indexMtime;
    });
  } catch {
    return false;
  }
}

type StaticFreshnessToken = { indexMtime: number; createdAt: number };
const freshBuilds = new Map<string, StaticFreshnessToken>();

export function markStorybookStaticFresh(packageRoot: string): void {
  const indexMtime = mtime(
    path.join(packageRoot, "storybook-static", "index.json"),
  );
  if (indexMtime == null) return;
  freshBuilds.set(path.resolve(packageRoot), {
    indexMtime,
    createdAt: Date.now(),
  });
}

export function invalidateStorybookStaticFreshness(packageRoot: string): void {
  freshBuilds.delete(path.resolve(packageRoot));
}

export function hasStorybookStaticFreshnessToken(packageRoot: string): boolean {
  const token = freshBuilds.get(path.resolve(packageRoot));
  if (!token) return false;
  const indexMtime = mtime(
    path.join(packageRoot, "storybook-static", "index.json"),
  );
  if (
    indexMtime !== token.indexMtime ||
    Date.now() - token.createdAt > 60_000
  ) {
    freshBuilds.delete(path.resolve(packageRoot));
    return false;
  }
  return true;
}

export function decideStorybookStaticBuild(options: {
  packageRoot: string;
  skipBuild: boolean;
  forceRebuild?: boolean;
  forceReason?: Extract<
    StaticBuildReason,
    "unskip" | "affected-plan" | "stale-config" | "explicit-rebuild"
  >;
  storyIdPrefix: string;
  storyIds?: string[];
}): StaticBuildDecision {
  const indexPath = path.join(
    options.packageRoot,
    "storybook-static",
    "index.json",
  );
  const indexExists = existsSync(indexPath);
  const complete = isStorybookStaticComplete(options.packageRoot);

  if (
    options.forceRebuild &&
    options.forceReason === "affected-plan" &&
    hasStorybookStaticFreshnessToken(options.packageRoot)
  ) {
    return {
      shouldBuild: false,
      reason: "reuse",
      message: "Using storybook-static refreshed by affected preflight",
    };
  }

  if (options.forceRebuild) {
    const reason = options.forceReason ?? "explicit-rebuild";
    const messages: Record<typeof reason, string> = {
      unskip:
        "Rebuilding storybook-static — skip-visual changed (index must refresh)",
      "affected-plan":
        "Rebuilding storybook-static — refreshing affected dependency graph",
      "stale-config":
        "Rebuilding storybook-static — Visual Delta configuration changed",
      "explicit-rebuild":
        "Rebuilding storybook-static — explicit rebuild requested",
    };
    return { shouldBuild: true, reason, message: messages[reason] };
  }

  if (!indexExists || !complete) {
    if (options.skipBuild) {
      return {
        shouldBuild: false,
        reason: "skip-build-missing",
        message: !indexExists
          ? "storybook-static/index.json missing — run `deno task build-storybook` once"
          : "storybook-static incomplete (missing iframe.html) — run `deno task build-storybook`",
      };
    }
    return {
      shouldBuild: true,
      reason: !indexExists ? "missing-index" : "incomplete-static",
      message: !indexExists
        ? "Building storybook-static — index.json missing"
        : "Rebuilding storybook-static — incomplete (missing iframe.html)",
    };
  }

  if (staticConfigNewerThanIndex(options.packageRoot)) {
    return {
      shouldBuild: true,
      reason: "stale-config",
      message: "Rebuilding storybook-static — static configuration is newer",
    };
  }
  if (previewModulesNewerThanIndex(options.packageRoot)) {
    return {
      shouldBuild: true,
      reason: "stale-source",
      message: "Rebuilding storybook-static — imported preview source newer",
    };
  }
  if (
    storySourcesNewerThanIndex(
      options.packageRoot,
      options.storyIdPrefix,
      options.storyIds,
    )
  ) {
    return {
      shouldBuild: true,
      reason: "stale-source",
      message: "Rebuilding storybook-static — story source newer than index",
    };
  }
  return {
    shouldBuild: false,
    reason: "reuse",
    message: "Using existing storybook-static",
  };
}

const inFlightBuilds = new Map<string, Promise<unknown>>();

/** Share one build promise across affected preflight and its following run. */
export async function runStaticBuildSingleFlight<T>(
  packageRoot: string,
  build: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(packageRoot);
  const existing = inFlightBuilds.get(key);
  if (existing) return existing as Promise<T>;
  const next = build().finally(() => {
    if (inFlightBuilds.get(key) === next) inFlightBuilds.delete(key);
  });
  inFlightBuilds.set(key, next);
  return next;
}
