import { useChannel, useEffect } from "storybook/preview-api";
import type { DecoratorFunction } from "storybook/internal/types";
import {
  DEFAULT_DIFF_THRESHOLD,
  DEFAULT_PASS_THRESHOLD_PERCENT,
  DEFAULT_PLACEMENT,
  EVENTS,
  isSplitPlacement,
  normalizePlacement,
  type VisualDeltaParams,
} from "../constants.js";
import { resolveIgnoreSelectors } from "../shared/ignore.js";
import { modeNames, stackModes } from "../shared/modes.js";
import { normalizeImagesWithModes } from "./normalize.js";

export function buildInitPayload(
  context: {
    id: string;
    name: string;
  },
  visualDeltaParams: VisualDeltaParams | undefined,
) {
  const modes = stackModes(visualDeltaParams?.modes);
  const normalizedImages = normalizeImagesWithModes({
    ...visualDeltaParams,
    modes,
  });
  const placement = normalizePlacement(
    normalizedImages[0]?.placement ??
      visualDeltaParams?.placement ??
      DEFAULT_PLACEMENT,
  );
  return {
    images: normalizedImages,
    interactions: visualDeltaParams?.interactions ?? [],
    modes,
    modeNames: modeNames(modes),
    storyId: context.id,
    storyName: context.name,
    opacity:
      visualDeltaParams?.opacity ?? (isSplitPlacement(placement) ? 1 : 0.5),
    colorInversion: visualDeltaParams?.colorInversion ?? false,
    placement,
    passThresholdPercent:
      visualDeltaParams?.passThresholdPercent ??
      DEFAULT_PASS_THRESHOLD_PERCENT,
    diffThreshold: visualDeltaParams?.diffThreshold ?? DEFAULT_DIFF_THRESHOLD,
    diffIncludeAntiAliasing:
      visualDeltaParams?.diffIncludeAntiAliasing ?? false,
    delay: visualDeltaParams?.delay ?? 0,
    ignoreSelectors: resolveIgnoreSelectors(visualDeltaParams?.ignoreSelectors),
    cropToViewport: visualDeltaParams?.cropToViewport ?? false,
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
      buildInitPayload(
        { id: context.id, name: context.name },
        visualDeltaParams,
      ),
    );
  }, [
    visualDeltaParams?.images,
    visualDeltaParams?.interactions,
    visualDeltaParams?.modes,
    visualDeltaParams?.passThresholdPercent,
    visualDeltaParams?.diffThreshold,
    visualDeltaParams?.diffIncludeAntiAliasing,
    visualDeltaParams?.delay,
    visualDeltaParams?.ignoreSelectors,
    visualDeltaParams?.cropToViewport,
    context.id,
    context.name,
    emit,
  ]);

  return storyFn();
};
