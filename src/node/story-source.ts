import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  VISUAL_REVIEW_TAGS,
  normalizeVisualStoryTags,
  visualReviewTagFor,
  type VisualReviewStatus,
} from "../constants.js";
import { visualBaselineVisualDeltaParameter } from "./baseline-design.js";
import { findStoryOpenTagEnd, sanitizeStoryName } from "./source-utils.js";
import type { BaselinePathMode } from "./options.js";
import { baselinePublicUrl, type StoryIndexEntry } from "./snapshot-paths.js";
import {
  loadStoryIndex,
  syncStaticIndexReviewStatus,
  syncStaticIndexSkipVisual,
} from "./visual-sidecars.js";

export type StorySourceMutation =
  | { kind: "skip"; skip: boolean }
  | { kind: "review"; status: VisualReviewStatus }
  | { kind: "clear-review" }
  | {
      kind: "baseline";
      url: string;
      /** When set, review tags are normalized to this status in the same write. */
      reviewStatus?: VisualReviewStatus;
    }
  | {
      kind: "interaction";
      interaction: { id: string; label: string; src: string };
      /** When set, review tags are normalized to this status in the same write. */
      reviewStatus?: VisualReviewStatus;
    }
  | {
      kind: "remove-baseline";
      url: string;
      /** Present for a named mid-play capture; absent for a primary image. */
      interactionId?: string;
    };
function resolveStoriesPath(
  packageRoot: string,
  importPath: string,
): string | null {
  const normalized = importPath.replace(/\\/g, "/").replace(/^\.\//, "");
  const absolute = path.join(packageRoot, normalized);
  return existsSync(absolute) ? absolute : null;
}

function parseStringArray(source: string): string[] {
  return [...source.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]!);
}

function nextTags(
  current: string[],
  mutation: Extract<
    StorySourceMutation,
    { kind: "skip" | "review" | "clear-review" }
  >,
): string[] {
  return normalizeVisualStoryTags(
    current,
    mutation.kind === "skip"
      ? { kind: "skip", skip: mutation.skip }
      : mutation.kind === "review"
        ? { kind: "review", status: mutation.status }
        : { kind: "clear-review" },
  );
}

function storyNameCandidates(openTag: string): string[] {
  const candidates: string[] = [];
  const name = openTag.match(/\bname=["']([^"']+)["']/)?.[1];
  const exportName = openTag.match(/\bexportName=["']([^"']+)["']/)?.[1];
  if (name) candidates.push(name);
  if (exportName) candidates.push(exportName);
  return candidates;
}

function svelteStoryMatches(openTag: string, entry: StoryIndexEntry): boolean {
  const slug = entry.id.split("--").slice(1).join("--");
  return storyNameCandidates(openTag).some(
    (candidate) => sanitizeStoryName(candidate) === slug,
  );
}

function findVisualDeltaObjectRange(
  openTag: string,
): { start: number; end: number } | null {
  const key = openTag.match(/\bvisualDelta\s*:\s*/);
  if (!key || key.index == null) return null;
  const start = key.index + key[0].length;
  if (openTag[start] !== "{") return null;
  const end = findBalancedEnd(openTag, start, "{", "}");
  if (end < 0) return null;
  return { start, end: end + 1 };
}

function parseVisualDeltaObjectLiteral(
  objectText: string,
): Record<string, unknown> | null {
  try {
    return JSON.parse(objectText) as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  try {
    const normalized = objectText
      .replace(/([{\[,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
      .replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(normalized) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function visualImageSource(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { src?: unknown }).src === "string"
  ) {
    return (value as { src: string }).src;
  }
  return null;
}

function removeVisualDeltaBaseline(
  visualDelta: Record<string, unknown>,
  mutation: Extract<StorySourceMutation, { kind: "remove-baseline" }>,
): boolean {
  if (mutation.interactionId) {
    if (!Array.isArray(visualDelta.interactions)) return false;
    const interactions = visualDelta.interactions as Array<
      Record<string, unknown>
    >;
    const next = interactions.filter(
      (item) =>
        item?.id !== mutation.interactionId &&
        visualImageSource(item) !== mutation.url,
    );
    if (next.length === interactions.length) return false;
    if (next.length) visualDelta.interactions = next;
    else delete visualDelta.interactions;
    return true;
  }

  let changed = false;
  if (Array.isArray(visualDelta.images)) {
    const images = visualDelta.images as unknown[];
    const next = images.filter(
      (image) => visualImageSource(image) !== mutation.url,
    );
    if (next.length !== images.length) {
      changed = true;
      if (next.length) visualDelta.images = next;
      else delete visualDelta.images;
    }
  }

  if (
    visualDelta.modes &&
    typeof visualDelta.modes === "object" &&
    !Array.isArray(visualDelta.modes)
  ) {
    for (const [name, value] of Object.entries(
      visualDelta.modes as Record<string, unknown>,
    )) {
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        visualImageSource(value) !== mutation.url
      ) {
        continue;
      }
      const nextMode = { ...(value as Record<string, unknown>) };
      delete nextMode.src;
      (visualDelta.modes as Record<string, unknown>)[name] = nextMode;
      changed = true;
    }
  }
  return changed;
}

function mutateSvelteOpenTag(
  openTag: string,
  mutation: StorySourceMutation,
): string {
  if (mutation.kind === "baseline") {
    let next = openTag;
    if (!(openTag.includes("skip-visual") || openTag.includes(mutation.url))) {
      const visualDelta = JSON.stringify(
        visualBaselineVisualDeltaParameter(mutation.url),
      );
      if (/\bvisualDelta\s*:/.test(openTag)) {
        const match = /\bimages\s*:\s*\[/.exec(openTag);
        if (match) {
          const start = openTag.indexOf("[", match.index);
          const end = findBalancedEnd(openTag, start, "[", "]");
          if (end >= 0) {
            const inside = openTag.slice(start + 1, end).trim();
            const appended = inside
              ? `${inside.replace(/,\s*$/, "")}, ${JSON.stringify(mutation.url)}`
              : JSON.stringify(mutation.url);
            next = `${openTag.slice(0, start + 1)}${appended}${openTag.slice(end)}`;
          }
        }
      } else {
        const parametersIndex = openTag.indexOf("parameters={{");
        if (parametersIndex >= 0) {
          const insert = parametersIndex + "parameters={{".length;
          next = `${openTag.slice(0, insert)}\n    visualDelta: ${visualDelta},${openTag.slice(insert)}`;
        } else {
          const attribute = `\n  parameters={{\n    visualDelta: ${visualDelta},\n  }}`;
          const closeLength = openTag.endsWith("/>") ? 2 : 1;
          next = `${openTag.slice(0, -closeLength)}${attribute}\n${openTag.slice(-closeLength)}`;
        }
      }
    }
    if (mutation.reviewStatus) {
      next = mutateSvelteOpenTag(next, {
        kind: "review",
        status: mutation.reviewStatus,
      });
    }
    return next;
  }

  if (mutation.kind === "interaction") {
    if (openTag.includes("skip-visual")) return openTag;
    const range = findVisualDeltaObjectRange(openTag);
    if (!range) return openTag;
    const parsed = parseVisualDeltaObjectLiteral(
      openTag.slice(range.start, range.end),
    );
    if (!parsed) return openTag;
    const existing = Array.isArray(parsed.interactions)
      ? (parsed.interactions as Array<Record<string, unknown>>)
      : [];
    const without = existing.filter(
      (item) => item?.id !== mutation.interaction.id,
    );
    without.push({ ...mutation.interaction });
    parsed.interactions = without;
    let next =
      openTag.slice(0, range.start) +
      JSON.stringify(parsed) +
      openTag.slice(range.end);
    if (mutation.reviewStatus) {
      next = mutateSvelteOpenTag(next, {
        kind: "review",
        status: mutation.reviewStatus,
      });
    }
    return next;
  }

  if (mutation.kind === "remove-baseline") {
    const range = findVisualDeltaObjectRange(openTag);
    if (!range) return openTag;
    const parsed = parseVisualDeltaObjectLiteral(
      openTag.slice(range.start, range.end),
    );
    if (!parsed || !removeVisualDeltaBaseline(parsed, mutation)) {
      return openTag;
    }
    return (
      openTag.slice(0, range.start) +
      JSON.stringify(parsed) +
      openTag.slice(range.end)
    );
  }

  const match = /\btags=\{\[([\s\S]*?)\]\}/.exec(openTag);
  const tags = nextTags(
    match ? parseStringArray(match[1] ?? "") : [],
    mutation,
  );
  if (match) {
    if (tags.length === 0) {
      return openTag.replace(/\s*tags=\{\[[\s\S]*?\]\}/, "");
    }
    return openTag.replace(
      match[0],
      `tags={[${tags.map((tag) => JSON.stringify(tag)).join(", ")}]}`,
    );
  }
  if (tags.length === 0) return openTag;
  const attribute = `\n  tags={[${tags.map((tag) => JSON.stringify(tag)).join(", ")}]}`;
  const closeLength = openTag.endsWith("/>") ? 2 : 1;
  return `${openTag.slice(0, -closeLength)}${attribute}\n${openTag.slice(-closeLength)}`;
}

function patchSvelteStory(
  source: string,
  entry: StoryIndexEntry,
  mutation: StorySourceMutation,
): string {
  let output = "";
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf("<Story", cursor);
    if (start < 0) return output + source.slice(cursor);
    output += source.slice(cursor, start);
    const end = findStoryOpenTagEnd(source, start);
    if (end < 0) return output + source.slice(start);
    const openTag = source.slice(start, end + 1);
    output += svelteStoryMatches(openTag, entry)
      ? mutateSvelteOpenTag(openTag, mutation)
      : openTag;
    cursor = end + 1;
  }
  return output;
}

function findBalancedEnd(
  source: string,
  start: number,
  open: string,
  close: string,
): number {
  if (source[start] !== open) return -1;
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]!;
    const next = source[index + 1];
    const previous = source[index - 1];
    if (quote) {
      if (character === quote && previous !== "\\") quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "/" && next === "/") {
      index = source.indexOf("\n", index + 2);
      if (index < 0) return -1;
      continue;
    }
    if (character === "/" && next === "*") {
      const commentEnd = source.indexOf("*/", index + 2);
      if (commentEnd < 0) return -1;
      index = commentEnd + 1;
      continue;
    }
    if (character === open) depth += 1;
    if (character === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

type ObjectProperty = {
  keyStart: number;
  valueStart: number;
  valueEnd: number;
};

function findTopLevelProperty(
  objectText: string,
  key: string,
): ObjectProperty | null {
  let braces = 0;
  let brackets = 0;
  let parentheses = 0;
  let quote: "'" | '"' | "`" | null = null;
  for (let index = 1; index < objectText.length - 1; index += 1) {
    const character = objectText[index]!;
    const next = objectText[index + 1];
    const previous = objectText[index - 1];
    if (quote) {
      if (character === quote && previous !== "\\") quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "/" && next === "/") {
      const lineEnd = objectText.indexOf("\n", index + 2);
      if (lineEnd < 0) return null;
      index = lineEnd;
      continue;
    }
    if (character === "/" && next === "*") {
      const commentEnd = objectText.indexOf("*/", index + 2);
      if (commentEnd < 0) return null;
      index = commentEnd + 1;
      continue;
    }
    if (character === "{") braces += 1;
    else if (character === "}") braces -= 1;
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets -= 1;
    else if (character === "(") parentheses += 1;
    else if (character === ")") parentheses -= 1;
    if (braces !== 0 || brackets !== 0 || parentheses !== 0) continue;

    if (!/[A-Za-z_$]/.test(character)) continue;
    const match = /^[A-Za-z_$][\w$]*/.exec(objectText.slice(index));
    if (!match || match[0] !== key) continue;
    let cursor = index + match[0].length;
    while (/\s/.test(objectText[cursor] ?? "")) cursor += 1;
    if (objectText[cursor] !== ":") continue;
    cursor += 1;
    while (/\s/.test(objectText[cursor] ?? "")) cursor += 1;
    const valueStart = cursor;
    let valueEnd = objectText.length - 1;
    let childBraces = 0;
    let childBrackets = 0;
    let childParentheses = 0;
    let childQuote: "'" | '"' | "`" | null = null;
    for (; cursor < objectText.length - 1; cursor += 1) {
      const valueCharacter = objectText[cursor]!;
      const valueNext = objectText[cursor + 1];
      const valuePrevious = objectText[cursor - 1];
      if (childQuote) {
        if (valueCharacter === childQuote && valuePrevious !== "\\") {
          childQuote = null;
        }
        continue;
      }
      if (
        valueCharacter === "'" ||
        valueCharacter === '"' ||
        valueCharacter === "`"
      ) {
        childQuote = valueCharacter;
        continue;
      }
      if (valueCharacter === "/" && valueNext === "/") {
        const lineEnd = objectText.indexOf("\n", cursor + 2);
        if (lineEnd < 0) break;
        cursor = lineEnd;
        continue;
      }
      if (valueCharacter === "/" && valueNext === "*") {
        const commentEnd = objectText.indexOf("*/", cursor + 2);
        if (commentEnd < 0) break;
        cursor = commentEnd + 1;
        continue;
      }
      if (valueCharacter === "{") childBraces += 1;
      else if (valueCharacter === "}") childBraces -= 1;
      else if (valueCharacter === "[") childBrackets += 1;
      else if (valueCharacter === "]") childBrackets -= 1;
      else if (valueCharacter === "(") childParentheses += 1;
      else if (valueCharacter === ")") childParentheses -= 1;
      if (
        valueCharacter === "," &&
        childBraces === 0 &&
        childBrackets === 0 &&
        childParentheses === 0
      ) {
        valueEnd = cursor;
        break;
      }
    }
    return { keyStart: index, valueStart, valueEnd };
  }
  return null;
}

function insertObjectProperty(objectText: string, property: string): string {
  const compact = objectText.slice(1, -1).trim().length === 0;
  return compact
    ? `{\n  ${property},\n}`
    : `{\n  ${property},${objectText.slice(1)}`;
}

function mutateTsTags(
  objectText: string,
  mutation: Extract<
    StorySourceMutation,
    { kind: "skip" | "review" | "clear-review" }
  >,
): string {
  const property = findTopLevelProperty(objectText, "tags");
  const current =
    property && objectText[property.valueStart] === "["
      ? parseStringArray(
          objectText.slice(property.valueStart, property.valueEnd),
        )
      : [];
  const tags = nextTags(current, mutation);
  const literal = `[${tags.map((tag) => JSON.stringify(tag)).join(", ")}]`;
  if (!property) {
    return tags.length === 0
      ? objectText
      : insertObjectProperty(objectText, `tags: ${literal}`);
  }
  return `${objectText.slice(0, property.valueStart)}${literal}${objectText.slice(property.valueEnd)}`;
}

function mutateTsBaseline(objectText: string, url: string): string {
  if (objectText.includes("skip-visual") || objectText.includes(url)) {
    return objectText;
  }
  const visualDelta = JSON.stringify(visualBaselineVisualDeltaParameter(url));
  const parameters = findTopLevelProperty(objectText, "parameters");
  if (!parameters) {
    return insertObjectProperty(
      objectText,
      `parameters: { visualDelta: ${visualDelta} }`,
    );
  }
  if (objectText[parameters.valueStart] !== "{") return objectText;
  const end = findBalancedEnd(objectText, parameters.valueStart, "{", "}");
  if (end < 0) return objectText;
  const parametersObject = objectText.slice(parameters.valueStart, end + 1);
  if (findTopLevelProperty(parametersObject, "visualDelta")) return objectText;
  const next = insertObjectProperty(
    parametersObject,
    `visualDelta: ${visualDelta}`,
  );
  return `${objectText.slice(0, parameters.valueStart)}${next}${objectText.slice(end + 1)}`;
}

function mutateTsInteraction(
  objectText: string,
  interaction: { id: string; label: string; src: string },
): string {
  if (objectText.includes("skip-visual")) return objectText;
  const parameters = findTopLevelProperty(objectText, "parameters");
  if (!parameters || objectText[parameters.valueStart] !== "{")
    return objectText;
  const end = findBalancedEnd(objectText, parameters.valueStart, "{", "}");
  if (end < 0) return objectText;
  const parametersObject = objectText.slice(parameters.valueStart, end + 1);
  const visualDelta = findTopLevelProperty(parametersObject, "visualDelta");
  if (!visualDelta || parametersObject[visualDelta.valueStart] !== "{") {
    return objectText;
  }
  const vdEnd = findBalancedEnd(
    parametersObject,
    visualDelta.valueStart,
    "{",
    "}",
  );
  if (vdEnd < 0) return objectText;
  const vdText = parametersObject.slice(visualDelta.valueStart, vdEnd + 1);
  const parsed = parseVisualDeltaObjectLiteral(vdText);
  if (!parsed) return objectText;
  const existing = Array.isArray(parsed.interactions)
    ? (parsed.interactions as Array<Record<string, unknown>>)
    : [];
  const without = existing.filter((item) => item?.id !== interaction.id);
  without.push({ ...interaction });
  parsed.interactions = without;
  const nextVd = JSON.stringify(parsed);
  const nextParameters =
    parametersObject.slice(0, visualDelta.valueStart) +
    nextVd +
    parametersObject.slice(vdEnd + 1);
  return (
    objectText.slice(0, parameters.valueStart) +
    nextParameters +
    objectText.slice(end + 1)
  );
}

function mutateTsRemoveBaseline(
  objectText: string,
  mutation: Extract<StorySourceMutation, { kind: "remove-baseline" }>,
): string {
  const parameters = findTopLevelProperty(objectText, "parameters");
  if (!parameters || objectText[parameters.valueStart] !== "{") {
    return objectText;
  }
  const end = findBalancedEnd(objectText, parameters.valueStart, "{", "}");
  if (end < 0) return objectText;
  const parametersObject = objectText.slice(parameters.valueStart, end + 1);
  const visualDelta = findTopLevelProperty(parametersObject, "visualDelta");
  if (!visualDelta || parametersObject[visualDelta.valueStart] !== "{") {
    return objectText;
  }
  const vdEnd = findBalancedEnd(
    parametersObject,
    visualDelta.valueStart,
    "{",
    "}",
  );
  if (vdEnd < 0) return objectText;
  const vdText = parametersObject.slice(visualDelta.valueStart, vdEnd + 1);
  const parsed = parseVisualDeltaObjectLiteral(vdText);
  if (!parsed || !removeVisualDeltaBaseline(parsed, mutation)) {
    return objectText;
  }
  const nextParameters =
    parametersObject.slice(0, visualDelta.valueStart) +
    JSON.stringify(parsed) +
    parametersObject.slice(vdEnd + 1);
  return (
    objectText.slice(0, parameters.valueStart) +
    nextParameters +
    objectText.slice(end + 1)
  );
}

function exportNameSlug(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type TsStoryRange = {
  exportName: string;
  objectStart: number;
  objectEnd: number;
};

function findTsStoryRanges(source: string): TsStoryRange[] {
  const ranges: TsStoryRange[] = [];
  const pattern = /export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*/g;
  for (const match of source.matchAll(pattern)) {
    const start = (match.index ?? 0) + match[0].length;
    if (source[start] !== "{") continue;
    const end = findBalancedEnd(source, start, "{", "}");
    if (end < 0) continue;
    ranges.push({
      exportName: match[1]!,
      objectStart: start,
      objectEnd: end + 1,
    });
  }
  return ranges;
}

function tsStoryMatches(range: TsStoryRange, entry: StoryIndexEntry): boolean {
  if (entry.exportName) return entry.exportName === range.exportName;
  const slug = entry.id.split("--").slice(1).join("--");
  return exportNameSlug(range.exportName) === slug;
}

function patchTsStory(
  source: string,
  entry: StoryIndexEntry,
  mutation: StorySourceMutation,
): string {
  const range = findTsStoryRanges(source).find((candidate) =>
    tsStoryMatches(candidate, entry),
  );
  if (!range) return source;
  const objectText = source.slice(range.objectStart, range.objectEnd);
  let next = objectText;
  if (mutation.kind === "baseline") {
    next = mutateTsBaseline(objectText, mutation.url);
    if (mutation.reviewStatus) {
      next = mutateTsTags(next, {
        kind: "review",
        status: mutation.reviewStatus,
      });
    }
  } else if (mutation.kind === "interaction") {
    next = mutateTsInteraction(objectText, mutation.interaction);
    if (mutation.reviewStatus) {
      next = mutateTsTags(next, {
        kind: "review",
        status: mutation.reviewStatus,
      });
    }
  } else if (mutation.kind === "remove-baseline") {
    next = mutateTsRemoveBaseline(objectText, mutation);
  } else {
    next = mutateTsTags(objectText, mutation);
  }
  return `${source.slice(0, range.objectStart)}${next}${source.slice(range.objectEnd)}`;
}

export function patchStorySourceText(
  source: string,
  entry: StoryIndexEntry,
  mutation: StorySourceMutation,
): string {
  return entry.importPath?.endsWith(".stories.svelte")
    ? patchSvelteStory(source, entry, mutation)
    : patchTsStory(source, entry, mutation);
}

function patchStoryFile(
  packageRoot: string,
  entry: StoryIndexEntry,
  mutation: StorySourceMutation,
): boolean {
  if (!entry.importPath) return false;
  const filePath = resolveStoriesPath(packageRoot, entry.importPath);
  if (!filePath) return false;
  const source = readFileSync(filePath, "utf8");
  const next = patchStorySourceText(source, entry, mutation);
  if (next === source) return false;
  writeFileSync(filePath, next, "utf8");
  return true;
}

export function patchStorySkipVisual(options: {
  packageRoot: string;
  storyId: string;
  skip: boolean;
}): {
  ok: boolean;
  storyId: string;
  skip: boolean;
  error?: string;
} {
  const entry = loadStoryIndex(options.packageRoot)[options.storyId];
  if (!entry?.importPath) {
    return {
      ok: false,
      storyId: options.storyId,
      skip: options.skip,
      error: `Story not found in index: ${options.storyId}`,
    };
  }
  const changed = patchStoryFile(options.packageRoot, entry, {
    kind: "skip",
    skip: options.skip,
  });
  // CSF may already match; always normalize the static index (and clear review
  // tags when skipping) so --skip-build create/include paths stay consistent.
  syncStaticIndexSkipVisual(
    options.packageRoot,
    [options.storyId],
    options.skip,
  );
  if (!changed && (entry.tags ?? []).includes("skip-visual") !== options.skip) {
    return {
      ok: false,
      storyId: options.storyId,
      skip: options.skip,
      error: `Could not patch story source for ${options.storyId}`,
    };
  }
  return { ok: true, storyId: options.storyId, skip: options.skip };
}

export function patchStoryVisualReviewStatus(options: {
  packageRoot: string;
  storyId: string;
  status: VisualReviewStatus;
}): {
  ok: boolean;
  storyId: string;
  status: VisualReviewStatus;
  error?: string;
} {
  const entry = loadStoryIndex(options.packageRoot)[options.storyId];
  if (!entry?.importPath) {
    return {
      ok: false,
      storyId: options.storyId,
      status: options.status,
      error: `Story not found in index: ${options.storyId}`,
    };
  }
  if ((entry.tags ?? []).includes("skip-visual")) {
    return {
      ok: false,
      storyId: options.storyId,
      status: options.status,
      error: "Cannot set review status on skip-visual stories",
    };
  }
  const desired = visualReviewTagFor(options.status);
  const presentReviewTags = (entry.tags ?? []).filter((tag) =>
    (VISUAL_REVIEW_TAGS as readonly string[]).includes(tag),
  );
  // Only skip the write when the desired tag is alone — otherwise strip
  // stale siblings (e.g. visual-failed lingering next to visual-ready).
  if (presentReviewTags.length === 1 && presentReviewTags[0] === desired) {
    syncStaticIndexReviewStatus(options.packageRoot, [
      { storyId: options.storyId, status: options.status },
    ]);
    return { ok: true, storyId: options.storyId, status: options.status };
  }
  const changed = patchStoryFile(options.packageRoot, entry, {
    kind: "review",
    status: options.status,
  });
  if (!changed) {
    return {
      ok: false,
      storyId: options.storyId,
      status: options.status,
      error: `Could not patch story source for ${options.storyId}`,
    };
  }
  syncStaticIndexReviewStatus(options.packageRoot, [
    { storyId: options.storyId, status: options.status },
  ]);
  return { ok: true, storyId: options.storyId, status: options.status };
}

export function patchStoryBaselineImages(options: {
  packageRoot: string;
  storyId: string;
  url: string;
  /** Defaults to `ready` — create/update clear `visual-pending` and siblings. */
  reviewStatus?: VisualReviewStatus;
}): { ok: boolean; storyId: string; error?: string } {
  const entry = loadStoryIndex(options.packageRoot)[options.storyId];
  if (!entry?.importPath) {
    return {
      ok: false,
      storyId: options.storyId,
      error: `Story not found in index: ${options.storyId}`,
    };
  }
  if ((entry.tags ?? []).includes("skip-visual")) {
    return {
      ok: false,
      storyId: options.storyId,
      error: "Cannot wire baselines on skip-visual stories",
    };
  }
  const reviewStatus = options.reviewStatus ?? "ready";
  patchStoryFile(options.packageRoot, entry, {
    kind: "baseline",
    url: options.url,
    reviewStatus,
  });
  // Always normalize index tags — CSF may already have the URL/tag pair.
  syncStaticIndexReviewStatus(options.packageRoot, [
    { storyId: options.storyId, status: reviewStatus },
  ]);
  return { ok: true, storyId: options.storyId };
}

export function patchStoryInteraction(options: {
  packageRoot: string;
  storyId: string;
  interaction: { id: string; label: string; src: string };
  /** Defaults to `ready` — clears `visual-pending` and other review siblings. */
  reviewStatus?: VisualReviewStatus;
}): { ok: boolean; storyId: string; error?: string } {
  const entry = loadStoryIndex(options.packageRoot)[options.storyId];
  if (!entry?.importPath) {
    return {
      ok: false,
      storyId: options.storyId,
      error: `Story not found in index: ${options.storyId}`,
    };
  }
  if ((entry.tags ?? []).includes("skip-visual")) {
    return {
      ok: false,
      storyId: options.storyId,
      error: "Cannot wire interactions on skip-visual stories",
    };
  }
  const reviewStatus = options.reviewStatus ?? "ready";
  const changed = patchStoryFile(options.packageRoot, entry, {
    kind: "interaction",
    interaction: options.interaction,
    reviewStatus,
  });
  if (!changed) {
    return {
      ok: false,
      storyId: options.storyId,
      error: `Could not patch interaction for ${options.storyId}`,
    };
  }
  syncStaticIndexReviewStatus(options.packageRoot, [
    { storyId: options.storyId, status: reviewStatus },
  ]);
  return { ok: true, storyId: options.storyId };
}

/**
 * Remove one exact primary/interaction reference and invalidate the story's
 * review tag. The PNG is deleted separately only after the middleware has
 * validated that its path belongs to this story.
 */
export function patchStoryRemoveBaseline(options: {
  packageRoot: string;
  storyId: string;
  url: string;
  interactionId?: string;
}): {
  ok: boolean;
  storyId: string;
  sourceUpdated?: boolean;
  error?: string;
} {
  const entry = loadStoryIndex(options.packageRoot)[options.storyId];
  if (!entry?.importPath) {
    return {
      ok: false,
      storyId: options.storyId,
      error: `Story not found in index: ${options.storyId}`,
    };
  }
  const removedReference = patchStoryFile(options.packageRoot, entry, {
    kind: "remove-baseline",
    url: options.url,
    interactionId: options.interactionId,
  });
  const clearedReview = patchStoryFile(options.packageRoot, entry, {
    kind: "clear-review",
  });
  syncStaticIndexReviewStatus(options.packageRoot, [
    { storyId: options.storyId, status: null },
  ]);
  return {
    ok: true,
    storyId: options.storyId,
    sourceUpdated: removedReference || clearedReview,
  };
}

export function injectTypeScriptStoryBaselines(
  source: string,
  title: string,
  mode: BaselinePathMode,
  baselineExists: (url: string) => boolean,
): string {
  let next = source;
  const titleSlug = sanitizeStoryName(title);
  const ranges = findTsStoryRanges(source).reverse();
  for (const range of ranges) {
    const entry: StoryIndexEntry = {
      id: `${titleSlug}--${exportNameSlug(range.exportName)}`,
      exportName: range.exportName,
      importPath: "story.stories.ts",
    };
    const url = baselinePublicUrl(entry, mode);
    if (!baselineExists(url)) continue;
    const objectText = source.slice(range.objectStart, range.objectEnd);
    const updated = mutateTsBaseline(objectText, url);
    next = `${next.slice(0, range.objectStart)}${updated}${next.slice(range.objectEnd)}`;
  }
  return next;
}
