import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { AffectedVisualSummary } from "../shared/affected-types.js";
import type {
  AffectedVisualTestsOptions,
  VisualDeltaHostOptions,
} from "./options.js";
import { resolveBaselinePathMode, resolveSnapshotDir } from "./options.js";
import { snapshotFileName, type StoryIndexEntry } from "./snapshot-paths.js";
import { readVisualDeltaProjectConfig } from "./project-config.js";

const CACHE_VERSION = 2;
const DEFAULT_CACHE_DIR = ".visual-delta/cache";
const CACHE_FILE_NAME = "affected-state-v1.json";
const STATS_FILE_NAME = "preview-stats.json";

const WALK_IGNORES = new Set([
  ".git",
  ".jj",
  ".cache",
  ".svelte-kit",
  ".turbo",
  "blob-report",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "storybook-static",
  "storybook-static-check",
  "test-results",
]);

const STORY_FILE_RE = /\.stories\.(?:[cm]?[jt]sx?|svelte|vue)$/i;
const PREVIEW_RE = /^\.storybook\/preview(?:\.[^/]+)?\.[cm]?[jt]sx?$/i;

type PreviewStatsReason = { moduleName?: string };
type PreviewStatsModule = {
  id?: string;
  name?: string;
  reasons?: PreviewStatsReason[];
};
type PreviewStats = { modules?: PreviewStatsModule[] };

type CachedStory = {
  importPath: string;
  dependencies: string[];
  renderFingerprint: string;
  fingerprint: string;
};

type AffectedCache = {
  version: 2;
  configFingerprint: string;
  inputHashes: Record<string, string>;
  stories: Record<string, CachedStory>;
  passingFingerprints: Record<string, string>;
  storyFiles: string[];
  updatedAt: string;
};

type GraphSnapshot = {
  configFingerprint: string;
  inputHashes: Record<string, string>;
  stories: Record<string, CachedStory>;
  storyFiles: string[];
  runnableStoryIds: string[];
  changedInputImporters: Map<string, Set<string>>;
  unsupportedReason?: string;
};

export type AffectedVisualPlan = {
  root: string;
  cacheDir: string;
  cachePath: string;
  statsPath: string;
  summary: AffectedVisualSummary;
  selectedStoryIds: string[];
  runnableStoryIds: string[];
  /** Affected changes require a fresh Storybook graph before capture. */
  needsRebuild: boolean;
};

export type RecordAffectedVisualResultsOptions = {
  root: string;
  hostOptions?: VisualDeltaHostOptions;
  /** Only successfully exercised story ids advance their passing fingerprint. */
  passedStoryIds: Iterable<string>;
};

function normalizeSlashes(value: string): string {
  return value.replaceAll("\\", "/");
}

function stripModuleQuery(value: string): string {
  return value.replace(/^\0/, "").split(/[?#]/, 1)[0] ?? value;
}

function relativeKey(root: string, absolutePath: string): string {
  const relative = normalizeSlashes(path.relative(root, absolutePath));
  return relative.startsWith("../") || path.isAbsolute(relative)
    ? `@absolute:${normalizeSlashes(absolutePath)}`
    : relative || ".";
}

function absoluteFromKey(root: string, key: string): string {
  return key.startsWith("@absolute:")
    ? key.slice("@absolute:".length)
    : path.resolve(root, key);
}

/** Normalize one Storybook stats module id to a project-relative path. */
export function normalizeStatsModuleId(
  value: string | undefined,
  root: string,
): string | undefined {
  const raw = stripModuleQuery(value?.trim() ?? "");
  if (!raw || raw.startsWith("virtual:") || raw.startsWith("/virtual:")) {
    return undefined;
  }
  if (raw.startsWith("./")) return normalizeSlashes(raw.slice(2));
  if (path.isAbsolute(raw)) {
    const relative = normalizeSlashes(path.relative(root, raw));
    if (!relative.startsWith("../") && !path.isAbsolute(relative)) {
      return relative;
    }
    return undefined;
  }
  const candidate = path.resolve(root, raw);
  if (existsSync(candidate)) return normalizeSlashes(raw);
  return undefined;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashFile(root: string, key: string): string {
  const filePath = absoluteFromKey(root, key);
  try {
    return sha256(readFileSync(filePath));
  } catch {
    return "<missing>";
  }
}

function fingerprintEntries(entries: Iterable<[string, string]>): string {
  return sha256(
    [...entries]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, hash]) => `${key}\0${hash}`)
      .join("\n"),
  );
}

function globToRegExp(glob: string): RegExp {
  const normalized = normalizeSlashes(glob.trim()).replace(/^\.\//, "");
  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]!;
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      const after = normalized[index + 2];
      source += after === "/" ? "(?:.*/)?" : ".*";
      index += after === "/" ? 2 : 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`);
}

export function matchesAffectedGlob(
  file: string,
  globs: readonly string[] | undefined,
): boolean {
  if (!globs?.length) return false;
  const normalized = normalizeSlashes(file).replace(/^\.\//, "");
  return globs.some(
    (glob) => glob.trim() && globToRegExp(glob).test(normalized),
  );
}

function walkFiles(directory: string, root = directory): string[] {
  if (!existsSync(directory)) return [];
  const out: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && WALK_IGNORES.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      const projectRelative = normalizeSlashes(path.relative(root, absolute));
      if (
        entry.isDirectory() &&
        (projectRelative === ".visual-delta/artifacts" ||
          projectRelative === ".visual-delta/cache")
      ) {
        continue;
      }
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) out.push(relativeKey(root, absolute));
    }
  };
  visit(directory);
  return out.sort();
}

function affectedOptions(
  hostOptions: VisualDeltaHostOptions | undefined,
): AffectedVisualTestsOptions {
  return hostOptions?.affectedTests === false
    ? {}
    : (hostOptions?.affectedTests ?? {});
}

function normalizedAffectedGlobs(globs: string[] | undefined): string[] {
  return [
    ...new Set((globs ?? []).map((glob) => glob.trim()).filter(Boolean)),
  ].sort();
}

function resolveCacheDir(
  root: string,
  hostOptions: VisualDeltaHostOptions | undefined,
): string {
  const configured = affectedOptions(hostOptions).cacheDir?.trim();
  return path.resolve(root, configured || DEFAULT_CACHE_DIR);
}

function readStoryIndex(root: string): StoryIndexEntry[] {
  const indexPath = path.join(root, "storybook-static", "index.json");
  const parsed = JSON.parse(readFileSync(indexPath, "utf8")) as {
    entries?: Record<string, StoryIndexEntry>;
  };
  return Object.values(parsed.entries ?? {})
    .filter(
      (entry) =>
        entry.type === "story" && !(entry.tags ?? []).includes("skip-visual"),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function readPreviewStats(statsPath: string): PreviewStatsModule[] {
  const parsed = JSON.parse(readFileSync(statsPath, "utf8")) as PreviewStats;
  if (!Array.isArray(parsed.modules)) {
    throw new Error("preview-stats.json has no modules array");
  }
  return parsed.modules;
}

function addEdge(
  graph: Map<string, Set<string>>,
  dependency: string,
  importer: string,
): void {
  const importers = graph.get(dependency) ?? new Set<string>();
  importers.add(importer);
  graph.set(dependency, importers);
}

function transitiveDependencies(
  storyFile: string,
  dependenciesByImporter: Map<string, Set<string>>,
): Set<string> {
  const seen = new Set<string>();
  const pending = [storyFile];
  while (pending.length) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const dependency of dependenciesByImporter.get(current) ?? []) {
      pending.push(dependency);
    }
  }
  return seen;
}

function reachesPreview(
  changedFile: string,
  importersByDependency: Map<string, Set<string>>,
): boolean {
  const seen = new Set<string>();
  const pending = [changedFile];
  while (pending.length) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    if (PREVIEW_RE.test(current)) return true;
    for (const importer of importersByDependency.get(current) ?? []) {
      pending.push(importer);
    }
  }
  return false;
}

function isInsideSnapshotDir(
  root: string,
  file: string,
  snapshotDir: string,
): boolean {
  const absolute = absoluteFromKey(root, file);
  const relative = path.relative(snapshotDir, absolute);
  return (
    relative === "" ||
    (!relative.startsWith("../") && !path.isAbsolute(relative))
  );
}

function isBuiltInGlobalInput(file: string): boolean {
  return (
    file.startsWith(".storybook/") ||
    file === ".visual-delta/config.json" ||
    file === ".visual-delta/runner.mjs" ||
    file === "package.json" ||
    file.endsWith("/package.json") ||
    /^(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/i.test(
      file,
    ) ||
    /^playwright(?:\.[^/]+)?\.config\.[cm]?[jt]s$/i.test(file) ||
    file.startsWith("tests/visual/") ||
    file.startsWith("scripts/ui-generator/visual/") ||
    file.startsWith("packages/storybook-addon-visual-delta/src/playwright/") ||
    file.startsWith("packages/storybook-addon-visual-delta/src/node/") ||
    file.startsWith("packages/storybook-addon-visual-delta/src/shared/") ||
    // Standalone sibling checkout / linked package realpath segments.
    /(^|\/)storybook-addon-visual-delta\/src\/(?:playwright|node|shared)\//.test(
      file,
    ) ||
    file.startsWith("src/playwright/") ||
    file.startsWith("src/node/") ||
    file.startsWith("src/shared/")
  );
}

function baselineFilesForStories(
  root: string,
  entries: StoryIndexEntry[],
  hostOptions: VisualDeltaHostOptions | undefined,
): Map<string, string[]> {
  const snapshotDir = resolveSnapshotDir(hostOptions, root);
  const files = walkFiles(snapshotDir, snapshotDir).filter((file) =>
    file.endsWith(".png"),
  );
  const mode = resolveBaselinePathMode(hostOptions);
  const byStory = new Map<string, string[]>();

  for (const entry of entries) {
    let primary: string;
    try {
      primary = normalizeSlashes(snapshotFileName(entry, mode));
    } catch {
      continue;
    }
    const directory = path.posix.dirname(primary);
    const fileName = path.posix.basename(primary);
    const stem = fileName.replace(/-(?:chromium|firefox|webkit)\.png$/i, "");
    const owned = files
      .filter((file) => {
        const normalized = normalizeSlashes(file);
        if (path.posix.dirname(normalized) !== directory) return false;
        const candidate = path.posix.basename(normalized);
        return (
          candidate === `${stem}.png` ||
          new RegExp(
            `^${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--[^/]+)?-(?:chromium|firefox|webkit)\\.png$`,
            "i",
          ).test(candidate)
        );
      })
      .map((file) => relativeKey(root, path.join(snapshotDir, file)));
    byStory.set(entry.id, owned);
  }
  return byStory;
}

function configFingerprint(
  root: string,
  hostOptions: VisualDeltaHostOptions | undefined,
): string {
  const options = affectedOptions(hostOptions);
  const project = readVisualDeltaProjectConfig(root);
  return sha256(
    JSON.stringify({
      baselinePathMode: resolveBaselinePathMode(hostOptions),
      cacheDir: options.cacheDir ?? null,
      externals: normalizedAffectedGlobs(options.externals),
      snapshotDir: hostOptions?.snapshotDir ?? null,
      untraced: normalizedAffectedGlobs(options.untraced),
      browsers: project.browsers,
      visualTestFailureMode: project.workflow.visualTestFailureMode,
    }),
  );
}

function buildGraphSnapshot(
  root: string,
  hostOptions: VisualDeltaHostOptions | undefined,
): GraphSnapshot {
  const cacheDir = resolveCacheDir(root, hostOptions);
  const statsPath = path.join(cacheDir, STATS_FILE_NAME);
  let entries: StoryIndexEntry[] = [];
  try {
    entries = readStoryIndex(root);
  } catch (error) {
    return {
      configFingerprint: configFingerprint(root, hostOptions),
      inputHashes: {},
      stories: {},
      storyFiles: [],
      runnableStoryIds: [],
      changedInputImporters: new Map(),
      unsupportedReason:
        error instanceof Error
          ? `Storybook index is missing or invalid: ${error.message}`
          : "Storybook index is missing or invalid",
    };
  }

  let modules: PreviewStatsModule[];
  try {
    modules = readPreviewStats(statsPath);
  } catch (error) {
    return {
      configFingerprint: configFingerprint(root, hostOptions),
      inputHashes: {},
      stories: {},
      storyFiles: entries.map((entry) =>
        normalizeSlashes(entry.importPath ?? ""),
      ),
      runnableStoryIds: entries.map((entry) => entry.id),
      changedInputImporters: new Map(),
      unsupportedReason:
        error instanceof Error
          ? `Dependency graph is missing or invalid: ${error.message}`
          : "Dependency graph is missing or invalid",
    };
  }

  const hasViteBuilder = modules.some((module) =>
    `${module.id ?? ""} ${module.name ?? ""}`.includes(
      "@storybook/builder-vite",
    ),
  );
  if (!hasViteBuilder) {
    return {
      configFingerprint: configFingerprint(root, hostOptions),
      inputHashes: {},
      stories: {},
      storyFiles: entries.map((entry) =>
        normalizeSlashes(entry.importPath ?? ""),
      ),
      runnableStoryIds: entries.map((entry) => entry.id),
      changedInputImporters: new Map(),
      unsupportedReason:
        "preview-stats.json is not from the supported Vite builder",
    };
  }

  const importersByDependency = new Map<string, Set<string>>();
  const dependenciesByImporter = new Map<string, Set<string>>();
  const moduleFiles = new Set<string>();
  for (const module of modules) {
    const dependency = normalizeStatsModuleId(module.id ?? module.name, root);
    if (!dependency) continue;
    moduleFiles.add(dependency);
    for (const reason of module.reasons ?? []) {
      const importer = normalizeStatsModuleId(reason.moduleName, root);
      if (!importer || importer === dependency) continue;
      addEdge(importersByDependency, dependency, importer);
      addEdge(dependenciesByImporter, importer, dependency);
    }
  }

  const untraced = normalizedAffectedGlobs(
    affectedOptions(hostOptions).untraced,
  );
  const baselines = baselineFilesForStories(root, entries, hostOptions);
  const stories: Record<string, CachedStory> = {};
  let unresolvedStory: string | undefined;
  for (const entry of entries) {
    const importPath = normalizeStatsModuleId(entry.importPath, root);
    if (!importPath || !moduleFiles.has(importPath)) {
      unresolvedStory ??= entry.id;
      continue;
    }
    const renderDependencies = [
      ...transitiveDependencies(importPath, dependenciesByImporter),
    ]
      .filter((file) => !matchesAffectedGlob(file, untraced))
      .sort();
    const dependencies = [
      ...renderDependencies,
      ...(baselines.get(entry.id) ?? []),
    ].sort();
    const hashes = dependencies.map(
      (file) => [file, hashFile(root, file)] as [string, string],
    );
    stories[entry.id] = {
      importPath,
      dependencies,
      renderFingerprint: fingerprintEntries([
        ["@story-id", sha256(entry.id)],
        ...renderDependencies.map(
          (file) => [file, hashFile(root, file)] as [string, string],
        ),
      ]),
      fingerprint: fingerprintEntries([
        ["@story-id", sha256(entry.id)],
        ...hashes,
      ]),
    };
  }

  const allFiles = walkFiles(root);
  const snapshotDir = resolveSnapshotDir(hostOptions, root);
  const externals = normalizedAffectedGlobs(
    affectedOptions(hostOptions).externals,
  );
  const previewDependencies = [...moduleFiles].filter((file) =>
    reachesPreview(file, importersByDependency),
  );
  const controlFiles = [
    ...new Set([
      ...allFiles.filter((file) => {
        if (matchesAffectedGlob(file, untraced)) return false;
        if (isInsideSnapshotDir(root, file, snapshotDir)) return false;
        return (
          isBuiltInGlobalInput(file) || matchesAffectedGlob(file, externals)
        );
      }),
      ...previewDependencies.filter(
        (file) => !matchesAffectedGlob(file, untraced),
      ),
    ]),
  ].sort();
  const storyFiles = allFiles.filter((file) => STORY_FILE_RE.test(file));
  const inputFiles = new Set<string>(controlFiles);
  for (const story of Object.values(stories)) {
    for (const dependency of story.dependencies) inputFiles.add(dependency);
  }
  const inputHashes = Object.fromEntries(
    [...inputFiles].sort().map((file) => [file, hashFile(root, file)] as const),
  );
  const globalFingerprint = fingerprintEntries(
    controlFiles.map(
      (file) => [file, inputHashes[file] ?? "<missing>"] as [string, string],
    ),
  );
  for (const [storyId, story] of Object.entries(stories)) {
    const baselineDependencies = new Set(baselines.get(storyId) ?? []);
    story.renderFingerprint = fingerprintEntries([
      ["@story-id", sha256(storyId)],
      ["@global", globalFingerprint],
      ...story.dependencies
        .filter((file) => !baselineDependencies.has(file))
        .map(
          (file) =>
            [file, inputHashes[file] ?? hashFile(root, file)] as [string, string],
        ),
    ]);
    story.fingerprint = fingerprintEntries([
      ["@render", story.renderFingerprint],
      ...story.dependencies.map(
        (file) =>
          [file, inputHashes[file] ?? hashFile(root, file)] as [string, string],
      ),
    ]);
  }

  return {
    configFingerprint: configFingerprint(root, hostOptions),
    inputHashes,
    stories,
    storyFiles,
    runnableStoryIds: entries.map((entry) => entry.id),
    changedInputImporters: importersByDependency,
    unsupportedReason: unresolvedStory
      ? `Story ${unresolvedStory} cannot be resolved in preview-stats.json`
      : undefined,
  };
}

function readCache(cachePath: string): {
  value?: AffectedCache;
  error?: string;
} {
  if (!existsSync(cachePath)) return { error: "Affected cache is missing" };
  try {
    const value = JSON.parse(readFileSync(cachePath, "utf8")) as AffectedCache;
    if (
      value.version !== CACHE_VERSION ||
      !value.inputHashes ||
      !value.stories ||
      !value.passingFingerprints
    ) {
      return { error: "Affected cache has an unsupported or invalid format" };
    }
    return { value };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `Affected cache is invalid: ${error.message}`
          : "Affected cache is invalid",
    };
  }
}

function changedInputs(
  previous: Record<string, string>,
  current: Record<string, string>,
): string[] {
  return [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .filter((file) => previous[file] !== current[file])
    .sort();
}

function globalFallbackReason(
  root: string,
  changed: string[],
  snapshot: GraphSnapshot,
  hostOptions: VisualDeltaHostOptions | undefined,
): string | undefined {
  const externals = normalizedAffectedGlobs(
    affectedOptions(hostOptions).externals,
  );
  const snapshotDir = resolveSnapshotDir(hostOptions, root);
  for (const file of changed) {
    // Baseline PNGs are explicitly mapped to their owning story.
    if (isInsideSnapshotDir(root, file, snapshotDir)) continue;
    if (matchesAffectedGlob(file, externals)) {
      return `Configured external changed: ${file}`;
    }
    if (isBuiltInGlobalInput(file)) {
      return `Global visual-test input changed: ${file}`;
    }
    if (reachesPreview(file, snapshot.changedInputImporters)) {
      return `Storybook preview dependency changed: ${file}`;
    }
  }
  return undefined;
}

function allSummary(
  selection: AffectedVisualSummary["selection"],
  storyIds: string[],
  fallbackReason?: string,
  changed: string[] = [],
): AffectedVisualSummary {
  return {
    selection,
    selected: storyIds.length,
    unchanged: 0,
    total: storyIds.length,
    noChange: !fallbackReason && storyIds.length === 0,
    ...(fallbackReason ? { fallbackReason } : {}),
    ...(changed.length ? { changedInputs: changed } : {}),
    storyIds,
  };
}

/**
 * Plan an affected run against the last passing local fingerprints.
 * This function never builds Storybook or launches Playwright.
 */
export function planAffectedVisualTests(
  root: string,
  hostOptions?: VisualDeltaHostOptions,
): AffectedVisualPlan {
  const resolvedRoot = path.resolve(root);
  const cacheDir = resolveCacheDir(resolvedRoot, hostOptions);
  const cachePath = path.join(cacheDir, CACHE_FILE_NAME);
  const statsPath = path.join(cacheDir, STATS_FILE_NAME);
  const snapshot = buildGraphSnapshot(resolvedRoot, hostOptions);
  const runnableStoryIds = snapshot.runnableStoryIds;
  const cached = readCache(cachePath);

  let fallbackReason = snapshot.unsupportedReason ?? cached.error;
  let changed: string[] = [];
  if (!fallbackReason && cached.value) {
    changed = changedInputs(cached.value.inputHashes, snapshot.inputHashes);
    if (cached.value.configFingerprint !== snapshot.configFingerprint) {
      fallbackReason = "Affected-test configuration changed";
    } else if (
      cached.value.storyFiles.join("\n") !== snapshot.storyFiles.join("\n")
    ) {
      const newStoryFile = snapshot.storyFiles.find(
        (file) => !cached.value!.storyFiles.includes(file),
      );
      if (
        newStoryFile &&
        !Object.values(snapshot.stories).some(
          (story) => story.importPath === newStoryFile,
        )
      ) {
        fallbackReason = `New story cannot be resolved: ${newStoryFile}`;
      }
    }
    fallbackReason ??= globalFallbackReason(
      resolvedRoot,
      changed,
      snapshot,
      hostOptions,
    );
  }

  if (fallbackReason) {
    return {
      root: resolvedRoot,
      cacheDir,
      cachePath,
      statsPath,
      summary: allSummary(
        "affected",
        runnableStoryIds,
        fallbackReason,
        changed,
      ),
      selectedStoryIds: runnableStoryIds,
      runnableStoryIds,
      needsRebuild: true,
    };
  }

  const passing = cached.value!.passingFingerprints;
  const selectedStoryIds = runnableStoryIds.filter(
    (storyId) =>
      !snapshot.stories[storyId] ||
      passing[storyId] !== snapshot.stories[storyId]!.fingerprint,
  );
  const unchanged = runnableStoryIds.length - selectedStoryIds.length;
  const noChange = selectedStoryIds.length === 0;
  return {
    root: resolvedRoot,
    cacheDir,
    cachePath,
    statsPath,
    summary: {
      selection: "affected",
      selected: selectedStoryIds.length,
      unchanged,
      total: runnableStoryIds.length,
      noChange,
      ...(changed.length ? { changedInputs: changed } : {}),
      storyIds: selectedStoryIds,
    },
    selectedStoryIds,
    runnableStoryIds,
    needsRebuild: !noChange,
  };
}

/** Build the full-run summary used by CLI and middleware. */
export function planAllVisualTests(
  root: string,
  hostOptions?: VisualDeltaHostOptions,
): AffectedVisualPlan {
  const resolvedRoot = path.resolve(root);
  const cacheDir = resolveCacheDir(resolvedRoot, hostOptions);
  const cachePath = path.join(cacheDir, CACHE_FILE_NAME);
  const statsPath = path.join(cacheDir, STATS_FILE_NAME);
  const snapshot = buildGraphSnapshot(resolvedRoot, hostOptions);
  const storyIds = snapshot.runnableStoryIds;
  return {
    root: resolvedRoot,
    cacheDir,
    cachePath,
    statsPath,
    summary: allSummary("all", storyIds),
    selectedStoryIds: storyIds,
    runnableStoryIds: storyIds,
    needsRebuild: false,
  };
}

/**
 * Advance only passing stories while refreshing the disposable graph snapshot.
 * Failed, skipped, and timed-out stories keep their previous passing hash.
 */
export function recordAffectedVisualResults({
  root,
  hostOptions,
  passedStoryIds,
}: RecordAffectedVisualResultsOptions): boolean {
  const resolvedRoot = path.resolve(root);
  const cacheDir = resolveCacheDir(resolvedRoot, hostOptions);
  const cachePath = path.join(cacheDir, CACHE_FILE_NAME);
  const snapshot = buildGraphSnapshot(resolvedRoot, hostOptions);
  if (snapshot.unsupportedReason) return false;

  const previous = readCache(cachePath).value;
  const passingFingerprints: Record<string, string> = {};
  for (const storyId of snapshot.runnableStoryIds) {
    const oldFingerprint = previous?.passingFingerprints[storyId];
    if (oldFingerprint) passingFingerprints[storyId] = oldFingerprint;
  }
  for (const storyId of new Set(passedStoryIds)) {
    const story = snapshot.stories[storyId];
    if (story) passingFingerprints[storyId] = story.fingerprint;
  }

  const state: AffectedCache = {
    version: CACHE_VERSION,
    configFingerprint: snapshot.configFingerprint,
    inputHashes: snapshot.inputHashes,
    stories: snapshot.stories,
    passingFingerprints,
    storyFiles: snapshot.storyFiles,
    updatedAt: new Date().toISOString(),
  };
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return true;
}

export const AFFECTED_VISUAL_CACHE_FILE = CACHE_FILE_NAME;
export const AFFECTED_VISUAL_STATS_FILE = STATS_FILE_NAME;

/** Current source/dependency fingerprint, excluding baselines and artifacts. */
export function visualRenderFingerprints(
  root: string,
  hostOptions?: VisualDeltaHostOptions,
): Record<string, string> {
  const snapshot = buildGraphSnapshot(path.resolve(root), hostOptions);
  if (snapshot.unsupportedReason) return {};
  return Object.fromEntries(
    Object.entries(snapshot.stories).map(([storyId, story]) => [
      storyId,
      story.renderFingerprint,
    ]),
  );
}
