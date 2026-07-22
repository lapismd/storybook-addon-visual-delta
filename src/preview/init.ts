import { useChannel, useEffect } from "storybook/preview-api";
import type { DecoratorFunction } from "storybook/internal/types";
import {
  DEFAULT_PASS_THRESHOLD_PERCENT,
  DEFAULT_PLACEMENT,
  EVENTS,
  isSplitPlacement,
  normalizePlacement,
  type VisualDeltaParams,
} from "../constants.js";
import { normalizeImages } from "./normalize.js";

function buildInitPayload(
  context: {
    id: string;
    name: string;
  },
  visualDeltaParams: VisualDeltaParams | undefined,
) {
  if (visualDeltaParams?.images) {
    const normalizedImages = normalizeImages(
      visualDeltaParams.images,
      visualDeltaParams.anchor,
      visualDeltaParams.offsetX,
      visualDeltaParams.offsetY,
      visualDeltaParams.align,
      visualDeltaParams.placement,
    );
    const placement = normalizePlacement(
      normalizedImages[0]?.placement ??
        visualDeltaParams.placement ??
        DEFAULT_PLACEMENT,
    );
    return {
      images: normalizedImages,
      interactions: visualDeltaParams.interactions ?? [],
      storyId: context.id,
      storyName: context.name,
      opacity:
        visualDeltaParams.opacity ?? (isSplitPlacement(placement) ? 1 : 0.5),
      colorInversion: visualDeltaParams.colorInversion ?? false,
      placement,
      passThresholdPercent:
        visualDeltaParams.passThresholdPercent ??
        DEFAULT_PASS_THRESHOLD_PERCENT,
    };
  }
  const placement = normalizePlacement(
    visualDeltaParams?.placement ?? DEFAULT_PLACEMENT,
  );
  return {
    images: [] as ReturnType<typeof normalizeImages>,
    interactions: visualDeltaParams?.interactions ?? [],
    storyId: context.id,
    storyName: context.name,
    opacity:
      visualDeltaParams?.opacity ?? (isSplitPlacement(placement) ? 1 : 0.5),
    colorInversion: visualDeltaParams?.colorInversion ?? false,
    placement,
    passThresholdPercent:
      visualDeltaParams?.passThresholdPercent ??
      DEFAULT_PASS_THRESHOLD_PERCENT,
  };
}

export const withInitImage: DecoratorFunction = (storyFn, context) => {
  const visualDeltaParams = context.parameters?.visualDelta as
    | VisualDeltaParams
    | undefined;
  const emit = useChannel({
    [EVENTS.REQUEST_INIT_IMAGE]: (payload?: { storyId?: string }) => {
      if (payload?.storyId && payload.storyId !== context.id) return;
      emit(
        EVENTS.INIT_IMAGE,
        buildInitPayload(
          { id: context.id, name: context.name },
          context.parameters?.visualDelta as VisualDeltaParams | undefined,
        ),
      );
    },
  });

  useEffect(() => {
    emit(
      EVENTS.INIT_IMAGE,
      buildInitPayload({ id: context.id, name: context.name }, visualDeltaParams),
    );
  }, [
    visualDeltaParams?.images,
    visualDeltaParams?.interactions,
    context.id,
    context.name,
    emit,
  ]);

  return storyFn();
};
