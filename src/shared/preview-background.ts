/**
 * Resolve the painted page/canvas background for Visual Delta compare surfaces.
 * Prefer opaque computed colors from the story canvas, then body/html.
 */
export function resolvePaintedBackground(
  doc: Document,
  preferred?: Element | null,
): string {
  const view = doc.defaultView;
  const fallback = "#ffffff";
  if (!view) return fallback;

  const candidates: Element[] = [];
  if (preferred) candidates.push(preferred);
  if (doc.body) candidates.push(doc.body);
  if (doc.documentElement) candidates.push(doc.documentElement);

  for (const el of candidates) {
    const bg = view.getComputedStyle(el).backgroundColor;
    if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") continue;
    return bg;
  }

  const token = view
    .getComputedStyle(doc.documentElement)
    .getPropertyValue("--background")
    .trim();
  if (token) return token;

  const sb =
    view
      .getComputedStyle(doc.documentElement)
      .getPropertyValue("--sb-color-bg")
      .trim() ||
    view.getComputedStyle(doc.body ?? doc.documentElement).backgroundColor;
  return sb || fallback;
}

/**
 * Convert a CSS color to opaque `rgb(r, g, b)` for canvas fills (html-to-image).
 * Falls back to white when the color is missing or fully transparent.
 */
export function toOpaqueRgb(
  cssColor: string,
  doc: Document = document,
): string {
  const fallback = "#ffffff";
  try {
    const canvas = doc.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback;
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if ((a ?? 0) < 1) return fallback;
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return fallback;
  }
}
