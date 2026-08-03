import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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
import { CANONICAL_VISUAL_CAPTURE_PROFILE } from "../shared/capture-profile.js";

const CACHE_VERSION = 3;
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

type AffectedCacheV2 = {
  version: 2;
  configFingerprint: string;
  inputHashes: Record<string, string>;
  stories: Record<string, CachedStory>;
  passingFingerprints: Record<string, string>;
  storyFiles: string[];
  updatedAt: string;
};

type AffectedCache = {
  version: 3;
  configFingerprint: string;
  inputHashes: Record<string, string>;
  passingFingerprints: Record<string, string>;
  storyFiles: string[];
  updatedAt: string;
};

type ReadAffectedCache = AffectedCache | AffectedCacheV2;

type GraphSnapshot = {
  configFingerprint: string;
  inputHashes: Record<string, string>;
  stories: Record<string, CachedStory>;
  storyFiles: string[];
  runnableStoryIds: string[];
  changedInputImporters: Map<string, Set<string>>;
  buildFingerprint: string;
  /** Internal evidence used by focused one-read-per-input tests. */
  hashReadCounts: Record<string, number>;
  unsupportedReason?: string;
};

type SnapshotScope = ReadonlySet<string> | undefined;

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

const planSnapshots = new WeakMap<AffectedVisualPlan, GraphSnapshot>();

function retainPlanSnapshot(
  plan: AffectedVisualPlan,
  snapshot: GraphSnapshot,
): AffectedVisualPlan {
  planSnapshots.set(plan, snapshot);
  return plan;
}

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

function absoluteFromKey(
  root: string,
  key: string,
  snapshotDir?: string,
): string {
  if (key.startsWith("@snapshot:")) {
    return path.resolve(
      snapshotDir ?? resolveSnapshotDir(undefined, root),
      ...key.slice("@snapshot:".length).split("/"),
    );
  }
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

function createHashReader(root: string, snapshotDir: string): {
  hash: (key: string) => string;
  counts: Record<string, number>;
} {
  const memo = new Map<string, string>();
  const counts: Record<string, number> = {};
  return {
    counts,
    hash(key) {
      const cached = memo.get(key);
      if (cached != null) return cached;
      counts[key] = (counts[key] ?? 0) + 1;
      let value: string;
      try {
        value = sha256(readFileSync(absoluteFromKey(root, key, snapshotDir)));
      } catch {
        value = "<missing>";
      }
      memo.set(key, value);
      return value;
    },
  };
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
  if (file.startsWith("@snapshot:")) return true;
  const absolute = absoluteFromKey(root, file, snapshotDir);
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
      .map((file) => `@snapshot:${normalizeSlashes(file)}`);
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
      externals: normalizedAffectedGlobs(options.externals),
      untraced: normalizedAffectedGlobs(options.untraced),
      browsers: project.browsers,
      visualTestFailureMode: project.workflow.visualTestFailureMode,
    }),
  );
}

function legacyConfigFingerprintCandidates(
  root: string,
  hostOptions: VisualDeltaHostOptions | undefined,
): Set<string> {
  const options = affectedOptions(hostOptions);
  const project = readVisualDeltaProjectConfig(root);
  const snapshotAbsolute = resolveSnapshotDir(hostOptions, root);
  const snapshotRelative = normalizeSlashes(path.relative(root, snapshotAbsolute));
  const cacheAbsolute = resolveCacheDir(root, hostOptions);
  const cacheRelative = normalizeSlashes(path.relative(root, cacheAbsolute));
  const snapshotValues = new Set<string | null>([
    hostOptions?.snapshotDir ?? null,
    snapshotAbsolute,
    snapshotRelative,
    `/workspace/${snapshotRelative}`,
    "/workspace/.visual-delta/capture-inputs/snapshot-dir",
  ]);
  const cacheValues = new Set<string | null>([
    options.cacheDir ?? null,
    cacheAbsolute,
    cacheRelative,
    `/workspace/${cacheRelative}`,
  ]);
  const fingerprints = new Set<string>();
  for (const snapshotDir of snapshotValues) {
    for (const cacheDir of cacheValues) {
      fingerprints.add(
        sha256(
          JSON.stringify({
            baselinePathMode: resolveBaselinePathMode(hostOptions),
            cacheDir,
            externals: normalizedAffectedGlobs(options.externals),
            snapshotDir,
            untraced: normalizedAffectedGlobs(options.untraced),
            browsers: project.browsers,
            visualTestFailureMode: project.workflow.visualTestFailureMode,
          }),
        ),
      );
    }
  }
  return fingerprints;
}

function buildGraphSnapshot(
  root: string,
  hostOptions: VisualDeltaHostOptions | undefined,
  scope?: SnapshotScope,
): GraphSnapshot {
  const cacheDir = resolveCacheDir(root, hostOptions);
  const statsPath = path.join(cacheDir, STATS_FILE_NAME);
  const snapshotDir = resolveSnapshotDir(hostOptions, root);
  const hashReader = createHashReader(root, snapshotDir);
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
      buildFingerprint: "",
      hashReadCounts: hashReader.counts,
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
      buildFingerprint: "",
      hashReadCounts: hashReader.counts,
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
      buildFingerprint: "",
      hashReadCounts: hashReader.counts,
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
    if (scope && !scope.has(entry.id)) continue;
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
    stories[entry.id] = {
      importPath,
      dependencies,
      renderFingerprint: fingerprintEntries([
        ["@story-id", sha256(entry.id)],
        ...renderDependencies.map(
          (file) => [file, hashReader.hash(file)] as [string, string],
        ),
      ]),
      fingerprint: fingerprintEntries([
        ["@story-id", sha256(entry.id)],
        ...dependencies.map(
          (file) => [file, hashReader.hash(file)] as [string, string],
        ),
      ]),
    };
  }

  const allFiles = walkFiles(root);
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
    [...inputFiles]
      .sort()
      .map((file) => [file, hashReader.hash(file)] as const),
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
            [file, inputHashes[file] ?? hashReader.hash(file)] as [string, string],
        ),
    ]);
    story.fingerprint = fingerprintEntries([
      ["@render", story.renderFingerprint],
      ...story.dependencies.map(
        (file) =>
          [file, inputHashes[file] ?? hashReader.hash(file)] as [string, string],
      ),
    ]);
  }

  // The canonical build cache is keyed from authored inputs plus the logical
  // preview graph. Generated package `dist` files can appear in Vite stats, but
  // they are absent from a clean staged workspace until the build command runs.
  // Hashing those derived files made the pre-build and post-build keys differ,
  // so a verified build could never be restored on the next clean capture.
  const buildInputFiles = allFiles;
  const graphFingerprint = fingerprintEntries(
    [...importersByDependency.entries()].flatMap(([dependency, importers]) =>
      [...importers].map(
        (importer) =>
          [`${dependency}\0${importer}`, sha256("preview-edge")] as [string, string],
      ),
    ),
  );
  const buildFingerprint = fingerprintEntries([
    ["@schema", sha256("canonical-build-v1")],
    ["@profile", sha256(CANONICAL_VISUAL_CAPTURE_PROFILE.id)],
    ["@config", configFingerprint(root, hostOptions)],
    ["@preview-graph", graphFingerprint],
    ...buildInputFiles.map(
      (file) => [file, hashReader.hash(file)] as [string, string],
    ),
  ]);

  return {
    configFingerprint: configFingerprint(root, hostOptions),
    inputHashes,
    stories,
    storyFiles,
    runnableStoryIds: entries.map((entry) => entry.id),
    changedInputImporters: importersByDependency,
    buildFingerprint,
    hashReadCounts: hashReader.counts,
    unsupportedReason: unresolvedStory
      ? `Story ${unresolvedStory} cannot be resolved in preview-stats.json`
      : undefined,
  };
}

function readCache(cachePath: string): {
  value?: ReadAffectedCache;
  error?: string;
} {
  if (!existsSync(cachePath)) return { error: "Affected cache is missing" };
  try {
    const value = JSON.parse(readFileSync(cachePath, "utf8")) as ReadAffectedCache;
    if (
      (value.version !== 2 && value.version !== CACHE_VERSION) ||
      !value.inputHashes ||
      !value.passingFingerprints ||
      !Array.isArray(value.storyFiles) ||
      (value.version === 2 && !value.stories)
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

function revalidatedPassingFingerprints(
  cached: ReadAffectedCache | undefined,
  snapshot: GraphSnapshot,
  root: string,
  hostOptions: VisualDeltaHostOptions | undefined,
): Record<string, string> {
  if (!cached) return {};
  if (cached.version === CACHE_VERSION) {
    return cached.configFingerprint === snapshot.configFingerprint
      ? cached.passingFingerprints
      : {};
  }
  if (!legacyConfigFingerprintCandidates(root, hostOptions).has(cached.configFingerprint)) {
    return {};
  }

  // Version 2 fingerprints included physical baseline/cache identities. A pass
  // is retained only when its current logical render and baseline evidence is
  // byte-for-byte equivalent to the v2 story snapshot. Everything else stays
  // affected and is conservatively recaptured.
  const passing: Record<string, string> = {};
  for (const storyId of snapshot.runnableStoryIds) {
    const previousStory = cached.stories[storyId];
    const currentStory = snapshot.stories[storyId];
    const currentDependencyHashes = new Set(
      currentStory?.dependencies.map((file) => snapshot.inputHashes[file]),
    );
    if (
      previousStory &&
      currentStory &&
      cached.passingFingerprints[storyId] === previousStory.fingerprint &&
      previousStory.renderFingerprint === currentStory.renderFingerprint &&
      previousStory.dependencies.every((file) =>
        currentDependencyHashes.has(cached.inputHashes[file]),
      )
    ) {
      passing[storyId] = currentStory.fingerprint;
    }
  }
  return passing;
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
    changed = cached.value.version === CACHE_VERSION
      ? changedInputs(cached.value.inputHashes, snapshot.inputHashes)
      : [];
    if (
      cached.value.version === CACHE_VERSION &&
      cached.value.configFingerprint !== snapshot.configFingerprint
    ) {
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
    return retainPlanSnapshot({
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
      needsRebuild:
        runnableStoryIds.length === 0 ||
        fallbackReason.startsWith("New story cannot be resolved"),
    }, snapshot);
  }

  const passing = revalidatedPassingFingerprints(
    cached.value,
    snapshot,
    resolvedRoot,
    hostOptions,
  );
  const selectedStoryIds = runnableStoryIds.filter(
    (storyId) =>
      !snapshot.stories[storyId] ||
      passing[storyId] !== snapshot.stories[storyId]!.fingerprint,
  );
  const unchanged = runnableStoryIds.length - selectedStoryIds.length;
  const noChange = selectedStoryIds.length === 0;
  return retainPlanSnapshot({
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
  }, snapshot);
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
  return retainPlanSnapshot({
    root: resolvedRoot,
    cacheDir,
    cachePath,
    statsPath,
    summary: allSummary("all", storyIds),
    selectedStoryIds: storyIds,
    runnableStoryIds: storyIds,
    needsRebuild: false,
  }, snapshot);
}

/** Build an exact selected-story plan without calculating every story fingerprint. */
export function planExactVisualTests(
  root: string,
  storyIds: readonly string[],
  hostOptions?: VisualDeltaHostOptions,
): AffectedVisualPlan {
  const resolvedRoot = path.resolve(root);
  const requested = [...new Set(storyIds)];
  const snapshot = buildGraphSnapshot(
    resolvedRoot,
    hostOptions,
    new Set(requested),
  );
  const runnable = new Set(snapshot.runnableStoryIds);
  const selected = requested.filter((storyId) => runnable.has(storyId));
  const cacheDir = resolveCacheDir(resolvedRoot, hostOptions);
  const plan = {
    root: resolvedRoot,
    cacheDir,
    cachePath: path.join(cacheDir, CACHE_FILE_NAME),
    statsPath: path.join(cacheDir, STATS_FILE_NAME),
    summary: {
      selection: "selected" as const,
      selected: selected.length,
      unchanged: Math.max(0, snapshot.runnableStoryIds.length - selected.length),
      total: snapshot.runnableStoryIds.length,
      noChange: selected.length === 0,
      storyIds: selected,
    },
    selectedStoryIds: selected,
    runnableStoryIds: snapshot.runnableStoryIds,
    needsRebuild: false,
  } satisfies AffectedVisualPlan;
  return retainPlanSnapshot(plan, snapshot);
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

  return recordSnapshotResults({
    snapshot,
    cacheDir,
    cachePath,
    previous: readCache(cachePath).value,
    passedStoryIds,
    root: resolvedRoot,
    hostOptions,
  });
}

function recordSnapshotResults(options: {
  snapshot: GraphSnapshot;
  cacheDir: string;
  cachePath: string;
  previous?: ReadAffectedCache;
  passedStoryIds: Iterable<string>;
  root: string;
  hostOptions?: VisualDeltaHostOptions;
}): boolean {
  const { snapshot, cacheDir, cachePath } = options;
  const passingFingerprints: Record<string, string> = {};
  const previousPassing = revalidatedPassingFingerprints(
    options.previous,
    snapshot,
    options.root,
    options.hostOptions,
  );
  const scoped = Object.keys(snapshot.stories).length < snapshot.runnableStoryIds.length;
  for (const storyId of snapshot.runnableStoryIds) {
    const oldFingerprint =
      previousPassing[storyId] ??
      (scoped && options.previous?.version === CACHE_VERSION
        && options.previous.configFingerprint === snapshot.configFingerprint
        ? options.previous.passingFingerprints[storyId]
        : undefined);
    if (oldFingerprint) passingFingerprints[storyId] = oldFingerprint;
  }
  for (const storyId of new Set(options.passedStoryIds)) {
    const story = snapshot.stories[storyId];
    if (story) passingFingerprints[storyId] = story.fingerprint;
  }

  const state: AffectedCache = {
    version: CACHE_VERSION,
    configFingerprint: snapshot.configFingerprint,
    inputHashes:
      scoped && options.previous?.version === CACHE_VERSION
        ? { ...options.previous.inputHashes, ...snapshot.inputHashes }
        : snapshot.inputHashes,
    passingFingerprints,
    storyFiles: snapshot.storyFiles,
    updatedAt: new Date().toISOString(),
  };
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return true;
}

/** Reuse the exact planning snapshot instead of traversing the graph again. */
export function recordAffectedVisualResultsForPlan(
  plan: AffectedVisualPlan,
  passedStoryIds: Iterable<string>,
  hostOptions?: VisualDeltaHostOptions,
): boolean {
  const snapshot = planSnapshots.get(plan);
  if (!snapshot || snapshot.unsupportedReason) return false;
  return recordSnapshotResults({
    snapshot,
    cacheDir: plan.cacheDir,
    cachePath: plan.cachePath,
    previous: readCache(plan.cachePath).value,
    passedStoryIds,
    root: plan.root,
    hostOptions,
  });
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

/** Render fingerprints already calculated for a retained plan snapshot. */
export function visualRenderFingerprintsForPlan(
  plan: AffectedVisualPlan,
): Record<string, string> {
  const snapshot = planSnapshots.get(plan);
  if (!snapshot || snapshot.unsupportedReason) return {};
  return Object.fromEntries(
    Object.entries(snapshot.stories).map(([storyId, story]) => [
      storyId,
      story.renderFingerprint,
    ]),
  );
}

/** Logical source/profile input fingerprint for the canonical static cache. */
export function visualCanonicalBuildFingerprint(
  root: string,
  hostOptions?: VisualDeltaHostOptions,
): string | null {
  const snapshot = buildGraphSnapshot(path.resolve(root), hostOptions);
  return snapshot.unsupportedReason || !snapshot.buildFingerprint
    ? null
    : snapshot.buildFingerprint;
}

export function visualCanonicalBuildFingerprintForPlan(
  plan: AffectedVisualPlan,
): string | null {
  const snapshot = planSnapshots.get(plan);
  return snapshot?.unsupportedReason || !snapshot?.buildFingerprint
    ? null
    : snapshot.buildFingerprint;
}

/** Focused test evidence that one snapshot hashes each logical input once. */
export function visualHashReadCountsForPlan(
  plan: AffectedVisualPlan,
): Record<string, number> {
  return { ...(planSnapshots.get(plan)?.hashReadCounts ?? {}) };
}
