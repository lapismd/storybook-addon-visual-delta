import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_SNAPSHOT_DIR, resolveVisualServerPort } from "./options.js";

export type VisualDeltaInitOptions = {
  packageRoot?: string;
  port?: number;
  /** Overwrite existing suite / Playwright config files. */
  force?: boolean;
  /** Skip mutating package.json scripts. */
  skipPackageJson?: boolean;
};

export type VisualDeltaInitResult = {
  ok: true;
  packageRoot: string;
  written: string[];
  skipped: string[];
  scriptsUpdated: string[];
  suiteReady: boolean;
  playwrightConfigReady: boolean;
  snapshotDir: string;
};

export type VisualDeltaOnboardingStatus = {
  suiteReady: boolean;
  playwrightConfigReady: boolean;
  snapshotDirExists: boolean;
  snapshotDir: string;
  suitePath: string;
  playwrightConfigPath: string;
  ready: boolean;
  hint: string;
};

const SUITE_REL = path.join("tests", "visual", "storybook.spec.ts");
const PLAYWRIGHT_CONFIG_REL = "playwright.config.ts";

const SUITE_SOURCE = `import { defineVisualSuite } from "@lapismd/storybook-addon-visual-delta/playwright";

defineVisualSuite();
`;

function playwrightConfigSource(port: number): string {
  return `import { defineVisualPlaywrightConfig } from "@lapismd/storybook-addon-visual-delta/playwright";

export default defineVisualPlaywrightConfig({ port: ${port} });
`;
}

function rel(root: string, absolute: string): string {
  return path.relative(root, absolute).replaceAll(path.sep, "/") || ".";
}

export function resolveOnboardingPaths(packageRoot: string): {
  suitePath: string;
  playwrightConfigPath: string;
  snapshotDir: string;
} {
  return {
    suitePath: path.join(packageRoot, SUITE_REL),
    playwrightConfigPath: path.join(packageRoot, PLAYWRIGHT_CONFIG_REL),
    snapshotDir: path.join(packageRoot, DEFAULT_SNAPSHOT_DIR),
  };
}

/** Inspect whether a host has the portable Visual Delta Playwright entrypoints. */
export function inspectVisualDeltaOnboarding(
  packageRoot: string,
  snapshotDir = path.join(packageRoot, DEFAULT_SNAPSHOT_DIR),
): VisualDeltaOnboardingStatus {
  const paths = resolveOnboardingPaths(packageRoot);
  const suiteReady = existsSync(paths.suitePath);
  const playwrightConfigReady = existsSync(paths.playwrightConfigPath);
  const snapshotDirExists = existsSync(snapshotDir);
  const ready = suiteReady && playwrightConfigReady;
  let hint: string;
  if (ready) {
    hint = "Playwright suite and config are present.";
  } else if (!suiteReady && !playwrightConfigReady) {
    hint =
      "Missing visual suite and Playwright config. Run: pnpm exec visual-delta init";
  } else if (!suiteReady) {
    hint = `Missing ${SUITE_REL}. Run: pnpm exec visual-delta init`;
  } else {
    hint = `Missing ${PLAYWRIGHT_CONFIG_REL}. Run: pnpm exec visual-delta init`;
  }
  return {
    suiteReady,
    playwrightConfigReady,
    snapshotDirExists,
    snapshotDir,
    suitePath: paths.suitePath,
    playwrightConfigPath: paths.playwrightConfigPath,
    ready,
    hint,
  };
}

function ensureFile(
  filePath: string,
  contents: string,
  force: boolean,
  written: string[],
  skipped: string[],
  root: string,
): void {
  if (existsSync(filePath) && !force) {
    skipped.push(rel(root, filePath));
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, "utf8");
  written.push(rel(root, filePath));
}

function updatePackageScripts(
  packageRoot: string,
  scriptsUpdated: string[],
): void {
  const pkgPath = path.join(packageRoot, "package.json");
  if (!existsSync(pkgPath)) return;
  let pkg: {
    scripts?: Record<string, string>;
  };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
  } catch {
    return;
  }
  const scripts = { ...(pkg.scripts ?? {}) };
  const desired: Record<string, string> = {
    "test:visual": "visual-delta test --all",
    "test:visual:affected": "visual-delta test --affected",
    "visual-delta": "visual-delta",
    "build-storybook":
      "node -e \"require('node:fs').mkdirSync('.visual-delta/cache',{recursive:true})\" && storybook build --stats-json .visual-delta/cache",
  };
  let changed = false;
  for (const [name, value] of Object.entries(desired)) {
    if (!scripts[name]) {
      scripts[name] = value;
      scriptsUpdated.push(name);
      changed = true;
    }
  }
  if (!changed) return;
  pkg.scripts = scripts;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

function ensureGeneratedVisualDeltaIgnored(packageRoot: string): void {
  const ignorePath = path.join(packageRoot, ".gitignore");
  const existing = existsSync(ignorePath)
    ? readFileSync(ignorePath, "utf8")
    : "";
  const lines = new Set(existing.split(/\r?\n/).map((line) => line.trim()));
  const missing = [
    ".visual-delta/artifacts/",
    ".visual-delta/cache/",
  ].filter((line) => !lines.has(line));
  if (missing.length === 0) return;
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(
    ignorePath,
    `${existing}${prefix}${missing.join("\n")}\n`,
    "utf8",
  );
}

/**
 * Scaffold a portable Visual Delta host: thin suite, Playwright config,
 * snapshot directory, and package.json scripts.
 */
export function runVisualDeltaInit(
  options: VisualDeltaInitOptions = {},
): VisualDeltaInitResult {
  const packageRoot = options.packageRoot?.trim() || process.cwd();
  const port = options.port ?? resolveVisualServerPort();
  const force = Boolean(options.force);
  const written: string[] = [];
  const skipped: string[] = [];
  const scriptsUpdated: string[] = [];
  ensureGeneratedVisualDeltaIgnored(packageRoot);

  const paths = resolveOnboardingPaths(packageRoot);
  ensureFile(
    paths.suitePath,
    SUITE_SOURCE,
    force,
    written,
    skipped,
    packageRoot,
  );
  ensureFile(
    paths.playwrightConfigPath,
    playwrightConfigSource(port),
    force,
    written,
    skipped,
    packageRoot,
  );

  mkdirSync(paths.snapshotDir, { recursive: true });
  const gitkeep = path.join(paths.snapshotDir, ".gitkeep");
  if (!existsSync(gitkeep)) {
    writeFileSync(gitkeep, "", "utf8");
    written.push(rel(packageRoot, gitkeep));
  } else {
    skipped.push(rel(packageRoot, gitkeep));
  }

  if (!options.skipPackageJson) {
    updatePackageScripts(packageRoot, scriptsUpdated);
  }

  const onboarding = inspectVisualDeltaOnboarding(
    packageRoot,
    paths.snapshotDir,
  );

  return {
    ok: true,
    packageRoot,
    written,
    skipped,
    scriptsUpdated,
    suiteReady: onboarding.suiteReady,
    playwrightConfigReady: onboarding.playwrightConfigReady,
    snapshotDir: paths.snapshotDir,
  };
}
