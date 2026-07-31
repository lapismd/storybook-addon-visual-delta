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
import { beginPreviewRender, readPreviewRender } from "./render-lifecycle.js";

let lastProjectDefaults: VisualDeltaProjectDefaults =
  BUILTIN_VISUAL_DELTA_DEFAULTS;

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
    storyFinished?: boolean;
  },
  visualDeltaParams: VisualDeltaParams | undefined,
  projectDefaults: VisualDeltaProjectDefaults = BUILTIN_VISUAL_DELTA_DEFAULTS,
  configUpdated = false,
) {
  const modes = stackModes(visualDeltaParams?.modes);
  const deviceScaleFactor =
    visualDeltaParams?.deviceScaleFactor ?? projectDefaults.deviceScaleFactor;
  const normalizedImages = normalizeImagesWithModes({
    placement: projectDefaults.placement,
    ...visualDeltaParams,
    modes,
  }).map((image) => ({
    ...image,
    deviceScaleFactor: image.deviceScaleFactor ?? deviceScaleFactor,
  }));
  const placement = normalizePlacement(
    normalizedImages[0]?.placement ??
      visualDeltaParams?.placement ??
      projectDefaults.placement ??
      DEFAULT_PLACEMENT,
  );
  return {
    images: normalizedImages,
    deviceScaleFactor,
    interactions: visualDeltaParams?.interactions ?? [],
    modes,
    modeNames: modeNames(modes),
    storyId: context.id,
    storyName: context.name,
    layout: context.layout ?? null,
    renderGeneration: context.renderGeneration ?? 0,
    storyFinished: context.storyFinished ?? false,
    opacity:
      visualDeltaParams?.opacity ??
      (isSplitPlacement(placement) ? 1 : projectDefaults.opacity),
    baselineLabelOffset:
      visualDeltaParams?.baselineLabelOffset ??
      projectDefaults.baselineLabelOffset,
    colorInversion: visualDeltaParams?.colorInversion ?? false,
    align: visualDeltaParams?.align ?? "viewport",
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
  const render = beginPreviewRender(context.id);
  const initContext = {
    id: context.id,
    name: context.name,
    layout,
    renderGeneration: render.renderGeneration,
  };
  const buildCurrentPayload = (
    projectDefaults: VisualDeltaProjectDefaults,
    configUpdated = false,
  ) =>
    buildInitPayload(
      {
        ...initContext,
        storyFinished:
          readPreviewRender(context.id, render.renderGeneration)
            ?.storyFinished ?? false,
      },
      visualDeltaParams,
      projectDefaults,
      configUpdated,
    );
  const emit = useChannel(
    {
      [EVENTS.REQUEST_INIT_IMAGE]: (payload?: { storyId?: string }) => {
        if (payload?.storyId && payload.storyId !== context.id) return;
        void loadProjectDefaults().then((projectDefaults) => {
          emit(EVENTS.INIT_IMAGE, buildCurrentPayload(projectDefaults));
        });
      },
      [EVENTS.CONFIG_UPDATED]: (payload?: {
        projectDefaults?: VisualDeltaProjectDefaults;
      }) => {
        const projectDefaults =
          payload?.projectDefaults ?? BUILTIN_VISUAL_DELTA_DEFAULTS;
        lastProjectDefaults = projectDefaults;
        emit(EVENTS.INIT_IMAGE, buildCurrentPayload(projectDefaults, true));
      },
    },
    [
      context.id,
      context.name,
      layout,
      render.renderGeneration,
      visualDeltaParams,
    ],
  );

  useEffect(() => {
    emit(EVENTS.INIT_IMAGE, buildCurrentPayload(lastProjectDefaults));
    void loadProjectDefaults().then((projectDefaults) => {
      emit(EVENTS.INIT_IMAGE, buildCurrentPayload(projectDefaults));
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
    visualDeltaParams?.deviceScaleFactor,
    visualDeltaParams?.ignoreSelectors,
    visualDeltaParams?.cropToViewport,
    context.id,
    context.name,
    layout,
    render.renderGeneration,
    emit,
  ]);

  return storyFn();
};
