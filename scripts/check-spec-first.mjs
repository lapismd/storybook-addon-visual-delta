#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "../../..");
const PACKAGE_PREFIX = "packages/storybook-addon-visual-delta";

const CANONICAL_SPEC_PATTERN = new RegExp(
  `^${PACKAGE_PREFIX}/spec/src/(?!SUMMARY\\.md$).+\\.md$`,
);

const IGNORED_PATTERNS = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)(?:coverage|test-results|playwright-report|blob-report)\//,
  /(^|\/)\.cache\//,
  new RegExp(`^${PACKAGE_PREFIX}/spec/book/`),
  new RegExp(`^${PACKAGE_PREFIX}/specs/`),
  new RegExp(`^${PACKAGE_PREFIX}/tests/`),
  new RegExp(`^${PACKAGE_PREFIX}/src/test/`),
  new RegExp(`^${PACKAGE_PREFIX}/src/stories/`),
  /^src\/storybook\/visual-delta\//,
  /^tests\/visual\/storybook\.spec\.ts-snapshots\//,
  /\.(?:spec|test)\.[cm]?[jt]sx?$/,
  /\.stories\.(?:svelte|[cm]?[jt]sx?)$/,
  /\.d\.ts$/,
  /\.(?:actual|diff)\.png$/,
];

const PROTECTED_PATTERNS = [
  new RegExp(`^${PACKAGE_PREFIX}/src/.+\\.(?:[cm]?[jt]sx?|svelte|css)$`),
  new RegExp(
    `^${PACKAGE_PREFIX}/(?:package\\.json|playwright\\.panel\\.config\\.ts|tsconfig(?:\\.[^.]+)*\\.json|AGENTS\\.md)$`,
  ),
  new RegExp(
    `^${PACKAGE_PREFIX}/(?:\\.markdownlint-cli2\\.jsonc|spec/(?:book\\.toml|Makefile))$`,
  ),
  new RegExp(`^${PACKAGE_PREFIX}/scripts/check-spec-.+\\.mjs$`),
  /^\.visual-delta\//,
  /^\.env\.storybook\.local\.example$/,
  /^\.storybook\/main\.ts$/,
  /^\.storybook\/visual-(?:delta|baseline)(?:[.-].*)?\.[cm]?[jt]sx?$/,
  /^playwright\.config\.ts$/,
  /^scripts\/(?:storybook-(?:local-env|process|run)\.mjs|storybook-(?:restart|stop)\.sh|with-storybook-env\.mjs|visual-delta-panel-update\.ts)$/,
  /^scripts\/ui-generator\/pipeline\/visual-(?:update|interaction-update)\.ts$/,
  /^scripts\/ui-generator\/visual\/.+\.(?:[cm]?[jt]s)$/,
  /^\.github\/workflows\/visual-delta-spec-first\.ya?ml$/,
];

const CONDITIONAL_PATTERNS = new Map([
  [
    "package.json",
    /visual-delta|storybook:check|build-storybook|test:visual|workspace:visual|check:visual-delta|"checks"|markdownlint-cli2/i,
  ],
  [
    "scripts/ui-generator/cli.ts",
    /visual[-:]?(?:delta|update|interaction|tag)|visualUpdate/i,
  ],
]);

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function matchesAny(filePath, patterns) {
  return patterns.some((pattern) => pattern.test(filePath));
}

function mergeChanges(inputChanges) {
  const changes = new Map();
  for (const input of inputChanges) {
    const change =
      typeof input === "string"
        ? { path: input, changedLines: [] }
        : { changedLines: [], ...input };
    const normalizedPath = normalizePath(change.path);
    if (!normalizedPath) continue;
    const current = changes.get(normalizedPath) ?? {
      path: normalizedPath,
      changedLines: [],
    };
    current.changedLines.push(...(change.changedLines ?? []));
    changes.set(normalizedPath, current);
  }
  return [...changes.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
}

function isConditionallyProtected(change) {
  const pattern = CONDITIONAL_PATTERNS.get(change.path);
  if (!pattern) return false;
  if (change.changedLines.length === 0) return true;
  return change.changedLines.some((line) => pattern.test(line));
}

export function classifySpecFirstChanges(inputChanges) {
  const changes = mergeChanges(inputChanges);
  const specFiles = changes
    .map((change) => change.path)
    .filter((filePath) => CANONICAL_SPEC_PATTERN.test(filePath));
  const protectedFiles = changes
    .filter((change) => {
      if (CANONICAL_SPEC_PATTERN.test(change.path)) return false;
      if (matchesAny(change.path, IGNORED_PATTERNS)) return false;
      return (
        matchesAny(change.path, PROTECTED_PATTERNS) ||
        isConditionallyProtected(change)
      );
    })
    .map((change) => change.path);

  return {
    files: changes.map((change) => change.path),
    specFiles,
    protectedFiles,
    requiresSpec: protectedFiles.length > 0,
    hasSpecUpdate: specFiles.length > 0,
    ok: protectedFiles.length === 0 || specFiles.length > 0,
  };
}

function parseDiffHeader(line) {
  const source = line.slice("diff --git ".length);
  const match =
    /^(?:"((?:[^"\\]|\\.)*)"|(\S+))\s+(?:"((?:[^"\\]|\\.)*)"|(\S+))$/.exec(
      source,
    );
  if (!match) return null;

  const decode = (quoted, plain) => {
    const value = quoted === undefined ? plain : JSON.parse(`"${quoted}"`);
    return value?.replace(/^[ab]\//, "");
  };

  try {
    const before = decode(match[1], match[2]);
    const after = decode(match[3], match[4]);
    if (!before || !after) return null;
    return [before, after];
  } catch {
    return null;
  }
}

export function parseUnifiedDiff(source) {
  const changes = new Map();
  let currentPaths = [];
  let sawHeader = false;

  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      const header = parseDiffHeader(line);
      if (!header) {
        throw new Error(`Unsupported unified diff header: ${line}`);
      }
      sawHeader = true;
      currentPaths = [...new Set(header.map(normalizePath))];
      for (const currentPath of currentPaths) {
        if (!changes.has(currentPath)) {
          changes.set(currentPath, { path: currentPath, changedLines: [] });
        }
      }
      continue;
    }
    if (
      currentPaths.length === 0 ||
      line.startsWith("+++") ||
      line.startsWith("---")
    ) {
      continue;
    }
    if (line.startsWith("+") || line.startsWith("-")) {
      for (const currentPath of currentPaths) {
        changes.get(currentPath).changedLines.push(line.slice(1));
      }
    }
  }

  if (source.trim() && !sawHeader) {
    throw new Error(
      "Non-empty change-set output contained no unified diff headers",
    );
  }

  return [...changes.values()];
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = result.stderr.trim() || result.stdout.trim();
    throw new Error(
      `${command} ${args.join(" ")} failed${details ? `:\n${details}` : ""}`,
    );
  }
  return result.stdout;
}

function parseArgs(argv) {
  const options = { files: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      continue;
    } else if (argument === "--base") {
      options.base = argv[++index];
    } else if (argument === "--head") {
      options.head = argv[++index];
    } else if (argument === "--file") {
      options.files.push(argv[++index]);
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.head && !options.base) {
    throw new Error("--head requires --base");
  }
  if (options.files.some((file) => !file)) {
    throw new Error("--file requires a path");
  }
  return options;
}

function changesFromVcs({ base, head, files }, repoRoot) {
  if (files.length > 0) return files;

  if (base) {
    const patch = run(
      "git",
      ["diff", "--no-ext-diff", "--unified=0", base, head ?? "HEAD", "--"],
      repoRoot,
    );
    return parseUnifiedDiff(patch);
  }

  if (existsSync(path.join(repoRoot, ".jj"))) {
    const patch = run(
      "jj",
      [
        "--no-pager",
        "--color=never",
        "diff",
        "--git",
        "--from",
        "@-",
        "--to",
        "@",
      ],
      repoRoot,
    );
    return parseUnifiedDiff(patch);
  }

  const patch = run(
    "git",
    ["diff", "--no-ext-diff", "--unified=0", "HEAD", "--"],
    repoRoot,
  );
  const changes = parseUnifiedDiff(patch);
  const untracked = run(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    repoRoot,
  )
    .split(/\r?\n/)
    .filter(Boolean);
  return [...changes, ...untracked];
}

function printHelp() {
  console.log(`Usage: node check-spec-first.mjs [--base <rev>] [--head <rev>] [--file <path>...]

Fails when protected Visual Delta implementation or host integration changes
without a canonical Markdown update under:
  packages/storybook-addon-visual-delta/spec/src/

Local default:
  jj diff --git --from @- --to @

Pull request:
  --base <base-sha> --head <head-sha>
`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }

    const changes = changesFromVcs(options, DEFAULT_REPO_ROOT);
    const result = classifySpecFirstChanges(changes);
    if (result.ok) {
      if (!result.requiresSpec) {
        console.log(
          "Visual Delta spec-first gate passed: no protected files changed.",
        );
        return;
      }
      console.log(
        `Visual Delta spec-first gate passed: ${result.protectedFiles.length} protected file(s), ${result.specFiles.length} canonical spec page(s).`,
      );
      return;
    }

    console.error(
      "Visual Delta spec-first gate failed: protected implementation changed without a canonical specification update.",
    );
    console.error("");
    console.error("Protected files:");
    for (const file of result.protectedFiles) console.error(`  - ${file}`);
    console.error("");
    console.error(
      `Update the relevant requirement and verification evidence under ${PACKAGE_PREFIX}/spec/src/ in the same logical slice.`,
    );
    process.exitCode = 1;
  } catch (error) {
    console.error(
      `Visual Delta spec-first gate could not determine a trustworthy change set: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
