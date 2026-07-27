import { useChannel, useEffect } from "storybook/preview-api";
import type { DecoratorFunction } from "storybook/internal/types";
import {
  DEFAULT_DIFF_THRESHOLD,
  DEFAULT_PLACEMENT,
  EVENTS,
  VISUAL_DELTA_CONFIG_PATH,
  isSplitPlacement,
  normalizePlacement,
  type VisualDeltaParams,
} from "../constants.js";
import type {
  VisualDeltaProjectDefaults,
  VisualDeltaResolvedConfig,
} from "../shared/config-types.js";
import { resolveIgnoreSelectors } from "../shared/ignore.js";
import { modeNames, stackModes } from "../shared/modes.js";
import { BUILTIN_VISUAL_DELTA_DEFAULTS } from "../shared/project-defaults.js";
import { normalizeImagesWithModes } from "./normalize.js";
import type { StorybookLayoutMode } from "../shared/preview-layout.js";

let lastProjectDefaults: VisualDeltaProjectDefaults =
  BUILTIN_VISUAL_DELTA_DEFAULTS;
let previewRenderGeneration = 0;

async function loadProjectDefaults(): Promise<VisualDeltaProjectDefaults> {
  try {
    const response = await fetch(VISUAL_DELTA_CONFIG_PATH, {
      cache: "no-store",
    });
    if (!response.ok) return lastProjectDefaults;
    const config = (await response.json()) as VisualDeltaResolvedConfig;
    lastProjectDefaults =
      config.projectDefaults ?? BUILTIN_VISUAL_DELTA_DEFAULTS;
  } catch {
    /* Static Storybook has no config endpoint; keep packaged built-ins. */
  }
  return lastProjectDefaults;
}

export function buildInitPayload(
  context: {
    id: string;
    name: string;
    layout?: StorybookLayoutMode | null;
    renderGeneration?: number;
  },
  visualDeltaParams: VisualDeltaParams | undefined,
  projectDefaults: VisualDeltaProjectDefaults = BUILTIN_VISUAL_DELTA_DEFAULTS,
  configUpdated = false,
) {
  const modes = stackModes(visualDeltaParams?.modes);
  const normalizedImages = normalizeImagesWithModes({
    placement: projectDefaults.placement,
    ...visualDeltaParams,
    modes,
  });
  const placement = normalizePlacement(
    normalizedImages[0]?.placement ??
      visualDeltaParams?.placement ??
      projectDefaults.placement ??
      DEFAULT_PLACEMENT,
  );
  return {
    images: normalizedImages,
    interactions: visualDeltaParams?.interactions ?? [],
    modes,
    modeNames: modeNames(modes),
    storyId: context.id,
    storyName: context.name,
    layout: context.layout ?? null,
    renderGeneration: context.renderGeneration ?? 0,
    opacity:
      visualDeltaParams?.opacity ??
      (isSplitPlacement(placement) ? 1 : projectDefaults.opacity),
    baselineLabelOffset:
      visualDeltaParams?.baselineLabelOffset ??
      projectDefaults.baselineLabelOffset,
    colorInversion: visualDeltaParams?.colorInversion ?? false,
    placement,
    passThresholdPercent:
      visualDeltaParams?.passThresholdPercent ??
      projectDefaults.passThresholdPercent,
    diffThreshold:
      visualDeltaParams?.diffThreshold ??
      projectDefaults.diffThreshold ??
      DEFAULT_DIFF_THRESHOLD,
    diffIncludeAntiAliasing:
      visualDeltaParams?.diffIncludeAntiAliasing ??
      projectDefaults.diffIncludeAntiAliasing,
    delay: visualDeltaParams?.delay ?? projectDefaults.delay,
    ignoreSelectors: resolveIgnoreSelectors(visualDeltaParams?.ignoreSelectors),
    cropToViewport:
      visualDeltaParams?.cropToViewport ?? projectDefaults.cropToViewport,
    previewSplitZoomDefault: projectDefaults.previewSplitZoomDefault,
    diffResultZoomDefault: projectDefaults.diffResultZoomDefault,
    configUpdated,
  };
}

export const withInitImage: DecoratorFunction = (storyFn, context) => {
  const visualDeltaParams = context.parameters?.visualDelta as
    | VisualDeltaParams
    | undefined;
  const layout =
    typeof context.parameters?.layout === "string"
      ? (context.parameters.layout as StorybookLayoutMode)
      : null;
  const renderGeneration = ++previewRenderGeneration;
  const initContext = {
    id: context.id,
    name: context.name,
    layout,
    renderGeneration,
  };
  const emit = useChannel({
    [EVENTS.REQUEST_INIT_IMAGE]: (payload?: { storyId?: string }) => {
      if (payload?.storyId && payload.storyId !== context.id) return;
      void loadProjectDefaults().then((projectDefaults) => {
        emit(
          EVENTS.INIT_IMAGE,
          buildInitPayload(
            initContext,
            context.parameters?.visualDelta as VisualDeltaParams | undefined,
            projectDefaults,
          ),
        );
      });
    },
    [EVENTS.CONFIG_UPDATED]: (payload?: {
      projectDefaults?: VisualDeltaProjectDefaults;
    }) => {
      const projectDefaults =
        payload?.projectDefaults ?? BUILTIN_VISUAL_DELTA_DEFAULTS;
      lastProjectDefaults = projectDefaults;
      emit(
        EVENTS.INIT_IMAGE,
        buildInitPayload(initContext, visualDeltaParams, projectDefaults, true),
      );
    },
  });

  useEffect(() => {
    emit(
      EVENTS.INIT_IMAGE,
      buildInitPayload(initContext, visualDeltaParams, lastProjectDefaults),
    );
    void loadProjectDefaults().then((projectDefaults) => {
      emit(
        EVENTS.INIT_IMAGE,
        buildInitPayload(initContext, visualDeltaParams, projectDefaults),
      );
    });
  }, [
    visualDeltaParams?.images,
    visualDeltaParams?.interactions,
    visualDeltaParams?.modes,
    visualDeltaParams?.passThresholdPercent,
    visualDeltaParams?.diffThreshold,
    visualDeltaParams?.diffIncludeAntiAliasing,
    visualDeltaParams?.baselineLabelOffset,
    visualDeltaParams?.opacity,
    visualDeltaParams?.placement,
    visualDeltaParams?.delay,
    visualDeltaParams?.ignoreSelectors,
    visualDeltaParams?.cropToViewport,
    context.id,
    context.name,
    layout,
    renderGeneration,
    emit,
  ]);

  return storyFn();
};
