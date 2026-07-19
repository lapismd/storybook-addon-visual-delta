import type { ProjectAnnotations, Renderer } from "storybook/internal/types";
import { KEY } from "./constants.js";
import { withInitImage } from "./preview/init.js";
import { withOverlayInfo } from "./preview/overlay-info.js";
import { withSelectImage } from "./preview/overlay.js";

const preview: ProjectAnnotations<Renderer> = {
  decorators: [withInitImage, withSelectImage, withOverlayInfo],
  initialGlobals: {
    [KEY]: false,
  },
};

export default preview;
