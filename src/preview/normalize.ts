import type {
  AlignMode,
  PlacementMode,
  VisualDeltaImage,
  VisualDeltaParams,
} from "../constants.js";
import { DEFAULT_PLACEMENT, normalizePlacement } from "../constants.js";
import { imagesFromModes, type VisualDeltaModes } from "../shared/modes.js";

export function normalizeImages(
  images: NonNullable<VisualDeltaParams["images"]>,
  globalAnchor?: string,
  globalOffsetX?: number,
  globalOffsetY?: number,
  globalAlign?: AlignMode,
  globalPlacement?: VisualDeltaParams["placement"],
): VisualDeltaImage[] {
  const imagesArray = Array.isArray(images) ? images : [images];
  const defaultAlign: AlignMode = globalAlign ?? "viewport";
  const defaultPlacement = normalizePlacement(
    globalPlacement ?? DEFAULT_PLACEMENT,
  );
  return imagesArray.map((item) => {
    if (typeof item === "string") {
      return {
        src: item,
        anchor: globalAnchor,
        offsetX: globalOffsetX ?? 0,
        offsetY: globalOffsetY ?? 0,
        align: defaultAlign,
        placement: defaultPlacement,
      };
    }
    return {
      src: item.src,
      anchor: item.anchor ?? globalAnchor,
      offsetX: item.offsetX ?? globalOffsetX ?? 0,
      offsetY: item.offsetY ?? globalOffsetY ?? 0,
      align: item.align ?? defaultAlign,
      placement: normalizePlacement(item.placement ?? defaultPlacement),
      ...(item.deviceScaleFactor != null
        ? { deviceScaleFactor: item.deviceScaleFactor }
        : {}),
      ...(item.viewport ? { viewport: item.viewport } : {}),
      ...(item.mode ? { mode: item.mode } : {}),
    };
  });
}

/** Merge primary `images` with mode `src` baselines (modes appended). */
export function normalizeImagesWithModes(
  params: VisualDeltaParams | undefined,
): VisualDeltaImage[] {
  const primary = params?.images
    ? normalizeImages(
        params.images,
        params.anchor,
        params.offsetX,
        params.offsetY,
        params.align,
        params.placement,
      )
    : [];
  const fromModes = imagesFromModes(
    params?.modes as VisualDeltaModes | undefined,
    {
      align: params?.align,
      placement: params?.placement,
      anchor: params?.anchor,
      offsetX: params?.offsetX,
      offsetY: params?.offsetY,
      primarySrc: primary[0]?.src,
    },
  );
  const modeImages = normalizeImages(
    fromModes.map((m) => ({
      src: m.src,
      mode: m.mode,
      align: m.align,
      placement: m.placement as PlacementMode | undefined,
      anchor: m.anchor,
      offsetX: m.offsetX,
      offsetY: m.offsetY,
    })),
    params?.anchor,
    params?.offsetX,
    params?.offsetY,
    params?.align,
    params?.placement,
  );
  const seen = new Set(primary.map((img) => img.src));
  const merged = [...primary];
  for (const img of modeImages) {
    if (seen.has(img.src)) continue;
    seen.add(img.src);
    merged.push(img);
  }
  return merged;
}
