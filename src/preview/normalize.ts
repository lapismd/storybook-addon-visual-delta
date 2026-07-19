import type {
  AlignMode,
  VisualDeltaImage,
  VisualDeltaParams,
} from "../constants.js";

export function normalizeImages(
  images: NonNullable<VisualDeltaParams["images"]>,
  globalAnchor?: string,
  globalOffsetX?: number,
  globalOffsetY?: number,
  globalAlign?: AlignMode,
): VisualDeltaImage[] {
  const imagesArray = Array.isArray(images) ? images : [images];
  const defaultAlign: AlignMode = globalAlign ?? "viewport";
  return imagesArray.map((item) => {
    if (typeof item === "string") {
      return {
        src: item,
        anchor: globalAnchor,
        offsetX: globalOffsetX ?? 0,
        offsetY: globalOffsetY ?? 0,
        align: defaultAlign,
      };
    }
    return {
      src: item.src,
      anchor: item.anchor ?? globalAnchor,
      offsetX: item.offsetX ?? globalOffsetX ?? 0,
      offsetY: item.offsetY ?? globalOffsetY ?? 0,
      align: item.align ?? defaultAlign,
    };
  });
}
