/** Counted-line metric for VD-ARCH-006. Physical minus blank minus comment-only. */

export function physicalLines(text) {
  if (text.length === 0) return 0;
  const lines = text.split("\n");
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

export function countedLines(text) {
  let inBlock = false;
  let inHtml = false;
  let n = 0;
  const lines = text.length === 0 ? [] : text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  for (const line of lines) {
    const s = line.trim();
    if (inBlock) {
      if (s.includes("*/")) inBlock = false;
      continue;
    }
    if (inHtml) {
      if (s.includes("-->")) inHtml = false;
      continue;
    }
    if (s === "") continue;
    if (s.startsWith("/*")) {
      if (!s.includes("*/")) inBlock = true;
      continue;
    }
    if (s.startsWith("<!--")) {
      if (!s.includes("-->")) inHtml = true;
      continue;
    }
    if (s.startsWith("//")) continue;
    if (s.startsWith("*") && !/[{};,]/.test(s) && !/^\*(?:[.#:\[]|\/)/.test(s))
      continue;
    n += 1;
  }
  return n;
}

const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script>/giu;
const STYLE_RE = /<style\b[^>]*>[\s\S]*?<\/style>/giu;

export function svelteRegions(text) {
  const scripts = [...text.matchAll(SCRIPT_RE)].map((match) => match[0]);
  const styles = [...text.matchAll(STYLE_RE)].map((match) => match[0]);
  const markup = text.replace(SCRIPT_RE, "\n").replace(STYLE_RE, "\n");
  return {
    scriptCounted: scripts.reduce((sum, chunk) => sum + countedLines(chunk), 0),
    markupCounted: countedLines(markup),
    stylePhysical: styles.reduce((sum, chunk) => sum + physicalLines(chunk), 0),
  };
}
