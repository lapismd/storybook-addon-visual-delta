import { isSplitPlacement, type PlacementMode } from "../constants.js";

export type OverlaySessionSnapshot = {
  overlayOn: boolean;
  placement: PlacementMode;
  index: number;
  imageCount: number;
  opacity: number;
};

export type PlacementToggleAction =
  | { type: "soft-hide" }
  | {
      type: "show";
      placement: PlacementMode;
      index: number;
      opacity: number;
    };

/**
 * Opacity when switching placement modes (split ↔ center).
 * Matches panel `setPlacement` / `togglePlacement` behavior.
 */
export function opacityForPlacementChange(
  from: PlacementMode,
  to: PlacementMode,
  opacity: number,
): number {
  if (isSplitPlacement(to)) {
    return isSplitPlacement(from) ? opacity : 1;
  }
  if (from === "center") return opacity;
  return opacity === 1 ? 0.5 : opacity;
}

/**
 * Placement pad: active position again → soft-hide (keep selection).
 * Otherwise show overlay at the chosen placement.
 *
 * Soft-hide must not clear `index` (gallery selection stays for re-show), but
 * the preview tears down overlay/split DOM so the live canvas reclaims space.
 */
export function placementToggleAction(
  prev: OverlaySessionSnapshot,
  placement: PlacementMode,
): PlacementToggleAction {
  if (prev.overlayOn && prev.placement === placement) {
    return { type: "soft-hide" };
  }
  const index = prev.index >= 0 ? prev.index : prev.imageCount > 0 ? 0 : -1;
  return {
    type: "show",
    placement,
    index,
    opacity: opacityForPlacementChange(prev.placement, placement, prev.opacity),
  };
}

/**
 * Re-show after soft-hide without rebuilding when selection/placement match.
 */
export function shouldSoftShowOverlay(
  prev: OverlaySessionSnapshot,
  nextPlacement: PlacementMode,
  nextIndex: number,
): boolean {
  return (
    !prev.overlayOn &&
    prev.index >= 0 &&
    prev.placement === nextPlacement &&
    nextIndex === prev.index
  );
}

/**
 * Resolve gallery selection vs overlay visibility on INIT_IMAGE.
 *
 * Soft-hide persists `overlayOn: false` but must keep a gallery index when
 * baselines exist — otherwise Diff / DiffResult lose `baselineStem` and the
 * panel body looks empty (toolbar only). Preview attach uses `previewIndex`.
 */
export function initImageSelection(args: {
  imageCount: number;
  overlayOnPref: boolean;
  liveVisible: boolean;
  interactionPinned: boolean;
}): { index: number; overlayOn: boolean; previewIndex: number } {
  const index = args.imageCount > 0 ? 0 : -1;
  const overlayOn =
    index >= 0 &&
    (args.interactionPinned || args.overlayOnPref || !args.liveVisible);
  return {
    index,
    overlayOn,
    previewIndex: overlayOn ? index : -1,
  };
}

/**
 * After create/update baseline: enable center overlay for review.
 * When there are no images yet, still return center prefs for the next INIT.
 */
export function revealCenteredOverlayPatch(prev: {
  index: number;
  imageCount: number;
  placement: PlacementMode;
  opacity: number;
}): {
  overlayOn: true;
  placement: "center";
  liveVisible: true;
  index: number;
  opacity: number;
} {
  if (prev.imageCount === 0) {
    return {
      overlayOn: true,
      placement: "center",
      liveVisible: true,
      index: -1,
      opacity: prev.opacity,
    };
  }
  return {
    overlayOn: true,
    placement: "center",
    liveVisible: true,
    index: prev.index >= 0 ? prev.index : 0,
    opacity: opacityForPlacementChange(prev.placement, "center", prev.opacity),
  };
}
