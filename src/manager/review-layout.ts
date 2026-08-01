import { PANEL_ID } from "../constants.js";

/** Fraction of viewport height for the bottom Visual Delta panel in review layout. */
export const REVIEW_LAYOUT_BOTTOM_RATIO = 0.42;
export const STORYBOOK_MOBILE_REVIEW_QUERY = "(max-width: 599px)";

const STORYBOOK_MOBILE_ADDON_PANEL_ID = "storybook-mobile-addon-panel";
const STORYBOOK_MOBILE_ADDON_DIALOG =
  '[role="dialog"][aria-label="Addon panel"]';
const MOBILE_DRAWER_RETRY_MS = 50;
const MOBILE_DRAWER_MAX_ATTEMPTS = 6;

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
  mobileAddonDrawerOpen: boolean | null;
};

let saved: ReviewLayoutSnapshot | null = null;
/** DOM timer id (`window.setTimeout`); avoid NodeJS.Timeout from @types/node. */
let applyTimer: number | null = null;
let mobileDrawerTimer: number | null = null;

function isMobileReviewViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(STORYBOOK_MOBILE_REVIEW_QUERY).matches
  );
}

function isMobileAddonDrawerOpen(): boolean {
  return (
    typeof document !== "undefined" &&
    document.querySelector(STORYBOOK_MOBILE_ADDON_DIALOG) != null
  );
}

function mobileAddonDrawerButton(open: boolean): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const selector = open
    ? `[aria-controls="${STORYBOOK_MOBILE_ADDON_PANEL_ID}"][aria-expanded="false"]`
    : `${STORYBOOK_MOBILE_ADDON_DIALOG} button[aria-label="Close addon panel"]`;
  const element = document.querySelector(selector);
  return element instanceof HTMLElement ? element : null;
}

function scheduleMobileAddonDrawer(open: boolean, attempt = 0): void {
  if (typeof window === "undefined" || !isMobileReviewViewport()) return;
  if (mobileDrawerTimer != null) {
    window.clearTimeout(mobileDrawerTimer);
    mobileDrawerTimer = null;
  }
  mobileDrawerTimer = window.setTimeout(() => {
    mobileDrawerTimer = null;
    if (!isMobileReviewViewport() || isMobileAddonDrawerOpen() === open) return;
    const button = mobileAddonDrawerButton(open);
    if (button) {
      button.click();
      return;
    }
    if (attempt + 1 < MOBILE_DRAWER_MAX_ATTEMPTS) {
      scheduleMobileAddonDrawer(open, attempt + 1);
    }
  }, attempt === 0 ? 0 : MOBILE_DRAWER_RETRY_MS);
}

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
  const mobile = isMobileReviewViewport();
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
    mobileAddonDrawerOpen: mobile ? isMobileAddonDrawerOpen() : null,
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
  if (saved.mobileAddonDrawerOpen != null) {
    scheduleMobileAddonDrawer(true);
  }
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
  if (snap.mobileAddonDrawerOpen != null) {
    scheduleMobileAddonDrawer(snap.mobileAddonDrawerOpen);
  }

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
