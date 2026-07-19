export const ADDON_ID = "visual-delta";
export const PANEL_ID = `${ADDON_ID}/panel`;
export const KEY = "visual-delta";

export const EVENTS = {
  INIT_IMAGE: `${ADDON_ID}/init-image`,
  SELECT_IMAGE: `${ADDON_ID}/select-image`,
  UPDATE_OVERLAY_STYLE: `${ADDON_ID}/update-overlay-style`,
  RESET_OVERLAY: `${ADDON_ID}/reset-overlay`,
  REQUEST_OVERLAY_INFO: `${ADDON_ID}/request-overlay-info`,
  OVERLAY_INFO: `${ADDON_ID}/overlay-info`,
  HIDE_OVERLAY: `${ADDON_ID}/hide-overlay`,
  SHOW_OVERLAY: `${ADDON_ID}/show-overlay`,
  OVERLAY_HIDDEN: `${ADDON_ID}/overlay-hidden`,
} as const;

export type AlignMode = "viewport" | "canvas";

export type VisualDeltaImage = {
  src: string;
  anchor?: string;
  offsetX: number;
  offsetY: number;
  align: AlignMode;
};

export type VisualDeltaParams = {
  images?:
    | string
    | Array<string | (Partial<VisualDeltaImage> & { src: string })>;
  anchor?: string;
  offsetX?: number;
  offsetY?: number;
  align?: AlignMode;
  opacity?: number;
  colorInversion?: boolean;
  passThresholdPercent?: number;
};

export const DEFAULT_PASS_THRESHOLD_PERCENT = 0.1;
