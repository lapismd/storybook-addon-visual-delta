/** Match Storybook's story-name sanitizer for id slugs. */
export function sanitizeStoryName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ ’–—―′¿'`~!@#$%^&*()_|+\-=?;:'",.<>{}[\]\\/]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

export function findStoryOpenTagEnd(source: string, start: number): number {
  if (!source.startsWith("<Story", start)) return -1;

  let index = start + "<Story".length;
  let braceDepth = 0;
  let quote: '"' | "'" | "`" | null = null;
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];
    const previous = source[index - 1];
    if (quote) {
      if (character === quote && previous !== "\\") quote = null;
      index += 1;
      continue;
    }
    if (character === "/" && next === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      index += 2;
      while (
        index < source.length - 1 &&
        !(source[index] === "*" && source[index + 1] === "/")
      ) {
        index += 1;
      }
      index += 2;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      index += 1;
      continue;
    }
    if (character === "{") braceDepth += 1;
    else if (character === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (braceDepth === 0 && character === ">") return index;
    else if (braceDepth === 0 && character === "/" && next === ">") {
      return index + 1;
    }
    index += 1;
  }
  return -1;
}
