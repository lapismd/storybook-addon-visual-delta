import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  isVisualDiffSidecar,
  type VisualDiffSidecar,
} from "../visual-diff-sidecar.js";
import { validateVisualCaptureProfile } from "../shared/capture-profile.js";
import {
  parseVisualBaselineEnvironment,
  parseVisualBaselineTarget,
  VISUAL_DELTA_BROWSERS,
  type VisualDeltaBrowser,
} from "../shared/environments.js";
import type { VisualDeltaCaptureRunner } from "../runner/index.js";
import {
  LEGACY_VISUAL_DELTA_CACHE_REL,
  LEGACY_VISUAL_DELTA_CHANGE_SETS_CACHE_REL,
  migrateLegacyChangeSetCache,
  VISUAL_DELTA_CHANGE_SETS_CACHE_REL,
} from "./cache-paths.js";
import {
  resolveVisualDeltaCaptureRunner,
} from "./capture-runner.js";
import { inspectVisualDeltaOnboarding } from "./init-scaffold.js";
import {
  DEFAULT_BASELINE_PATH_MODE,
  DEFAULT_SNAPSHOT_DIR,
  resolveSnapshotDir,
  type BaselinePathMode,
  type VisualDeltaHostOptions,
} from "./options.js";
import { planVisualBaselineMigration } from "./baseline-migration.js";
import { readVisualDeltaProjectConfig } from "./project-config.js";
import { snapshotFileName, type StoryIndexEntry } from "./snapshot-paths.js";
import {
  decideStorybookStaticBuild,
  isStorybookStaticComplete,
} from "./static-build.js";
import {
  VISUAL_DELTA_ARTIFACT_DIR_REL,
  VISUAL_DELTA_CACHE_DIR_REL,
  visualArtifactPaths,
} from "./visual-artifacts.js";

const PACKAGE_NAME = "@lapismd/storybook-addon-visual-delta";
const DOCTOR_REPORT_VERSION = 1 as const;
const DEFAULT_CONFIG_DIR = ".storybook";
const HUMAN_PATH_LIMIT = 20;

export type VisualDeltaDoctorSeverity =
  | "pass"
  | "info"
  | "warning"
  | "error";

export type VisualDeltaDoctorCheck = {
  code: string;
  severity: VisualDeltaDoctorSeverity;
  message: string;
  paths?: string[];
  suggestion?: string;
  fixable?: boolean;
};

export type VisualDeltaDoctorInventoryKind =
  | "canonical-baseline"
  | "disabled-browser-baseline"
  | "legacy-platform-baseline"
  | "inactive-baseline"
  | "orphan-baseline"
  | "unverified-baseline"
  | "teaching-image"
  | "unrecognized-image"
  | "misplaced-derived"
  | "legacy-derived"
  | "unexpected-file"
  | "symlink";

export type VisualDeltaDoctorInventoryItem = {
  path: string;
  kind: VisualDeltaDoctorInventoryKind;
  severity: Exclude<VisualDeltaDoctorSeverity, "pass">;
  message: string;
  browser?: VisualDeltaBrowser;
  storyId?: string;
  fixable?: boolean;
  destination?: string;
};

export type VisualDeltaDoctorFix = {
  kind: "move-derived" | "quarantine" | "migrate-change-set-cache";
  status: "available" | "applied" | "skipped" | "failed";
  sources: string[];
  destinations?: string[];
  reason: string;
  error?: string;
};

export type VisualDeltaDoctorReport = {
  version: typeof DOCTOR_REPORT_VERSION;
  ok: boolean;
  root: string;
  resolved: {
    configDir: string;
    hostRoot: string;
    snapshotDir: string;
    baselinePathMode: BaselinePathMode;
    browsers: VisualDeltaBrowser[];
    indexFresh: boolean;
    runner?: { id: string; kind: "docker" | "custom" };
  };
  summary: {
    pass: number;
    info: number;
    warning: number;
    error: number;
    files: number;
  };
  checks: VisualDeltaDoctorCheck[];
  inventory: VisualDeltaDoctorInventoryItem[];
  fixes: VisualDeltaDoctorFix[];
};

export type VisualDeltaDoctorOptions = {
  root?: string;
  configDir?: string;
  snapshotDir?: string;
  baselinePathMode?: BaselinePathMode;
  runner?: boolean;
  build?: boolean;
  fix?: boolean;
  strict?: boolean;
  json?: boolean;
  verbose?: boolean;
};

type StorybookMainConfig = {
  addons?: Array<
    | string
    | {
        name?: string;
        options?: unknown;
      }
  >;
  framework?: string | { name?: string };
};

export type VisualDeltaDoctorDependencies = {
  loadMainConfig?: (options: {
    configDir: string;
    cwd: string;
    skipCache: boolean;
  }) => Promise<StorybookMainConfig>;
  resolveRunner?: (root: string) => Promise<VisualDeltaCaptureRunner>;
  runBuild?: (root: string, quiet: boolean) => void;
  now?: () => Date;
  randomId?: () => string;
};

type WalkedEntry = {
  absolute: string;
  relative: string;
  kind: "file" | "symlink";
};

type PlannedMove = { source: string; destination: string };

type PlannedRepair = {
  kind: VisualDeltaDoctorFix["kind"];
  reason: string;
  sources: string[];
  moves?: PlannedMove[];
  quarantine?: Array<{
    source: string;
    namespace: "snapshot" | "legacy-cache";
    relative: string;
  }>;
};

type Inspection = {
  report: VisualDeltaDoctorReport;
  repairs: PlannedRepair[];
};

type StoryOwner = {
  storyId: string;
  skipped: boolean;
};

type Ownership = {
  exact: Map<string, StoryOwner>;
  references: Map<string, StoryOwner>;
  candidates: Array<{
    directory: string;
    stem: string;
    browser: VisualDeltaBrowser;
    owner: StoryOwner;
  }>;
};

function normalizeRelative(value: string): string {
  return value.replaceAll(path.sep, "/").replace(/^\.\//, "");
}

function isInside(directory: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(directory), path.resolve(candidate));
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

function displayPath(root: string, candidate: string): string {
  return isInside(root, candidate)
    ? normalizeRelative(path.relative(root, candidate)) || "."
    : path.resolve(candidate);
}

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function walkFiles(directory: string): WalkedEntry[] {
  const output: WalkedEntry[] = [];
  if (!existsSync(directory)) return output;
  const pending = [path.resolve(directory)];
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
      const relative = normalizeRelative(path.relative(directory, absolute));
      if (entry.isSymbolicLink()) {
        output.push({ absolute, relative, kind: "symlink" });
      } else if (entry.isDirectory()) {
        pending.push(absolute);
      } else if (entry.isFile()) {
        output.push({ absolute, relative, kind: "file" });
      }
    }
  }
  return output.sort((left, right) => left.relative.localeCompare(right.relative));
}

function readJson(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function hostOptionsFromAddon(
  addon: NonNullable<StorybookMainConfig["addons"]>[number],
):
  | VisualDeltaHostOptions
  | undefined {
  if (typeof addon === "string" || !addon?.options) return undefined;
  if (typeof addon.options !== "object" || Array.isArray(addon.options)) {
    return undefined;
  }
  const options = addon.options as Record<string, unknown>;
  const direct = options.visualDelta;
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as VisualDeltaHostOptions;
  }
  const nested = options.options;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const visualDelta = (nested as Record<string, unknown>).visualDelta;
    if (
      visualDelta &&
      typeof visualDelta === "object" &&
      !Array.isArray(visualDelta)
    ) {
      return visualDelta as VisualDeltaHostOptions;
    }
  }
  return undefined;
}

function isVisualDeltaAddon(
  addon: NonNullable<StorybookMainConfig["addons"]>[number],
): boolean {
  const name = typeof addon === "string" ? addon : addon.name ?? "";
  return (
    name === PACKAGE_NAME ||
    name.includes("storybook-addon-visual-delta") ||
    hostOptionsFromAddon(addon) !== undefined
  );
}

async function defaultLoadMainConfig(options: {
  configDir: string;
  cwd: string;
  skipCache: boolean;
}): Promise<StorybookMainConfig> {
  const storybook = (await import("storybook/internal/common")) as {
    loadMainConfig: (
      input: typeof options,
    ) => Promise<StorybookMainConfig>;
  };
  return storybook.loadMainConfig(options);
}

function defaultRunBuild(root: string, quiet: boolean): void {
  execFileSync("deno", ["task", "build-storybook"], {
    cwd: root,
    stdio: quiet ? "pipe" : "inherit",
  });
}

function addCheck(
  checks: VisualDeltaDoctorCheck[],
  check: VisualDeltaDoctorCheck,
): void {
  checks.push(check);
}

function projectPackage(root: string): {
  path: string;
  value: Record<string, unknown> | null;
} {
  const packagePath = path.join(root, "package.json");
  const parsed = readJson(packagePath);
  return {
    path: packagePath,
    value:
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null,
  };
}

function checkDependencies(
  root: string,
  pkg: Record<string, unknown>,
  checks: VisualDeltaDoctorCheck[],
): void {
  const require = createRequire(path.join(root, "package.json"));
  const required = ["storybook", "react", "playwright", "vite"];
  if (pkg.name !== PACKAGE_NAME) required.unshift(PACKAGE_NAME);
  const missing = required.filter((dependency) => {
    try {
      require.resolve(dependency === "storybook" ? "storybook/package.json" : dependency);
      return false;
    } catch {
      return true;
    }
  });
  addCheck(checks, {
    code: "dependencies",
    severity: missing.length ? "error" : "pass",
    message: missing.length
      ? `Required packages are not resolvable: ${missing.join(", ")}.`
      : "Visual Delta, Storybook, React, Playwright, and Vite are resolvable.",
    suggestion: missing.length
      ? "Install the missing peer dependencies in this Storybook project."
      : undefined,
  });
}

function checkScripts(
  pkg: Record<string, unknown>,
  checks: VisualDeltaDoctorCheck[],
): void {
  const scripts =
    pkg.scripts && typeof pkg.scripts === "object" && !Array.isArray(pkg.scripts)
      ? (pkg.scripts as Record<string, unknown>)
      : {};
  const missing = ["test:visual", "test:visual:affected", "build-storybook"].filter(
    (name) => typeof scripts[name] !== "string" || !scripts[name],
  );
  addCheck(checks, {
    code: "package-scripts",
    severity: missing.length ? "warning" : "pass",
    message: missing.length
      ? `Recommended package scripts are missing: ${missing.join(", ")}.`
      : "Visual test and Storybook build scripts are present.",
    suggestion: missing.length ? "Run visual-delta init to add missing scripts." : undefined,
  });
  const build = typeof scripts["build-storybook"] === "string"
    ? scripts["build-storybook"]
    : "";
  if (build && !build.includes(".visual-delta/cache")) {
    addCheck(checks, {
      code: "storybook-stats",
      severity: "warning",
      message: "The Storybook build script does not visibly emit preview stats into .visual-delta/cache.",
      suggestion:
        "Ensure build-storybook uses --stats-json .visual-delta/cache so affected selection has a current graph.",
    });
  }
}

function checkOnboarding(
  root: string,
  snapshotDir: string,
  checks: VisualDeltaDoctorCheck[],
): void {
  const onboarding = inspectVisualDeltaOnboarding(root, snapshotDir);
  addCheck(checks, {
    code: "playwright-suite",
    severity: onboarding.suiteReady ? "pass" : "error",
    message: onboarding.suiteReady
      ? "The portable Visual Delta Playwright suite is present."
      : onboarding.hint,
    paths: onboarding.suiteReady
      ? undefined
      : [displayPath(root, onboarding.suitePath)],
  });
  addCheck(checks, {
    code: "playwright-config",
    severity: onboarding.playwrightConfigReady ? "pass" : "error",
    message: onboarding.playwrightConfigReady
      ? "The portable Playwright configuration is present."
      : onboarding.hint,
    paths: onboarding.playwrightConfigReady
      ? undefined
      : [displayPath(root, onboarding.playwrightConfigPath)],
  });
  if (onboarding.suiteReady) {
    const source = readFileSync(onboarding.suitePath, "utf8");
    if (!source.includes("defineVisualSuite")) {
      addCheck(checks, {
        code: "playwright-suite-helper",
        severity: "warning",
        message: "The visual suite does not visibly call defineVisualSuite().",
        paths: [displayPath(root, onboarding.suitePath)],
        suggestion: "Verify that this file invokes the packaged Visual Delta suite.",
      });
    }
  }
  if (onboarding.playwrightConfigReady) {
    const source = readFileSync(onboarding.playwrightConfigPath, "utf8");
    if (!source.includes("defineVisualPlaywrightConfig")) {
      addCheck(checks, {
        code: "playwright-config-helper",
        severity: "warning",
        message:
          "The Playwright config does not visibly call defineVisualPlaywrightConfig().",
        paths: [displayPath(root, onboarding.playwrightConfigPath)],
        suggestion:
          "Verify that the configured Playwright projects retain the Visual Delta defaults.",
      });
    }
  }
}

function checkIgnorePolicy(root: string, checks: VisualDeltaDoctorCheck[]): void {
  const ignorePath = path.join(root, ".gitignore");
  const lines = existsSync(ignorePath)
    ? readFileSync(ignorePath, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
    : [];
  const broad = lines.some((line) =>
    [".visual-delta", ".visual-delta/", "/.visual-delta", "/.visual-delta/"].includes(
      line,
    ),
  );
  if (broad) {
    addCheck(checks, {
      code: "visual-delta-ignore-broad",
      severity: "warning",
      message: "The whole .visual-delta directory is ignored.",
      paths: [displayPath(root, ignorePath)],
      suggestion:
        "Ignore only .visual-delta/artifacts/ and .visual-delta/cache/ so config.json and runner.mjs remain trackable.",
    });
    return;
  }
  const missing = [
    `${VISUAL_DELTA_ARTIFACT_DIR_REL}/`,
    `${VISUAL_DELTA_CACHE_DIR_REL}/`,
  ].filter((expected) => !lines.includes(expected));
  addCheck(checks, {
    code: "visual-delta-ignore",
    severity: missing.length ? "info" : "pass",
    message: missing.length
      ? `Derived roots are not explicitly ignored: ${missing.join(", ")}.`
      : "Derived artifact and cache roots are independently ignored.",
    suggestion: missing.length
      ? "Ignore these roots unless the repository intentionally caches or commits them."
      : undefined,
  });
}

function readStaticEntries(root: string): StoryIndexEntry[] {
  const parsed = readJson(path.join(root, "storybook-static/index.json"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const entries = (parsed as { entries?: unknown }).entries;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) return [];
  return Object.values(entries as Record<string, StoryIndexEntry>).filter(
    (entry) => entry.type === "story" || !entry.type,
  );
}

function sourceBaselineReferences(root: string, entry: StoryIndexEntry): string[] {
  if (!entry.importPath) return [];
  const sourcePath = path.resolve(root, entry.importPath.replace(/^\.\//, ""));
  if (!isInside(root, sourcePath) || !existsSync(sourcePath)) return [];
  let source: string;
  try {
    source = readFileSync(sourcePath, "utf8");
  } catch {
    return [];
  }
  const output: string[] = [];
  const pattern = /\/visual-baselines\/([^\s"'`)]+?\.png)(?:[?#][^\s"'`)]*)?/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1]) output.push(normalizeRelative(match[1]));
  }
  return [...new Set(output)];
}

function buildOwnership(
  root: string,
  entries: StoryIndexEntry[],
  mode: BaselinePathMode,
): Ownership {
  const exact = new Map<string, StoryOwner>();
  const references = new Map<string, StoryOwner>();
  const candidates: Ownership["candidates"] = [];
  for (const entry of entries) {
    const owner = {
      storyId: entry.id,
      skipped: (entry.tags ?? []).includes("skip-visual"),
    };
    for (const reference of sourceBaselineReferences(root, entry)) {
      references.set(reference, owner);
    }
    for (const browser of VISUAL_DELTA_BROWSERS) {
      try {
        const primary = normalizeRelative(snapshotFileName(entry, mode, browser));
        exact.set(primary, owner);
        const filename = path.posix.basename(primary);
        candidates.push({
          directory: path.posix.dirname(primary),
          stem: filename.replace(new RegExp(`-${browser}\\.png$`, "i"), ""),
          browser,
          owner,
        });
      } catch {
        // A malformed entry cannot own a baseline path.
      }
    }
  }
  return { exact, references, candidates };
}

function baselineOwner(
  relative: string,
  browser: VisualDeltaBrowser,
  ownership: Ownership,
): { owner?: StoryOwner; exact: boolean; referenced: boolean } {
  const direct = ownership.exact.get(relative);
  const referenced = ownership.references.get(relative);
  if (direct) return { owner: direct, exact: true, referenced: Boolean(referenced) };
  if (referenced) return { owner: referenced, exact: false, referenced: true };
  const directory = path.posix.dirname(relative);
  const filename = path.posix.basename(relative);
  const candidate = ownership.candidates.find(
    (value) =>
      value.browser === browser &&
      value.directory === directory &&
      filename.startsWith(`${value.stem}--`) &&
      filename.endsWith(`-${browser}.png`),
  );
  return { owner: candidate?.owner, exact: false, referenced: false };
}

function movableVersion4(
  sidecar: VisualDiffSidecar | null,
  expectedActual: string,
  expectedDiff: string,
): sidecar is VisualDiffSidecar & { version: 4 } {
  return Boolean(
    sidecar?.version === 4 &&
      sidecar.runnerStatus &&
      sidecar.outcome &&
      sidecar.operationId &&
      sidecar.baselineHash &&
      sidecar.actualHash &&
      sidecar.captureConfigHash &&
      sidecar.actualRel === expectedActual &&
      sidecar.diffRel === expectedDiff,
  );
}

function inventoryMessage(kind: VisualDeltaDoctorInventoryKind): string {
  const messages: Record<VisualDeltaDoctorInventoryKind, string> = {
    "canonical-baseline": "Canonical baseline",
    "disabled-browser-baseline": "Baseline for a currently disabled browser",
    "legacy-platform-baseline": "Legacy platform-qualified baseline",
    "inactive-baseline": "Baseline owned by a skipped story",
    "orphan-baseline": "Baseline is not owned by the current Storybook index",
    "unverified-baseline": "Baseline ownership could not be proven",
    "teaching-image": "Explicitly referenced non-canonical teaching image",
    "unrecognized-image": "PNG does not use a canonical browser filename",
    "misplaced-derived": "Derived comparison artifact is inside snapshotDir",
    "legacy-derived": "Legacy or incomplete comparison artifact is inside snapshotDir",
    "unexpected-file": "Unexpected non-baseline file inside snapshotDir",
    symlink: "Symbolic links are not followed inside snapshotDir",
  };
  return messages[kind];
}

function groupInventoryChecks(
  inventory: VisualDeltaDoctorInventoryItem[],
  checks: VisualDeltaDoctorCheck[],
  indexFresh: boolean,
): void {
  const groups = new Map<VisualDeltaDoctorInventoryKind, VisualDeltaDoctorInventoryItem[]>();
  for (const item of inventory) {
    const group = groups.get(item.kind) ?? [];
    group.push(item);
    groups.set(item.kind, group);
  }
  for (const [kind, items] of groups) {
    if (kind === "canonical-baseline") continue;
    const severity = items.some((item) => item.severity === "error")
      ? "error"
      : items.some((item) => item.severity === "warning")
        ? "warning"
        : "info";
    const suggestions: Partial<Record<VisualDeltaDoctorInventoryKind, string>> = {
      "legacy-platform-baseline":
        "Run visual-delta migrate-baselines --dry-run and recapture any canonical targets before approved migration.",
      "inactive-baseline": "Review whether skipped-story baselines should remain committed.",
      "orphan-baseline": "Review these files before removing them from version control.",
      "unverified-baseline": indexFresh
        ? "Verify dynamic mode or interaction wiring before cleanup."
        : "Run visual-delta doctor --build for authoritative ownership analysis.",
      "unrecognized-image":
        "Wire deliberate teaching images explicitly or rename canonical baselines through the approved migration flow.",
      "misplaced-derived": "Run visual-delta doctor --fix to move valid v4 evidence.",
      "legacy-derived": "Run visual-delta doctor --fix to quarantine obsolete evidence.",
      "unexpected-file": "Move unrelated files out of the snapshot directory.",
      symlink: "Replace links with files inside the configured snapshot directory.",
    };
    addCheck(checks, {
      code: `snapshot-${kind}`,
      severity,
      message: `${inventoryMessage(kind)}: ${items.length}.`,
      paths: items.map((item) => item.path),
      suggestion: suggestions[kind],
      fixable: items.some((item) => item.fixable),
    });
  }
  const baselines = inventory.filter((item) =>
    [
      "canonical-baseline",
      "disabled-browser-baseline",
      "legacy-platform-baseline",
      "inactive-baseline",
      "orphan-baseline",
      "unverified-baseline",
      "teaching-image",
      "unrecognized-image",
    ].includes(item.kind),
  );
  addCheck(checks, {
    code: "snapshot-inventory",
    severity: "pass",
    message: `Inventoried ${baselines.length} baseline or image file${baselines.length === 1 ? "" : "s"}.`,
  });
}

function relativeStem(relative: string): string | null {
  if (/\.actual\.png$/i.test(relative)) {
    return relative.replace(/\.actual\.png$/i, "");
  }
  if (/\.diff\.png$/i.test(relative)) {
    return relative.replace(/\.diff\.png$/i, "");
  }
  if (/\.result\.json$/i.test(relative)) {
    return relative.replace(/\.result\.json$/i, "");
  }
  return null;
}

function inspectSnapshot(options: {
  root: string;
  snapshotDir: string;
  pathMode: BaselinePathMode;
  browsers: VisualDeltaBrowser[];
  entries: StoryIndexEntry[];
  indexFresh: boolean;
}): {
  inventory: VisualDeltaDoctorInventoryItem[];
  repairs: PlannedRepair[];
} {
  const inventory: VisualDeltaDoctorInventoryItem[] = [];
  const repairs: PlannedRepair[] = [];
  const files = walkFiles(options.snapshotDir);
  const fileByRelative = new Map(
    files.filter((entry) => entry.kind === "file").map((entry) => [entry.relative, entry]),
  );
  const ownership = buildOwnership(options.root, options.entries, options.pathMode);
  const derived = new Set<string>();
  const groups = new Map<
    string,
    {
      actual?: WalkedEntry;
      diff?: WalkedEntry;
      result?: WalkedEntry;
      legacy?: WalkedEntry;
      sidecar: VisualDiffSidecar | null;
    }
  >();

  for (const entry of files) {
    if (entry.kind === "symlink") {
      inventory.push({
        path: entry.relative,
        kind: "symlink",
        severity: "warning",
        message: inventoryMessage("symlink"),
      });
      continue;
    }
    const stem = relativeStem(entry.relative);
    if (stem) {
      const group = groups.get(stem) ?? { sidecar: null };
      if (/\.actual\.png$/i.test(entry.relative)) group.actual = entry;
      else if (/\.diff\.png$/i.test(entry.relative)) group.diff = entry;
      else {
        group.result = entry;
        const parsed = readJson(entry.absolute);
        group.sidecar = isVisualDiffSidecar(parsed) ? parsed : null;
      }
      groups.set(stem, group);
      derived.add(entry.relative);
      continue;
    }
    if (/\.json$/i.test(entry.relative)) {
      const parsed = readJson(entry.absolute);
      if (isVisualDiffSidecar(parsed)) {
        const legacyStem = entry.relative.replace(/\.json$/i, "");
        const group = groups.get(legacyStem) ?? { sidecar: null };
        group.legacy = entry;
        group.sidecar = parsed;
        groups.set(legacyStem, group);
        derived.add(entry.relative);
      }
    }
  }

  for (const [stem, group] of groups) {
    const members = [group.actual, group.diff, group.result, group.legacy].filter(
      (entry): entry is WalkedEntry => Boolean(entry),
    );
    const baselineRelative = `${stem}.png`;
    const baseline = fileByRelative.get(baselineRelative);
    let validMoves: PlannedMove[] | null = null;
    if (
      baseline &&
      group.actual &&
      group.diff &&
      group.result &&
      !group.legacy
    ) {
      try {
        const artifacts = visualArtifactPaths({
          root: options.root,
          snapshotDir: options.snapshotDir,
          baselinePath: baseline.absolute,
        });
        if (
          movableVersion4(
            group.sidecar,
            artifacts.actualRelative,
            artifacts.diffRelative,
          ) &&
          group.sidecar.baselineHash === sha256(baseline.absolute) &&
          group.sidecar.actualHash === sha256(group.actual.absolute)
        ) {
          validMoves = [
            { source: group.actual.absolute, destination: artifacts.actual },
            { source: group.diff.absolute, destination: artifacts.diff },
            { source: group.result.absolute, destination: artifacts.result },
          ];
        }
      } catch {
        validMoves = null;
      }
    }
    if (validMoves) {
      for (const member of members) {
        const destination = validMoves.find((move) => move.source === member.absolute)
          ?.destination;
        inventory.push({
          path: member.relative,
          kind: "misplaced-derived",
          severity: "warning",
          message: inventoryMessage("misplaced-derived"),
          fixable: true,
          destination: destination ? displayPath(options.root, destination) : undefined,
        });
      }
      repairs.push({
        kind: "move-derived",
        reason: "Move a valid version 4 result trio to its canonical artifact mirror.",
        sources: validMoves.map((move) => move.source),
        moves: validMoves,
      });
      continue;
    }
    for (const member of members) {
      inventory.push({
        path: member.relative,
        kind: "legacy-derived",
        severity: "warning",
        message: inventoryMessage("legacy-derived"),
        fixable: true,
        destination: `${VISUAL_DELTA_CACHE_DIR_REL}/doctor-quarantine/<run>/snapshot/${member.relative}`,
      });
    }
    repairs.push({
      kind: "quarantine",
      reason: "Quarantine legacy or incomplete comparison evidence.",
      sources: members.map((member) => member.absolute),
      quarantine: members.map((member) => ({
        source: member.absolute,
        namespace: "snapshot" as const,
        relative: member.relative,
      })),
    });
  }

  const migration = planVisualBaselineMigration({
    root: options.root,
    snapshotDirs: [options.snapshotDir],
  });
  const legacyStatuses = new Map(
    migration.items.map((item) => [
      normalizeRelative(path.relative(options.snapshotDir, item.legacyPath)),
      item.status,
    ]),
  );

  for (const entry of files) {
    if (entry.kind !== "file" || derived.has(entry.relative)) continue;
    if (entry.relative === ".gitkeep") continue;
    if (!/\.png$/i.test(entry.relative)) {
      inventory.push({
        path: entry.relative,
        kind: "unexpected-file",
        severity: "info",
        message: inventoryMessage("unexpected-file"),
      });
      continue;
    }
    const legacy = parseVisualBaselineEnvironment(entry.relative);
    if (legacy) {
      const status = legacyStatuses.get(entry.relative);
      inventory.push({
        path: entry.relative,
        kind: "legacy-platform-baseline",
        severity: "warning",
        browser: legacy.browser,
        message: `${inventoryMessage("legacy-platform-baseline")} (${status ?? "review"}).`,
      });
      continue;
    }
    const target = parseVisualBaselineTarget(entry.relative);
    if (!target) {
      const referenced = ownership.references.get(entry.relative);
      inventory.push({
        path: entry.relative,
        kind: referenced ? "teaching-image" : "unrecognized-image",
        severity: referenced ? "info" : "warning",
        storyId: referenced?.storyId,
        message: inventoryMessage(referenced ? "teaching-image" : "unrecognized-image"),
      });
      continue;
    }
    const match = baselineOwner(entry.relative, target.browser, ownership);
    const browserDisabled = !options.browsers.includes(target.browser);
    if (match.owner?.skipped) {
      inventory.push({
        path: entry.relative,
        kind: "inactive-baseline",
        severity: "warning",
        browser: target.browser,
        storyId: match.owner.storyId,
        message: inventoryMessage("inactive-baseline"),
      });
    } else if (match.owner && (match.exact || match.referenced)) {
      inventory.push({
        path: entry.relative,
        kind: browserDisabled
          ? "disabled-browser-baseline"
          : "canonical-baseline",
        severity: "info",
        browser: target.browser,
        storyId: match.owner.storyId,
        message: inventoryMessage(
          browserDisabled ? "disabled-browser-baseline" : "canonical-baseline",
        ),
      });
    } else if (match.owner) {
      inventory.push({
        path: entry.relative,
        kind: "unverified-baseline",
        severity: "info",
        browser: target.browser,
        storyId: match.owner.storyId,
        message: "A mode or interaction filename belongs to this story family but is not statically referenced.",
      });
    } else {
      inventory.push({
        path: entry.relative,
        kind: options.indexFresh ? "orphan-baseline" : "unverified-baseline",
        severity: options.indexFresh ? "warning" : "info",
        browser: target.browser,
        message: inventoryMessage(
          options.indexFresh ? "orphan-baseline" : "unverified-baseline",
        ),
      });
    }
  }

  return { inventory, repairs };
}

function inspectLegacyCache(root: string): {
  checks: VisualDeltaDoctorCheck[];
  repairs: PlannedRepair[];
} {
  const checks: VisualDeltaDoctorCheck[] = [];
  const repairs: PlannedRepair[] = [];
  const legacyRoot = path.join(root, ...LEGACY_VISUAL_DELTA_CACHE_REL.split("/"));
  const legacyChangeSets = path.join(
    root,
    ...LEGACY_VISUAL_DELTA_CHANGE_SETS_CACHE_REL.split("/"),
  );
  const canonicalChangeSets = path.join(
    root,
    ...VISUAL_DELTA_CHANGE_SETS_CACHE_REL.split("/"),
  );
  if (!existsSync(legacyRoot)) {
    addCheck(checks, {
      code: "legacy-cache",
      severity: "pass",
      message: "No legacy .cache/visual-delta root is present.",
    });
    return { checks, repairs };
  }
  if (existsSync(legacyChangeSets) && existsSync(canonicalChangeSets)) {
    addCheck(checks, {
      code: "legacy-change-set-cache-collision",
      severity: "error",
      message: "Legacy and canonical change-set caches both contain state.",
      paths: [
        displayPath(root, legacyChangeSets),
        displayPath(root, canonicalChangeSets),
      ],
      suggestion: "Review both caches manually; doctor will not merge review history.",
    });
  } else if (existsSync(legacyChangeSets)) {
    addCheck(checks, {
      code: "legacy-change-set-cache",
      severity: "warning",
      message: "Change-set review data still uses the legacy cache root.",
      paths: [displayPath(root, legacyChangeSets)],
      suggestion: "Run visual-delta doctor --fix to migrate it.",
      fixable: true,
    });
    repairs.push({
      kind: "migrate-change-set-cache",
      reason: "Move change-set review state into .visual-delta/cache/change-sets.",
      sources: [legacyChangeSets],
    });
  }
  const other = walkFiles(legacyRoot).filter(
    (entry) =>
      entry.kind === "file" &&
      !entry.relative.startsWith("change-sets/") &&
      entry.relative !== "change-sets",
  );
  if (other.length) {
    addCheck(checks, {
      code: "legacy-cache-files",
      severity: "warning",
      message: `Legacy Visual Delta cache contains ${other.length} additional file${other.length === 1 ? "" : "s"}.`,
      paths: other.map((entry) => displayPath(root, entry.absolute)),
      suggestion: "Run visual-delta doctor --fix to quarantine this obsolete state.",
      fixable: true,
    });
    repairs.push({
      kind: "quarantine",
      reason: "Quarantine unrecognized files from the legacy cache root.",
      sources: other.map((entry) => entry.absolute),
      quarantine: other.map((entry) => ({
        source: entry.absolute,
        namespace: "legacy-cache" as const,
        relative: entry.relative,
      })),
    });
  }
  return { checks, repairs };
}

function reportSummary(
  checks: VisualDeltaDoctorCheck[],
  files: number,
): VisualDeltaDoctorReport["summary"] {
  return {
    pass: checks.filter((check) => check.severity === "pass").length,
    info: checks.filter((check) => check.severity === "info").length,
    warning: checks.filter((check) => check.severity === "warning").length,
    error: checks.filter((check) => check.severity === "error").length,
    files,
  };
}

async function inspectDoctor(
  options: VisualDeltaDoctorOptions,
  dependencies: VisualDeltaDoctorDependencies,
): Promise<Inspection> {
  const root = path.resolve(options.root ?? process.cwd());
  const configDir = path.resolve(root, options.configDir ?? DEFAULT_CONFIG_DIR);
  const checks: VisualDeltaDoctorCheck[] = [];
  const repairs: PlannedRepair[] = [];
  const pkg = projectPackage(root);
  if (!pkg.value) {
    addCheck(checks, {
      code: "package-json",
      severity: "error",
      message: "package.json is missing or unreadable.",
      paths: [displayPath(root, pkg.path)],
    });
  } else {
    addCheck(checks, {
      code: "package-json",
      severity: "pass",
      message: "package.json is readable.",
    });
    checkDependencies(root, pkg.value, checks);
    checkScripts(pkg.value, checks);
  }

  let main: StorybookMainConfig | null = null;
  try {
    main = await (dependencies.loadMainConfig ?? defaultLoadMainConfig)({
      configDir,
      cwd: root,
      skipCache: true,
    });
    addCheck(checks, {
      code: "storybook-config",
      severity: "pass",
      message: "Storybook main configuration loaded successfully.",
    });
  } catch (error) {
    addCheck(checks, {
      code: "storybook-config",
      severity: "error",
      message: `Storybook main configuration could not be loaded: ${
        error instanceof Error ? error.message : String(error)
      }`,
      paths: [displayPath(root, configDir)],
      suggestion: "Fix Storybook configuration or pass --config-dir.",
    });
  }

  const matches = (main?.addons ?? []).filter(isVisualDeltaAddon);
  if (main && matches.length !== 1) {
    addCheck(checks, {
      code: "addon-registration",
      severity: "error",
      message: matches.length
        ? `Visual Delta is registered ${matches.length} times.`
        : "Visual Delta is not registered in Storybook addons.",
      suggestion: `Register ${PACKAGE_NAME} exactly once in Storybook main configuration.`,
    });
  } else if (matches.length === 1) {
    addCheck(checks, {
      code: "addon-registration",
      severity: "pass",
      message: "Visual Delta is registered exactly once.",
    });
  }

  const host = matches[0] ? hostOptionsFromAddon(matches[0]) ?? {} : {};
  const configuredRoot = host.root?.trim();
  const hostRoot = configuredRoot
    ? path.resolve(root, configuredRoot)
    : root;
  let pathMode = options.baselinePathMode ?? host.baselinePathMode ?? DEFAULT_BASELINE_PATH_MODE;
  if (pathMode !== "story-id" && pathMode !== "nested-import") {
    addCheck(checks, {
      code: "baseline-path-mode",
      severity: "error",
      message: `Invalid baselinePathMode: ${String(pathMode)}.`,
      suggestion: "Use story-id or nested-import.",
    });
    pathMode = DEFAULT_BASELINE_PATH_MODE;
  } else {
    addCheck(checks, {
      code: "baseline-path-mode",
      severity: "pass",
      message: `Baseline path mode is ${pathMode}.`,
    });
  }
  const snapshotDir = resolveSnapshotDir(
    { snapshotDir: options.snapshotDir ?? host.snapshotDir },
    hostRoot,
  );
  let snapshotUsable = false;
  if (!existsSync(snapshotDir)) {
    addCheck(checks, {
      code: "snapshot-directory",
      severity: "error",
      message: "The configured snapshot directory does not exist.",
      paths: [displayPath(hostRoot, snapshotDir)],
      suggestion: "Run visual-delta init or correct the configured snapshotDir.",
    });
  } else {
    try {
      const snapshotStat = lstatSync(snapshotDir);
      if (snapshotStat.isSymbolicLink() || !snapshotStat.isDirectory()) {
        throw new Error(
          snapshotStat.isSymbolicLink()
            ? "The configured snapshot directory is a symbolic link."
            : "The configured snapshot path is not a directory.",
        );
      }
      accessSync(snapshotDir, constants.R_OK);
      snapshotUsable = true;
      addCheck(checks, {
        code: "snapshot-directory",
        severity: "pass",
        message: `Snapshot directory is readable${isInside(hostRoot, snapshotDir) ? "" : " and external to the host root"}.`,
        paths: [displayPath(hostRoot, snapshotDir)],
      });
    } catch (error) {
      addCheck(checks, {
        code: "snapshot-directory",
        severity: "error",
        message:
          error instanceof Error
            ? error.message
            : "The configured snapshot directory is not readable.",
        paths: [displayPath(hostRoot, snapshotDir)],
        suggestion:
          "Use a readable real directory and configure an external absolute path directly instead of a symbolic link.",
      });
    }
  }
  if (
    isInside(path.join(hostRoot, ".visual-delta"), snapshotDir) ||
    path.resolve(snapshotDir) === path.resolve(hostRoot)
  ) {
    addCheck(checks, {
      code: "snapshot-directory-safety",
      severity: "error",
      message: "snapshotDir overlaps the project root or .visual-delta derived state.",
      paths: [displayPath(hostRoot, snapshotDir)],
      suggestion: "Use a dedicated committed snapshot directory.",
    });
  }

  checkOnboarding(hostRoot, snapshotDir, checks);
  checkIgnorePolicy(hostRoot, checks);
  const project = readVisualDeltaProjectConfig(hostRoot);
  for (const diagnostic of project.diagnostics) {
    addCheck(checks, {
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      suggestion: diagnostic.suggestion,
      paths: [displayPath(hostRoot, project.path)],
    });
  }
  if (!project.diagnostics.length) {
    addCheck(checks, {
      code: "project-config",
      severity: "pass",
      message: project.exists
        ? ".visual-delta/config.json is valid."
        : "Project defaults resolve from built-ins.",
    });
  }
  const legacyThreshold = path.join(hostRoot, ".visual-delta/playwright.json");
  if (existsSync(legacyThreshold)) {
    addCheck(checks, {
      code: "legacy-threshold-config",
      severity: "warning",
      message: "The legacy Playwright threshold file is present.",
      paths: [displayPath(hostRoot, legacyThreshold)],
      suggestion: "Persist the threshold in .visual-delta/config.json when convenient.",
    });
  }

  let runner: VisualDeltaCaptureRunner | undefined;
  try {
    runner = await (dependencies.resolveRunner ?? resolveVisualDeltaCaptureRunner)(
      hostRoot,
    );
    const profileDiagnostics = validateVisualCaptureProfile(runner.profile);
    addCheck(checks, {
      code: "runner-profile",
      severity: profileDiagnostics.length ? "error" : "pass",
      message: profileDiagnostics.length
        ? profileDiagnostics.join(" ")
        : `Capture runner ${runner.id} has a valid canonical profile.`,
    });
    if (options.runner) {
      const result = runner.doctor
        ? await runner.doctor()
        : { ok: true, diagnostics: [] };
      addCheck(checks, {
        code: "runner-probe",
        severity: result.ok ? "pass" : "error",
        message: result.ok
          ? "The full capture-runner probe passed."
          : result.diagnostics.join(" ") || "The capture-runner probe failed.",
      });
    } else {
      addCheck(checks, {
        code: "runner-probe",
        severity: "info",
        message: "The slow capture-runner probe was not requested.",
        suggestion: "Run visual-delta doctor --runner before the first authoritative capture.",
      });
    }
  } catch (error) {
    addCheck(checks, {
      code: "runner-profile",
      severity: "error",
      message: `Capture runner could not be resolved: ${
        error instanceof Error ? error.message : String(error)
      }`,
      suggestion: "Fix Docker availability or .visual-delta/runner.mjs.",
    });
  }

  if (options.build) {
    try {
      (dependencies.runBuild ?? defaultRunBuild)(hostRoot, Boolean(options.json));
      addCheck(checks, {
        code: "storybook-build",
        severity: "pass",
        message: "Storybook was rebuilt for ownership analysis.",
      });
    } catch (error) {
      addCheck(checks, {
        code: "storybook-build",
        severity: "error",
        message: `Storybook build failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }
  const completeStatic = isStorybookStaticComplete(hostRoot);
  const staticDecision = decideStorybookStaticBuild({
    packageRoot: hostRoot,
    skipBuild: true,
    storyIdPrefix: "",
  });
  const indexFresh = completeStatic && staticDecision.reason === "reuse";
  addCheck(checks, {
    code: "storybook-index",
    severity: indexFresh ? "pass" : "warning",
    message: indexFresh
      ? "storybook-static/index.json is complete and current."
      : `${staticDecision.message}; orphan detection is suppressed.`,
    suggestion: indexFresh
      ? undefined
      : "Run visual-delta doctor --build for authoritative ownership analysis.",
  });
  const entries = completeStatic ? readStaticEntries(hostRoot) : [];

  let inventory: VisualDeltaDoctorInventoryItem[] = [];
  if (snapshotUsable) {
    const inspected = inspectSnapshot({
      root: hostRoot,
      snapshotDir,
      pathMode,
      browsers: project.browsers,
      entries,
      indexFresh,
    });
    inventory = inspected.inventory;
    repairs.push(...inspected.repairs);
    groupInventoryChecks(inventory, checks, indexFresh);
  }
  const legacyCache = inspectLegacyCache(hostRoot);
  checks.push(...legacyCache.checks);
  repairs.push(...legacyCache.repairs);

  const availableFixes: VisualDeltaDoctorFix[] = repairs.map((repair) => ({
    kind: repair.kind,
    status: "available",
    sources: repair.sources.map((source) => displayPath(hostRoot, source)),
    destinations: repair.moves?.map((move) => displayPath(hostRoot, move.destination)),
    reason: repair.reason,
  }));
  const summary = reportSummary(
    checks,
    snapshotUsable ? walkFiles(snapshotDir).length : 0,
  );
  return {
    report: {
      version: DOCTOR_REPORT_VERSION,
      ok: summary.error === 0,
      root,
      resolved: {
        configDir,
        hostRoot,
        snapshotDir,
        baselinePathMode: pathMode,
        browsers: [...project.browsers],
        indexFresh,
        runner: runner ? { id: runner.id, kind: runner.kind } : undefined,
      },
      summary,
      checks,
      inventory,
      fixes: availableFixes,
    },
    repairs,
  };
}

function copyMovesVerified(moves: PlannedMove[]): void {
  const copied: string[] = [];
  try {
    for (const move of moves) {
      if (existsSync(move.destination)) {
        throw new Error(`Destination already exists: ${move.destination}`);
      }
      mkdirSync(path.dirname(move.destination), { recursive: true });
      copyFileSync(move.source, move.destination, constants.COPYFILE_EXCL);
      copied.push(move.destination);
      if (sha256(move.source) !== sha256(move.destination)) {
        throw new Error(`Checksum mismatch: ${move.source}`);
      }
    }
  } catch (error) {
    for (const destination of copied) {
      rmSync(destination, { force: true });
    }
    throw error;
  }
  for (const move of moves) unlinkSync(move.source);
}

function removeEmptyAncestors(start: string, boundary: string): void {
  const resolvedBoundary = path.resolve(boundary);
  let current = path.resolve(start);
  while (
    current !== resolvedBoundary &&
    current.startsWith(`${resolvedBoundary}${path.sep}`)
  ) {
    try {
      rmdirSync(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}

function quarantineMoves(
  root: string,
  runId: string,
  repair: PlannedRepair,
): PlannedMove[] {
  const quarantineRoot = path.join(
    root,
    ...VISUAL_DELTA_CACHE_DIR_REL.split("/"),
    "doctor-quarantine",
    runId,
  );
  return (repair.quarantine ?? []).map((entry) => ({
    source: entry.source,
    destination: path.join(
      quarantineRoot,
      entry.namespace,
      ...normalizeRelative(entry.relative).split("/"),
    ),
  }));
}

function preflightMoves(
  root: string,
  kind: Exclude<PlannedRepair["kind"], "migrate-change-set-cache">,
  moves: PlannedMove[],
): void {
  const allowedDestinationRoot = path.join(
    root,
    ...(kind === "move-derived"
      ? VISUAL_DELTA_ARTIFACT_DIR_REL
      : VISUAL_DELTA_CACHE_DIR_REL
    ).split("/"),
  );
  for (const move of moves) {
    const source = lstatSync(move.source);
    if (!source.isFile() || source.isSymbolicLink()) {
      throw new Error(`Repair source is not a regular file: ${move.source}`);
    }
    if (!isInside(allowedDestinationRoot, move.destination)) {
      throw new Error(`Repair destination escapes its derived root: ${move.destination}`);
    }
    if (existsSync(move.destination)) {
      throw new Error(`Destination already exists: ${move.destination}`);
    }
  }
}

function applyRepairs(
  root: string,
  repairs: PlannedRepair[],
  dependencies: VisualDeltaDoctorDependencies,
): VisualDeltaDoctorFix[] {
  const date = (dependencies.now ?? (() => new Date()))();
  const randomId = (dependencies.randomId ?? randomUUID)();
  const runId = `${date.toISOString().replace(/[:.]/g, "-")}-${randomId}`;
  const manifestEntries: Array<{
    source: string;
    destination: string;
    sha256: string;
    reason: string;
  }> = [];
  const results: VisualDeltaDoctorFix[] = [];

  for (const repair of repairs) {
    if (repair.kind === "migrate-change-set-cache") {
      const migration = migrateLegacyChangeSetCache(root);
      results.push({
        kind: repair.kind,
        status: migration.status === "migrated"
          ? "applied"
          : migration.status === "failed"
            ? "failed"
            : "skipped",
        sources: [displayPath(root, migration.legacyPath)],
        destinations: [displayPath(root, migration.canonicalPath)],
        reason: repair.reason,
        error: migration.error,
      });
      continue;
    }
    const moves = repair.kind === "quarantine"
      ? quarantineMoves(root, runId, repair)
      : repair.moves ?? [];
    try {
      preflightMoves(root, repair.kind, moves);
      const hashes = new Map(
        moves.map((move) => [move.source, sha256(move.source)]),
      );
      copyMovesVerified(moves);
      if (repair.kind === "quarantine") {
        const legacyRoot = path.join(
          root,
          ...LEGACY_VISUAL_DELTA_CACHE_REL.split("/"),
        );
        for (const move of moves) {
          if (move.source.startsWith(`${legacyRoot}${path.sep}`)) {
            removeEmptyAncestors(path.dirname(move.source), root);
          }
        }
      }
      if (repair.kind === "quarantine") {
        for (const move of moves) {
          manifestEntries.push({
            source: displayPath(root, move.source),
            destination: displayPath(root, move.destination),
            sha256: hashes.get(move.source)!,
            reason: repair.reason,
          });
        }
      }
      results.push({
        kind: repair.kind,
        status: "applied",
        sources: moves.map((move) => displayPath(root, move.source)),
        destinations: moves.map((move) => displayPath(root, move.destination)),
        reason: repair.reason,
      });
    } catch (error) {
      results.push({
        kind: repair.kind,
        status: "failed",
        sources: repair.sources.map((source) => displayPath(root, source)),
        destinations: moves.map((move) => displayPath(root, move.destination)),
        reason: repair.reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (manifestEntries.length) {
    const manifestPath = path.join(
      root,
      ...VISUAL_DELTA_CACHE_DIR_REL.split("/"),
      "doctor-quarantine",
      runId,
      "manifest.json",
    );
    mkdirSync(path.dirname(manifestPath), { recursive: true });
    const temporary = `${manifestPath}.${process.pid}.tmp`;
    writeFileSync(
      temporary,
      `${JSON.stringify(
        {
          version: 1,
          createdAt: date.toISOString(),
          entries: manifestEntries,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    renameSync(temporary, manifestPath);
  }
  return results;
}

export async function runVisualDeltaDoctor(
  options: VisualDeltaDoctorOptions = {},
  dependencies: VisualDeltaDoctorDependencies = {},
): Promise<VisualDeltaDoctorReport> {
  const initial = await inspectDoctor(options, dependencies);
  if (!options.fix) return initial.report;
  const hostRoot = initial.report.resolved.hostRoot;
  const applied = applyRepairs(hostRoot, initial.repairs, dependencies);
  const final = await inspectDoctor(
    {
      ...options,
      fix: false,
      build: false,
      runner: false,
    },
    dependencies,
  );
  final.report.fixes = [
    ...applied,
    ...final.report.fixes,
  ];
  if (applied.some((fix) => fix.status === "failed")) {
    final.report.checks.push({
      code: "doctor-fix-failed",
      severity: "error",
      message: "One or more doctor repairs failed; sources were retained where possible.",
      paths: applied
        .filter((fix) => fix.status === "failed")
        .flatMap((fix) => fix.sources),
    });
    final.report.summary = reportSummary(
      final.report.checks,
      final.report.summary.files,
    );
    final.report.ok = false;
  }
  return final.report;
}

export function visualDeltaDoctorExitCode(
  report: VisualDeltaDoctorReport,
  strict = false,
): number {
  return report.summary.error > 0 || (strict && report.summary.warning > 0)
    ? 1
    : 0;
}

function formattedPaths(paths: string[], verbose: boolean): string[] {
  if (verbose || paths.length <= HUMAN_PATH_LIMIT) return paths;
  return [
    ...paths.slice(0, HUMAN_PATH_LIMIT),
    `… ${paths.length - HUMAN_PATH_LIMIT} more (use --verbose or --json)`,
  ];
}

export function formatVisualDeltaDoctorReport(
  report: VisualDeltaDoctorReport,
  options: { verbose?: boolean } = {},
): string {
  const symbols: Record<VisualDeltaDoctorSeverity, string> = {
    pass: "✓",
    info: "•",
    warning: "!",
    error: "✖",
  };
  const lines = [
    "Visual Delta doctor",
    `  root: ${report.resolved.hostRoot}`,
    `  snapshotDir: ${report.resolved.snapshotDir}`,
    `  baselinePathMode: ${report.resolved.baselinePathMode}`,
    "",
  ];
  for (const check of report.checks) {
    lines.push(`${symbols[check.severity]} ${check.message}`);
    for (const item of formattedPaths(check.paths ?? [], Boolean(options.verbose))) {
      lines.push(`    ${item}`);
    }
    if (check.suggestion) lines.push(`    ${check.suggestion}`);
  }
  const applied = report.fixes.filter((fix) => fix.status !== "available");
  if (applied.length) {
    lines.push("", "Repairs:");
    for (const fix of applied) {
      lines.push(`  ${fix.status}: ${fix.reason}`);
      if (fix.error) lines.push(`    ${fix.error}`);
    }
  }
  lines.push(
    "",
    `Summary: ${report.summary.pass} passed, ${report.summary.info} info, ${report.summary.warning} warnings, ${report.summary.error} errors.`,
  );
  return lines.join("\n");
}
