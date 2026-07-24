import { PANEL_ID } from "../constants.js";

/** Fraction of viewport height for the bottom Visual Delta panel in review layout. */
export const REVIEW_LAYOUT_BOTTOM_RATIO = 0.42;

export type ReviewLayoutSource = {
  navSize: number;
  bottomPanelHeight: number;
  rightPanelWidth: number;
  panelPosition: "bottom" | "right";
  showToolbar: boolean;
  recentVisibleSizes: {
    navSize: number;
    bottomPanelHeight: number;
    rightPanelWidth: number;
  };
};

export type ReviewLayoutApi = {
  toggleNav: (toggled?: boolean) => void;
  togglePanel: (toggled?: boolean) => void;
  togglePanelPosition: (position?: "bottom" | "right") => void;
  setSelectedPanel: (panelName: string) => void;
  setSizes: (
    options: Partial<{
      navSize: number;
      bottomPanelHeight: number;
      rightPanelWidth: number;
    }>,
  ) => void;
};

type ReviewLayoutSnapshot = {
  showNav: boolean;
  showPanel: boolean;
  panelPosition: "bottom" | "right";
  navSize: number;
  bottomPanelHeight: number;
  rightPanelWidth: number;
};

let saved: ReviewLayoutSnapshot | null = null;
/** DOM timer id (`window.setTimeout`); avoid NodeJS.Timeout from @types/node. */
let applyTimer: number | null = null;

function visibleSize(current: number, recent: number): number {
  return current > 0 ? current : recent;
}

function isPanelShown(layout: ReviewLayoutSource): boolean {
  return (
    (layout.panelPosition === "bottom" && layout.bottomPanelHeight > 0) ||
    (layout.panelPosition === "right" && layout.rightPanelWidth > 0)
  );
}

function captureSnapshot(layout: ReviewLayoutSource): ReviewLayoutSnapshot {
  return {
    showNav: layout.navSize > 0,
    showPanel: isPanelShown(layout),
    panelPosition: layout.panelPosition,
    navSize: visibleSize(layout.navSize, layout.recentVisibleSizes.navSize),
    bottomPanelHeight: visibleSize(
      layout.bottomPanelHeight,
      layout.recentVisibleSizes.bottomPanelHeight,
    ),
    rightPanelWidth: visibleSize(
      layout.rightPanelWidth,
      layout.recentVisibleSizes.rightPanelWidth,
    ),
  };
}

export function isReviewLayoutActive(): boolean {
  return saved != null;
}

/**
 * Run after popovers / React Aria / Storybook landmarks finish unregistering.
 * Immediate layout remounts crash with compareDocumentPosition(non-Node) when
 * a landmark's ref.current is already null (Storybook LandmarkManager).
 */
export function scheduleReviewLayoutApply(run: () => void): void {
  if (typeof window === "undefined") {
    run();
    return;
  }
  if (applyTimer != null) {
    window.clearTimeout(applyTimer);
    applyTimer = null;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      applyTimer = window.setTimeout(() => {
        applyTimer = null;
        run();
      }, 50);
    });
  });
}

/**
 * Maximize the story canvas and dock Visual Delta full-width underneath.
 * Does not call `toggleFullscreen` (hides the panel) or `toggleToolbar`
 * (remounts landmark regions and trips Storybook's LandmarkManager).
 */
export function enterReviewLayout(
  api: ReviewLayoutApi,
  layout: ReviewLayoutSource,
): void {
  if (saved) return;

  saved = captureSnapshot(layout);

  api.toggleNav(false);
  api.togglePanelPosition("bottom");
  api.togglePanel(true);
  api.setSelectedPanel(PANEL_ID);

  const height = Math.round(
    (typeof window !== "undefined" ? window.innerHeight : 900) *
      REVIEW_LAYOUT_BOTTOM_RATIO,
  );
  api.setSizes({ bottomPanelHeight: Math.max(height, 200) });
}

/**
 * Restore layout sizes / nav / panel position saved on enter.
 * Keeps Visual Delta selected and does not toggle the preview toolbar.
 *
 * Nav is restored on a short delay after the panel dock moves, so Storybook's
 * LandmarkManager is not inserting a sidebar landmark while panel landmarks
 * still hold null refs (compareDocumentPosition crash).
 */
export function exitReviewLayout(api: ReviewLayoutApi): void {
  if (!saved) return;

  const snap = saved;
  saved = null;

  api.togglePanelPosition(snap.panelPosition);
  api.setSizes({
    // Keep nav collapsed until panel chrome finishes remounting.
    navSize: 0,
    bottomPanelHeight:
      snap.panelPosition === "bottom" && !snap.showPanel
        ? 0
        : snap.bottomPanelHeight,
    rightPanelWidth:
      snap.panelPosition === "right" && !snap.showPanel
        ? 0
        : snap.rightPanelWidth,
  });
  if (!snap.showPanel) api.togglePanel(false);

  const restoreNav = () => {
    if (snap.showNav) {
      api.setSizes({ navSize: snap.navSize });
    } else {
      api.toggleNav(false);
    }
  };

  if (typeof window === "undefined") {
    restoreNav();
    return;
  }
  window.setTimeout(restoreNav, 50);
}

/** @returns `true` when review layout is active after the call. */
export function toggleReviewLayout(
  api: ReviewLayoutApi,
  layout: ReviewLayoutSource,
): boolean {
  if (saved) {
    exitReviewLayout(api);
    return false;
  }
  enterReviewLayout(api, layout);
  return true;
}
