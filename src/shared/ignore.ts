/** DOM markers recognized as ignore regions (Chromatic-compatible + local). */
export const VISUAL_DELTA_IGNORE_ATTR = "data-visual-delta-ignore";
export const CHROMATIC_IGNORE_ATTR = "data-chromatic";
export const CHROMATIC_IGNORE_CLASS = "chromatic-ignore";

/** Built-in selectors always treated as ignore regions when present. */
export const BUILTIN_IGNORE_SELECTORS = [
  `[${VISUAL_DELTA_IGNORE_ATTR}]`,
  `[${CHROMATIC_IGNORE_ATTR}="ignore"]`,
  `.${CHROMATIC_IGNORE_CLASS}`,
] as const;

export function resolveIgnoreSelectors(
  fromParams: readonly string[] | undefined,
): string[] {
  const custom = (fromParams ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sel of [...BUILTIN_IGNORE_SELECTORS, ...custom]) {
    if (seen.has(sel)) continue;
    seen.add(sel);
    out.push(sel);
  }
  return out;
}

/** Count distinct elements, tolerating malformed custom selectors. */
export function countIgnoredElements(
  root: ParentNode,
  selectors: readonly string[],
): number {
  const matches = new Set<Element>();
  for (const selector of selectors) {
    try {
      for (const element of root.querySelectorAll(selector)) {
        matches.add(element);
      }
    } catch {
      // One invalid custom selector must not hide valid ignore-region feedback.
    }
  }
  return matches.size;
}

export const HIGHLIGHT_IGNORE_STYLE_ID = "visual-delta-highlight-ignore";

export function highlightIgnoreCss(selectors: readonly string[]): string {
  if (selectors.length === 0) return "";
  const joined = selectors.join(",\n");
  return `
${joined} {
  outline: 2px dashed #ff2982 !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 4px rgba(255, 41, 130, 0.25) !important;
}
`;
}
