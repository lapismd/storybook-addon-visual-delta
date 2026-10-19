/** Counted-line limits, file kinds, and generic dump-name conventions. */

export const LIMIT_KEYS = {
  production: "newProductionCountedLines",
  test: "newTestCountedLines",
  story: "newStoryCountedLines",
  script: "newScriptCountedLines",
};

export const DEFAULT_LIMITS = {
  newProductionCountedLines: 300,
  newTestCountedLines: 500,
  newStoryCountedLines: 400,
  newScriptCountedLines: 300,
};

export const DUMP_NAMES = new Set(["utils", "helpers", "common", "services"]);

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|svelte)$/u;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const TEST_SPECIFIER = /\.(?:test|spec)(?:\.[cm]?[jt]sx?)?$/u;
const STORY_FILE = /\.stories\.(?:svelte|[cm]?[jt]sx?)$/u;

export function isSourceFile(name) {
  return SOURCE_EXT.test(name);
}

export function toPosix(relativePath) {
  return relativePath.split("\\").join("/");
}

/**
 * Only `*.stories.*` files are story kind here. The `src/stories` directory is
 * published public API of this package: the manifest `files` entry covers all
 * of `src`, and the manifest exports `./src/stories`, `./src/stories/PanelShell`,
 * `./src/stories/panel-fixtures`, `./src/stories/DiffResultFixture`,
 * `./src/stories/TestingModuleShell`, and `./src/stories/mock-visual-backend`.
 * Its non-story fixtures therefore budget as production at 300 counted lines.
 *
 * `tests/` is the Playwright acceptance tree and `src/test/` is the vitest
 * setup and render harness imported by the colocated spec suites; both
 * budget as test code even where their filenames are not `*.spec.*`.
 */
export function fileKind(posixPath) {
  if (TEST_FILE.test(posixPath)) return "test";
  if (posixPath.startsWith("tests/")) return "test";
  if (posixPath.startsWith("src/test/")) return "test";
  if (STORY_FILE.test(posixPath)) return "story";
  if (
    posixPath.startsWith("scripts/") ||
    posixPath.startsWith(".storybook/")
  )
    return "script";
  return "production";
}

export function isDumpPath(posixPath) {
  const parts = posixPath.split("/");
  const base = (parts.at(-1) ?? "").replace(/\.(?:[cm]?[jt]sx?|svelte)$/u, "");
  if (DUMP_NAMES.has(base)) return true;
  return parts.slice(0, -1).some((part) => DUMP_NAMES.has(part));
}

export function isTestSpecifier(specifier) {
  return TEST_SPECIFIER.test(specifier);
}
