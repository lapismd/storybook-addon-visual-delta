export const VISUAL_CAPTURE_SURFACE_SELECTORS = [
  '[role="dialog"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[data-state="open"]',
].join(", ");

export type VisualCaptureClip = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Measure the story subject plus visible overlay surfaces that paint outside
 * it. This function is intentionally self-contained so Playwright can
 * serialize it directly into `page.evaluate`.
 */
export function measureVisualCaptureClip(
  selectors: string,
  doc: Document = document,
): VisualCaptureClip | null {
  const view = doc.defaultView;
  const root = doc.querySelector("#storybook-root");
  if (!root || !view) return null;
  const subject = root.querySelector(":scope > *") ?? root;
  const subjectRect = subject.getBoundingClientRect();
  const rects: DOMRect[] = [];
  const HtmlElement = (view as Window & { HTMLElement: typeof HTMLElement })
    .HTMLElement;

  for (const node of doc.querySelectorAll(selectors)) {
    if (!(node instanceof HtmlElement)) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const style = view.getComputedStyle(node);
    if (
      style.visibility === "hidden" ||
      style.display === "none" ||
      Number.parseFloat(style.opacity || "1") === 0
    ) {
      continue;
    }

    const outsideRoot = !root.contains(node);
    const extendsSubject =
      rect.left < subjectRect.left - 0.5 ||
      rect.top < subjectRect.top - 0.5 ||
      rect.right > subjectRect.right + 0.5 ||
      rect.bottom > subjectRect.bottom + 0.5;
    if (!outsideRoot && !extendsSubject) continue;
    rects.push(rect);
  }

  if (rects.length === 0) return null;
  rects.unshift(subjectRect);

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of rects) {
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }

  const x = Math.max(0, Math.floor(left));
  const y = Math.max(0, Math.floor(top));
  const width = Math.ceil(right - x);
  const height = Math.ceil(bottom - y);
  if (width < 1 || height < 1) return null;
  return { x, y, width, height };
}
