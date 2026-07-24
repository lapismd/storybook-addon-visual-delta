import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import {
  familyFromTitle,
  VISUAL_BASELINE_SUFFIX,
  visualBaselineVisualDeltaParameter,
} from "./baseline-design.js";
import {
  DEFAULT_SNAPSHOT_DIR,
  resolveBaselinePathMode,
  resolveRoot,
  type VisualDeltaHostOptions,
} from "./options.js";
import { baselinePublicUrl } from "./snapshot-paths.js";
import { findStoryOpenTagEnd, sanitizeStoryName } from "./source-utils.js";
import { injectTypeScriptStoryBaselines } from "./story-source.js";

type BaselineExists = (url: string) => boolean;

function extractTitle(code: string): string | undefined {
  const match = code.match(/\btitle:\s*["']([^"']+)["']/);
  return match?.[1];
}

/**
 * Prefer human `name` for baseline slug — Storybook story ids use it
 * (`Default row` → `default-row`). Preferring `exportName` (`DefaultRow` →
 * `defaultrow`) pointed inject/create at the wrong PNG path.
 */
function extractStoryName(attrs: string): string | undefined {
  const name = attrs.match(/\bname=["']([^"']+)["']/);
  if (name) return name[1];
  const exportName = attrs.match(/\bexportName=["']([^"']+)["']/);
  return exportName?.[1];
}

function baselineUrl(directory: string, slug: string): string {
  return `/visual-baselines/${directory}/${slug}${VISUAL_BASELINE_SUFFIX}.png`;
}

function visualDeltaObjectLiteral(
  directory: string,
  slug: string,
  baselineExists: BaselineExists,
): string | undefined {
  const url = baselineUrl(directory, slug);
  if (!baselineExists(url)) return undefined;

  const visualDelta = visualBaselineVisualDeltaParameter(url);
  return JSON.stringify(visualDelta);
}

function createCommittedBaselineExists(snapshotDir: string): BaselineExists {
  return (url: string) => {
    const relative = url.replace(/^\/visual-baselines\//, "");
    if (relative === url || relative.includes("..")) return false;
    return existsSync(join(snapshotDir, relative));
  };
}

function endOfDoubleBraceObject(source: string, start: number): number {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function injectVisualDeltaIntoStoryOpenTag(
  openTag: string,
  directory: string,
  baselineExists: BaselineExists,
): string {
  if (/skip-visual/.test(openTag)) return openTag;
  if (/\bvisualDelta\s*:/.test(openTag)) return openTag;

  const storyName = extractStoryName(openTag);
  if (!storyName) return openTag;

  const slug = sanitizeStoryName(storyName);
  const visualDeltaLiteral = visualDeltaObjectLiteral(
    directory,
    slug,
    baselineExists,
  );
  if (!visualDeltaLiteral) return openTag;
  return injectVisualDeltaLiteralIntoStoryOpenTag(openTag, visualDeltaLiteral);
}

function injectVisualDeltaLiteralIntoStoryOpenTag(
  openTag: string,
  visualDeltaLiteral: string,
): string {
  if (/skip-visual/.test(openTag)) return openTag;
  if (/\bvisualDelta\s*:/.test(openTag)) return openTag;

  const paramsKey = "parameters={{";
  const paramsIdx = openTag.indexOf(paramsKey);
  if (paramsIdx !== -1) {
    const braceStart = paramsIdx + "parameters=".length;
    const braceEnd = endOfDoubleBraceObject(openTag, braceStart);
    if (braceEnd === -1) return openTag;
    const insertAt = paramsIdx + paramsKey.length;
    return (
      openTag.slice(0, insertAt) +
      `\n    visualDelta: ${visualDeltaLiteral},` +
      openTag.slice(insertAt)
    );
  }

  const parametersAttr = `\n  parameters={{\n    visualDelta: ${visualDeltaLiteral},\n  }}`;
  if (openTag.endsWith("/>")) {
    return `${openTag.slice(0, -2)}${parametersAttr}\n/>`;
  }
  if (openTag.endsWith(">")) {
    return `${openTag.slice(0, -1)}${parametersAttr}\n>`;
  }
  return openTag;
}

export function injectVisualBaselineVisualDeltas(
  code: string,
  directory: string,
  baselineExists: BaselineExists = () => true,
): string {
  let result = "";
  let cursor = 0;

  while (cursor < code.length) {
    const start = code.indexOf("<Story", cursor);
    if (start === -1) {
      result += code.slice(cursor);
      break;
    }

    result += code.slice(cursor, start);
    const end = findStoryOpenTagEnd(code, start);
    if (end === -1) {
      result += code.slice(start);
      break;
    }

    const openTag = code.slice(start, end + 1);
    result += injectVisualDeltaIntoStoryOpenTag(
      openTag,
      directory,
      baselineExists,
    );
    cursor = end + 1;
  }

  return result;
}

function injectStoryIdVisualDeltas(
  code: string,
  title: string,
  baselineExists: BaselineExists,
): string {
  let result = "";
  let cursor = 0;
  while (cursor < code.length) {
    const start = code.indexOf("<Story", cursor);
    if (start < 0) return result + code.slice(cursor);
    result += code.slice(cursor, start);
    const end = findStoryOpenTagEnd(code, start);
    if (end < 0) return result + code.slice(start);
    const openTag = code.slice(start, end + 1);
    const storyName = extractStoryName(openTag);
    if (!storyName) {
      result += openTag;
    } else {
      const id = `${sanitizeStoryName(title)}--${sanitizeStoryName(storyName)}`;
      const url = baselinePublicUrl(
        { id, importPath: "story.stories.svelte" },
        "story-id",
      );
      result += baselineExists(url)
        ? injectVisualDeltaLiteralIntoStoryOpenTag(
            openTag,
            JSON.stringify(visualBaselineVisualDeltaParameter(url)),
          )
        : openTag;
    }
    cursor = end + 1;
  }
  return result;
}

/**
 * Injects `parameters.visualDelta` into supported catalog CSF so Visual Delta
 * receives baseline image URLs.
 */
export function visualBaselineVisualDeltaPlugin(
  options: VisualDeltaHostOptions = {},
): Plugin {
  const root = resolveRoot(options, process.cwd());
  const snapshotDir = options.snapshotDir?.startsWith("/")
    ? options.snapshotDir
    : join(root, options.snapshotDir ?? DEFAULT_SNAPSHOT_DIR);
  const baselineExists = createCommittedBaselineExists(snapshotDir);
  const mode = resolveBaselinePathMode(options);

  return {
    name: "visual-baseline-visual-delta",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.split("?")[0]?.replace(/\\/g, "/") ?? id;
      const title = extractTitle(code);
      if (!title) return null;
      if (/\.stories\.[cm]?[jt]sx?$/.test(normalized)) {
        const next = injectTypeScriptStoryBaselines(
          code,
          title,
          mode,
          baselineExists,
        );
        if (next === code) return null;
        return { code: next, map: null };
      }
      if (!normalized.includes(".stories.svelte")) return null;
      if (mode === "story-id") {
        const next = injectStoryIdVisualDeltas(code, title, baselineExists);
        if (next === code) return null;
        return { code: next, map: null };
      }

      const formsDir = normalized.match(
        /\/shared\/forms\/(.+)\/[^/]+\.stories\.\w+$/,
      )?.[1];
      const appsDir = normalized.match(
        /\/src\/apps\/(.+)\/[^/]+\.stories\.\w+$/,
      )?.[1];
      const directory =
        normalized.includes("/shared/shadcn/") && title.startsWith("Shadcn/")
          ? `shadcn/${familyFromTitle(title)}`
          : formsDir && title.startsWith("UI Forms/")
            ? `forms/${formsDir}`
            : appsDir && title.startsWith("Apps/")
              ? `apps/${appsDir}`
              : normalized.includes("/packages/tasks/src/") &&
                  title.startsWith("Tasks/")
                ? normalized
                    .replace(/^.*?\/packages\/tasks\/src\//, "tasks/")
                    .replace(/\/[^/]+\.stories\.\w+$/, "")
                : undefined;
      if (!directory) return null;

      const next = injectVisualBaselineVisualDeltas(
        code,
        directory,
        baselineExists,
      );
      if (next === code) return null;
      return { code: next, map: null };
    },
  };
}

export { findStoryOpenTagEnd, sanitizeStoryName } from "./source-utils.js";
