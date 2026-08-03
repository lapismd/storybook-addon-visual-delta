/**
 * Chromatic-style story modes for Visual Delta.
 * A mode is a named combo of Storybook globals (and optional baseline URL).
 */

export type VisualDeltaModeDef = {
  /** Storybook globals applied when this mode is selected (theme, viewport, …). */
  globals?: Record<string, unknown>;
  /** When true, removes a higher-level mode of the same name from the stack. */
  disable?: boolean;
  /** Explicit baseline URL for this mode (gallery entry). */
  src?: string;
};

export type VisualDeltaModes = Record<string, VisualDeltaModeDef>;

/** Resolve the baseline index represented by the mode dropdown. */
export function resolveModeImageSelection(
  images: ReadonlyArray<{ mode?: string }>,
  selectedMode: string | null,
): { index: number; selectedMode: string | null } {
  if (images.length === 0) return { index: -1, selectedMode: null };
  if (selectedMode) {
    const modeIndex = images.findIndex((image) => image.mode === selectedMode);
    if (modeIndex >= 0) return { index: modeIndex, selectedMode };
  }
  const defaultIndex = images.findIndex((image) => !image.mode);
  return {
    index: defaultIndex >= 0 ? defaultIndex : 0,
    selectedMode: null,
  };
}

/** Filesystem / URL slug for a mode name (`Dark Desktop` → `dark-desktop`). */
export function modeBaselineSlug(modeName: string): string {
  return modeName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Stack modes like Chromatic: later levels merge keys; `{ disable: true }`
 * removes a key from the stack.
 */
export function stackModes(
  ...levels: Array<VisualDeltaModes | undefined | null>
): VisualDeltaModes {
  const stacked: VisualDeltaModes = {};
  for (const level of levels) {
    if (!level) continue;
    for (const [name, def] of Object.entries(level)) {
      if (def?.disable) {
        delete stacked[name];
        continue;
      }
      stacked[name] = {
        ...stacked[name],
        ...def,
        globals: {
          ...(stacked[name]?.globals ?? {}),
          ...(def.globals ?? {}),
        },
      };
    }
  }
  return stacked;
}

export function modeNames(modes: VisualDeltaModes | undefined): string[] {
  if (!modes) return [];
  return Object.keys(modes).filter((name) => !modes[name]?.disable);
}

/**
 * Fill a convention-based local mode URL beside a primary Playwright
 * baseline. Explicit `mode.src` always wins.
 */
export function modeBaselineSrc(
  primarySrc: string | undefined,
  modeName: string,
): string | undefined {
  if (!primarySrc || primarySrc.startsWith("data:")) return undefined;
  const slug = modeBaselineSlug(modeName);
  if (!slug) return undefined;
  const match = primarySrc.match(
    /^(.*)(-(?:chromium|firefox|webkit)\.png)([?#].*)?$/i,
  );
  if (!match) return undefined;
  return `${match[1]}--${slug}${match[2]}${match[3] ?? ""}`;
}

/**
 * Build gallery images for modes that declare `src`. Modes without `src` still
 * appear as selectable named modes (globals-only) via the mode selector.
 */
export function imagesFromModes(
  modes: VisualDeltaModes | undefined,
  defaults: {
    align?: "viewport" | "canvas";
    placement?: string;
    anchor?: string;
    offsetX?: number;
    offsetY?: number;
    primarySrc?: string;
  } = {},
): Array<{
  src: string;
  mode: string;
  align?: "viewport" | "canvas";
  placement?: string;
  anchor?: string;
  offsetX?: number;
  offsetY?: number;
}> {
  if (!modes) return [];
  const out: Array<{
    src: string;
    mode: string;
    align?: "viewport" | "canvas";
    placement?: string;
    anchor?: string;
    offsetX?: number;
    offsetY?: number;
  }> = [];
  for (const [name, def] of Object.entries(modes)) {
    if (def?.disable) continue;
    const src = def.src ?? modeBaselineSrc(defaults.primarySrc, name);
    if (!src) continue;
    out.push({
      src,
      mode: name,
      align: defaults.align,
      placement: defaults.placement,
      anchor: defaults.anchor,
      offsetX: defaults.offsetX,
      offsetY: defaults.offsetY,
    });
  }
  return out;
}
