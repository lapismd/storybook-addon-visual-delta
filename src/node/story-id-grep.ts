function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build one Playwright grep that matches only the supplied story-ID test-title
 * leafs. Playwright joins title segments with whitespace internally even
 * though reporters render a `›` separator.
 */
export function playwrightStoryIdGrep(
  storyIds?: readonly string[],
): string | undefined {
  const exact = [
    ...new Set(
      (storyIds ?? []).map((storyId) => storyId.trim()).filter(Boolean),
    ),
  ].map(escapeRegExp);
  if (!exact.length) return undefined;
  const leaf = exact.length === 1 ? exact[0] : `(?:${exact.join("|")})`;
  return `(?:^|\\s)${leaf}$`;
}
