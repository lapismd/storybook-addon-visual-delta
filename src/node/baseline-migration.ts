import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseVisualBaselineEnvironment } from "../shared/environments.js";
import { DEFAULT_SNAPSHOT_DIR } from "./options.js";

export type VisualBaselineMigrationStatus =
  | "ready"
  | "recapture-required"
  | "collision";

export type VisualBaselineMigrationItem = {
  legacyPath: string;
  canonicalPath: string;
  browser: "chromium" | "firefox" | "webkit";
  platform: string;
  status: VisualBaselineMigrationStatus;
};

export type VisualBaselineMigrationPlan = {
  ok: true;
  root: string;
  snapshotDirs: string[];
  cacheDirs: string[];
  items: VisualBaselineMigrationItem[];
  canApply: boolean;
};

const DEFAULT_AFFECTED_CACHE_DIR = ".cache/visual-delta";

const LEGACY_SUFFIX_RE =
  /-(chromium|firefox|webkit)-([a-z0-9]+)(?=\.png$)/i;

function walkPngs(directory: string): string[] {
  const output: string[] = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (
        entry.isFile() &&
        entry.name.endsWith(".png") &&
        !/\.(?:actual|diff)\.png$/i.test(entry.name)
      ) {
        output.push(absolute);
      }
    }
  }
  return output.sort();
}

function canonicalPathForLegacy(filePath: string): string | null {
  return LEGACY_SUFFIX_RE.test(filePath)
    ? filePath.replace(LEGACY_SUFFIX_RE, (_match, browser) => `-${browser}`)
    : null;
}

export function planVisualBaselineMigration(options: {
  root?: string;
  snapshotDirs?: string[];
  cacheDirs?: string[];
} = {}): VisualBaselineMigrationPlan {
  const root = path.resolve(options.root ?? process.cwd());
  const snapshotDirs = (options.snapshotDirs?.length
    ? options.snapshotDirs
    : [DEFAULT_SNAPSHOT_DIR]
  ).map((directory) =>
    path.isAbsolute(directory) ? directory : path.join(root, directory),
  );
  const cacheDirs = (options.cacheDirs?.length
    ? options.cacheDirs
    : [DEFAULT_AFFECTED_CACHE_DIR]
  ).map((directory) =>
    path.resolve(path.isAbsolute(directory) ? directory : path.join(root, directory)),
  );
  for (const cacheDir of cacheDirs) {
    if (cacheDir === root || snapshotDirs.includes(cacheDir)) {
      throw new Error(`Unsafe affected cache directory: ${cacheDir}`);
    }
  }
  const initial = snapshotDirs.flatMap((snapshotDir) =>
    walkPngs(snapshotDir).flatMap((legacyPath) => {
      const environment = parseVisualBaselineEnvironment(legacyPath);
      const canonicalPath = canonicalPathForLegacy(legacyPath);
      if (!environment || !canonicalPath) return [];
      return [
        {
          legacyPath,
          canonicalPath,
          browser: environment.browser,
          platform: environment.platform,
          status: existsSync(canonicalPath)
            ? ("ready" as const)
            : ("recapture-required" as const),
        },
      ];
    }),
  );
  const groups = new Map<string, VisualBaselineMigrationItem[]>();
  for (const item of initial) {
    const group = groups.get(item.canonicalPath) ?? [];
    group.push(item);
    groups.set(item.canonicalPath, group);
  }
  const items = initial.map((item) => {
    const group = groups.get(item.canonicalPath) ?? [];
    return group.length > 1 && !existsSync(item.canonicalPath)
      ? { ...item, status: "collision" as const }
      : item;
  });
  return {
    ok: true,
    root,
    snapshotDirs,
    cacheDirs: [...new Set(cacheDirs)],
    items,
    canApply: items.every((item) => item.status === "ready"),
  };
}

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".svelte",
  ".vue",
  ".mdx",
  ".json",
]);

function walkSources(root: string, snapshotDirs: readonly string[]): string[] {
  const output: string[] = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === ".jj" ||
          entry.name === "dist" ||
          entry.name === "spec" ||
          snapshotDirs.some(
            (snapshotDir) =>
              absolute === snapshotDir ||
              absolute.startsWith(`${snapshotDir}${path.sep}`),
          )
        ) {
          continue;
        }
        pending.push(absolute);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        output.push(absolute);
      }
    }
  }
  return output;
}

export function applyVisualBaselineMigration(
  plan: VisualBaselineMigrationPlan,
  options: { approved: boolean },
): {
  removed: string[];
  updatedSources: string[];
  invalidatedCaches: string[];
} {
  if (!options.approved) {
    throw new Error("Baseline migration requires --approved.");
  }
  if (!plan.canApply) {
    const blocked = plan.items.filter((item) => item.status !== "ready");
    throw new Error(
      `Migration requires canonical ARM64 recapture or collision review for ${blocked.length} baseline(s).`,
    );
  }
  const replacements = new Map<string, string>();
  for (const item of plan.items) {
    replacements.set(
      path.basename(item.legacyPath),
      path.basename(item.canonicalPath),
    );
  }
  const updatedSources: string[] = [];
  for (const sourcePath of walkSources(plan.root, plan.snapshotDirs)) {
    const before = readFileSync(sourcePath, "utf8");
    let after = before;
    for (const [legacy, canonical] of replacements) {
      after = after.replaceAll(legacy, canonical);
    }
    if (after !== before) {
      writeFileSync(sourcePath, after, "utf8");
      updatedSources.push(path.relative(plan.root, sourcePath).replaceAll(path.sep, "/"));
    }
  }
  const removed: string[] = [];
  for (const item of plan.items) {
    const stem = item.legacyPath.replace(/\.png$/i, "");
    const canonicalStem = item.canonicalPath.replace(/\.png$/i, "");
    for (const candidate of [
      item.legacyPath,
      `${stem}.actual.png`,
      `${stem}.diff.png`,
      `${stem}.json`,
      `${canonicalStem}.actual.png`,
      `${canonicalStem}.diff.png`,
      `${canonicalStem}.json`,
    ]) {
      if (!existsSync(candidate)) continue;
      unlinkSync(candidate);
      removed.push(path.relative(plan.root, candidate).replaceAll(path.sep, "/"));
    }
  }
  const invalidatedCaches: string[] = [];
  for (const cacheDir of plan.cacheDirs) {
    if (!existsSync(cacheDir)) continue;
    rmSync(cacheDir, { recursive: true, force: true });
    invalidatedCaches.push(
      path.relative(plan.root, cacheDir).replaceAll(path.sep, "/"),
    );
  }
  return { removed, updatedSources, invalidatedCaches };
}
