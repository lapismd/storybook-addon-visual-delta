import type { AlignMode } from "../constants.js";

export type StorybookLayoutMode =
  | "padded"
  | "centered"
  | "fullscreen"
  | (string & {});

export type BoxSidesPx = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type RectSnapshot = {
  x: number;
  y: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

export type BackgroundSnapshot = {
  color: string;
  image: string;
  position: string;
  size: string;
  repeat: string;
  attachment: string;
  origin: string;
  clip: string;
};

export type BorderPaintSnapshot = {
  color: BoxSidesString;
  style: BoxSidesString;
};

export type BoxSidesString = {
  top: string;
  right: string;
  bottom: string;
  left: string;
};

export type PreviewBoxSnapshot = {
  rect: RectSnapshot;
  padding: BoxSidesPx;
  border: BoxSidesPx;
  borderPaint: BorderPaintSnapshot;
  background: BackgroundSnapshot;
};

export type PreviewSubjectSnapshot = {
  rect: RectSnapshot;
  margin: BoxSidesPx;
};

/**
 * Settled Storybook preview geometry, measured before Visual Delta inserts or
 * reparents any DOM.
 */
export type PreviewLayoutSnapshot = {
  storyId: string;
  viewport: { width: number; height: number };
  layout: StorybookLayoutMode | null;
  body: PreviewBoxSnapshot;
  root: PreviewBoxSnapshot;
  subject: PreviewSubjectSnapshot | null;
};

function px(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rectSnapshot(rect: DOMRect): RectSnapshot {
  return {
    x: rect.x,
    y: rect.y,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function boxSides(style: CSSStyleDeclaration, prefix: "padding" | "border") {
  if (prefix === "padding") {
    return {
      top: px(style.paddingTop),
      right: px(style.paddingRight),
      bottom: px(style.paddingBottom),
      left: px(style.paddingLeft),
    };
  }
  return {
    top: px(style.borderTopWidth),
    right: px(style.borderRightWidth),
    bottom: px(style.borderBottomWidth),
    left: px(style.borderLeftWidth),
  };
}

function background(style: CSSStyleDeclaration): BackgroundSnapshot {
  return {
    color: style.backgroundColor,
    image: style.backgroundImage,
    position: style.backgroundPosition,
    size: style.backgroundSize,
    repeat: style.backgroundRepeat,
    attachment: style.backgroundAttachment,
    origin: style.backgroundOrigin,
    clip: style.backgroundClip,
  };
}

function boxSnapshot(element: Element, view: Window): PreviewBoxSnapshot {
  const style = view.getComputedStyle(element);
  return {
    rect: rectSnapshot(element.getBoundingClientRect()),
    padding: boxSides(style, "padding"),
    border: boxSides(style, "border"),
    borderPaint: {
      color: {
        top: style.borderTopColor,
        right: style.borderRightColor,
        bottom: style.borderBottomColor,
        left: style.borderLeftColor,
      },
      style: {
        top: style.borderTopStyle,
        right: style.borderRightStyle,
        bottom: style.borderBottomStyle,
        left: style.borderLeftStyle,
      },
    },
    background: background(style),
  };
}

function subjectSnapshot(
  element: Element,
  view: Window,
): PreviewSubjectSnapshot {
  const style = view.getComputedStyle(element);
  return {
    rect: rectSnapshot(element.getBoundingClientRect()),
    margin: {
      top: px(style.marginTop),
      right: px(style.marginRight),
      bottom: px(style.marginBottom),
      left: px(style.marginLeft),
    },
  };
}

/**
 * Measure the current preview document. Callers are responsible for waiting
 * for story completion and stable layout before invoking this function.
 */
export function measurePreviewLayout(
  doc: Document,
  options: {
    storyId: string;
    viewport: { width: number; height: number };
    layout?: StorybookLayoutMode | null;
  },
): PreviewLayoutSnapshot {
  const view = doc.defaultView;
  const root = doc.querySelector("#storybook-root");
  if (!view || !root) {
    throw new Error("Visual Delta: Storybook preview layout is not measurable");
  }
  const subject = root.firstElementChild;
  return {
    storyId: options.storyId,
    viewport: { ...options.viewport },
    layout: options.layout ?? null,
    body: boxSnapshot(doc.body, view),
    root: boxSnapshot(root, view),
    subject: subject ? subjectSnapshot(subject, view) : null,
  };
}

function addSides(...values: BoxSidesPx[]): BoxSidesPx {
  return values.reduce<BoxSidesPx>(
    (total, value) => ({
      top: total.top + value.top,
      right: total.right + value.right,
      bottom: total.bottom + value.bottom,
      left: total.left + value.left,
    }),
    { top: 0, right: 0, bottom: 0, left: 0 },
  );
}

export function bodyOuterInsets(snapshot: PreviewLayoutSnapshot): BoxSidesPx {
  return addSides(snapshot.body.padding, snapshot.body.border);
}

/**
 * Insets absent from a component-clipped PNG. Viewport captures already
 * include all Storybook layout, so reconstruct nothing for them.
 */
export function baselineOuterInsets(
  snapshot: PreviewLayoutSnapshot,
  options: { align: AlignMode; cropToViewport: boolean },
): BoxSidesPx {
  if (options.cropToViewport || options.align === "viewport") {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  return addSides(
    snapshot.body.padding,
    snapshot.body.border,
    snapshot.root.padding,
    snapshot.root.border,
    snapshot.subject?.margin ?? { top: 0, right: 0, bottom: 0, left: 0 },
  );
}

export function totalInsets(insets: BoxSidesPx): {
  x: number;
  y: number;
} {
  return {
    x: insets.left + insets.right,
    y: insets.top + insets.bottom,
  };
}

export function previewLayoutCacheKey(options: {
  storyId: string;
  renderGeneration: number;
  viewport: { width: number; height: number };
}): string {
  return `${options.storyId}:${options.renderGeneration}:${options.viewport.width}x${options.viewport.height}`;
}

/** Serialize a measured background without replacing transparent layers. */
export function backgroundCss(backgroundValue: BackgroundSnapshot): string {
  return [
    backgroundValue.color,
    backgroundValue.image,
    backgroundValue.position,
    "/",
    backgroundValue.size,
    backgroundValue.repeat,
    backgroundValue.attachment,
    backgroundValue.origin,
    backgroundValue.clip,
  ].join(" ");
}
