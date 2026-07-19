import { useChannel, useEffect } from "storybook/preview-api";
import type { DecoratorFunction } from "storybook/internal/types";
import {
  DEFAULT_PASS_THRESHOLD_PERCENT,
  EVENTS,
  type VisualDeltaParams,
} from "../constants.js";
import { normalizeImages } from "./normalize.js";

export const withInitImage: DecoratorFunction = (storyFn, context) => {
  const visualDeltaParams = context.parameters?.visualDelta as
    | VisualDeltaParams
    | undefined;
  const emit = useChannel({});

  useEffect(() => {
    if (visualDeltaParams?.images) {
      const normalizedImages = normalizeImages(
        visualDeltaParams.images,
        visualDeltaParams.anchor,
        visualDeltaParams.offsetX,
        visualDeltaParams.offsetY,
        visualDeltaParams.align,
      );
      emit(EVENTS.INIT_IMAGE, {
        images: normalizedImages,
        storyId: context.id,
        storyName: context.name,
        opacity: visualDeltaParams.opacity ?? 0.5,
        colorInversion: visualDeltaParams.colorInversion ?? false,
        passThresholdPercent:
          visualDeltaParams.passThresholdPercent ??
          DEFAULT_PASS_THRESHOLD_PERCENT,
      });
    } else {
      emit(EVENTS.INIT_IMAGE, {
        images: [],
        storyId: context.id,
        storyName: context.name,
        opacity: visualDeltaParams?.opacity ?? 0.5,
        colorInversion: visualDeltaParams?.colorInversion ?? false,
        passThresholdPercent:
          visualDeltaParams?.passThresholdPercent ??
          DEFAULT_PASS_THRESHOLD_PERCENT,
      });
    }
  }, [visualDeltaParams?.images, context.id, context.name, emit]);

  return storyFn();
};
