import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CollapseIcon, ExpandAltIcon } from "@storybook/icons";
import { ToggleButton } from "storybook/internal/components";
import { styled } from "storybook/theming";
import { VISUAL_DEVICE_SCALE_FACTOR } from "../constants.js";
import type { ChangeBounds } from "../types.js";
import type { VisualDeltaZoomDefault } from "../shared/config-types.js";
import {
  compareZoomFromDefault,
  resolvedCompareZoomScale,
  stepCompareZoom,
  type CompareZoomState,
} from "../shared/compare-zoom.js";
import { CompareZoomControl } from "./CompareZoomControl.js";
import { ImageLightbox, type LightboxImage } from "./ImageLightbox.js";

type CompareTab = "sidebyside" | "swipe" | "diff" | "focus" | "blink";

const LOUPE_SIZE = 120;
const LOUPE_ZOOM = 2.5;
const BLINK_MS = 280;
const SWIPE_NUDGE = 5;
const COMPARE_MIN_HEIGHT = 300;
const SIDE_BY_SIDE_GAP = 12;
const SHARED_SCROLL_RAIL_SIZE = 12;
const VIEW_ZOOM_STORAGE_KEY = "storybook-addon-visual-delta/compare-view-zoom";

const TAB_DEFS: { id: CompareTab; title: string }[] = [
  { id: "sidebyside", title: "2-up" },
  { id: "swipe", title: "Swipe" },
  { id: "diff", title: "Diff" },
  { id: "focus", title: "Focus" },
  { id: "blink", title: "Blink" },
];

const Root = styled.div({
  display: "flex",
  flexDirection: "column",
  // Fill leftover SectionBody height when there is room; keep content-sized
  // minimum so accordion `overflow: auto` scrolls toolbar → tabs → images.
  flex: "1 1 auto",
  minHeight: "min-content",
  gap: "0.5rem",
  outline: "none",
  overflow: "hidden",
});

const Toolbar = styled.div({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  flexWrap: "wrap",
});

const TabTools = styled.div({
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  flexWrap: "wrap",
});

const CompareTabList = styled.div({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  position: "relative",
  overflowX: "auto",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": {
    display: "none",
  },
});

const CompareTabButton = styled.button<{ $selected: boolean }>(
  {
    whiteSpace: "normal",
    display: "inline-flex",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    textDecoration: "none",
    scrollSnapAlign: "start",
    padding: "0 15px",
    height: 40,
    lineHeight: "12px",
    cursor: "pointer",
    background: "transparent",
    border: "0 solid transparent",
    borderTop: "3px solid transparent",
    borderBottom: "3px solid transparent",
    fontWeight: "bold",
    fontSize: 13,
  },
  ({ $selected, theme }) => ({
    color: $selected ? theme.barSelectedColor : theme.barTextColor,
    borderBottomColor: $selected ? theme.barSelectedColor : "transparent",
    "&:hover": {
      color: $selected ? theme.barSelectedColor : theme.barHoverColor,
    },
    "&:focus-visible": {
      outline: "0 none",
      boxShadow: `inset 0 0 0 2px ${theme.barSelectedColor}`,
    },
  }),
);

const ContentViewport = styled.div<{ $sideBySide: boolean }>(
  ({ $sideBySide }) => ({
    flex: "1 1 auto",
    minWidth: 0,
    minHeight: COMPARE_MIN_HEIGHT,
    overflow: $sideBySide ? "hidden" : "auto",
    overscrollBehavior: "contain",
  }),
);

const Labels = styled.div(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  fontSize: "11px",
  fontWeight: 600,
  color: theme.color.mediumdark,
  padding: "0 2px",
}));

const checkerboard = {
  backgroundColor: "#e8e8e8",
  backgroundImage: `
    linear-gradient(45deg, #d0d0d0 25%, transparent 25%),
    linear-gradient(-45deg, #d0d0d0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #d0d0d0 75%),
    linear-gradient(-45deg, transparent 75%, #d0d0d0 75%)
  `,
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
};

const Stage = styled.div(({ theme }) => ({
  position: "relative",
  margin: "0 auto",
  overflow: "hidden",
  userSelect: "none",
  touchAction: "none",
  "&:focus-visible": {
    outline: `2px solid ${theme.color.secondary}`,
    outlineOffset: 2,
  },
}));

const Stack = styled.div(({ theme }) => ({
  position: "relative",
  width: "100%",
  // Height comes from `aspect-ratio` (see stackStyle). All layer images are
  // absolutely positioned so natural PNG sizes cannot desync Swipe/Diff/Focus/Blink.
  lineHeight: 0,
  overflow: "hidden",
  outline: `1px solid ${theme.appBorderColor}`,
  outlineOffset: 0,
  boxSizing: "border-box",
  ...checkerboard,
}));

/** Fills the aspect-locked Stack — DiffResult pads/crops to one bitmap size. */
const LayerImg = styled.img({
  display: "block",
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "fill",
  pointerEvents: "none",
});

const TopLayer = styled.div({
  position: "absolute",
  inset: 0,
  overflow: "hidden",
});

const TopImg = styled.img({
  display: "block",
  width: "100%",
  height: "100%",
  objectFit: "fill",
  pointerEvents: "none",
});

const Handle = styled.div(({ theme }) => ({
  position: "absolute",
  top: 0,
  bottom: 0,
  width: "2px",
  marginLeft: "-1px",
  backgroundColor: theme.color.secondary,
  pointerEvents: "none",
  "&::after": {
    content: '""',
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "14px",
    height: "28px",
    borderRadius: "4px",
    backgroundColor: theme.color.secondary,
    boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
  },
}));

const SideBySide = styled.div({
  display: "grid",
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
});

const SidePanes = styled.div({
  gridColumn: 1,
  gridRow: 1,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: `0.35rem ${SIDE_BY_SIDE_GAP}px`,
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
});

const SidePaneViewport = styled.div(({ theme }) => ({
  ...checkerboard,
  minWidth: 0,
  minHeight: 0,
  overflow: "auto",
  overscrollBehavior: "contain",
  border: `1px solid ${theme.appBorderColor}`,
  boxSizing: "border-box",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": {
    display: "none",
    width: 0,
    height: 0,
  },
}));

const SidePane = styled.button(({ theme }) => ({
  display: "block",
  margin: 0,
  padding: 0,
  border: 0,
  background: "transparent",
  lineHeight: 0,
  boxSizing: "border-box",
  cursor: "zoom-in",
  "&:focus-visible": {
    outline: `2px solid ${theme.color.secondary}`,
    outlineOffset: -2,
  },
}));

const SharedScrollRail = styled.div({
  minWidth: 0,
  minHeight: 0,
  scrollbarWidth: "auto",
});

const VerticalScrollRail = styled(SharedScrollRail)<{ $visible: boolean }>(
  ({ $visible }) => ({
    gridColumn: 2,
    gridRow: 1,
    width: $visible ? SHARED_SCROLL_RAIL_SIZE : 0,
    overflowX: "hidden",
    overflowY: $visible ? "scroll" : "hidden",
    visibility: $visible ? "visible" : "hidden",
  }),
);

const HorizontalScrollRail = styled(SharedScrollRail)<{ $visible: boolean }>(
  ({ $visible }) => ({
    gridColumn: 1,
    gridRow: 2,
    height: $visible ? SHARED_SCROLL_RAIL_SIZE : 0,
    overflowX: $visible ? "scroll" : "hidden",
    overflowY: "hidden",
    visibility: $visible ? "visible" : "hidden",
  }),
);

const ScrollCorner = styled.div<{ $visible: boolean }>(({ $visible }) => ({
  gridColumn: 2,
  gridRow: 2,
  width: $visible ? SHARED_SCROLL_RAIL_SIZE : 0,
  height: $visible ? SHARED_SCROLL_RAIL_SIZE : 0,
}));

const ScrollSpacer = styled.div({
  width: 1,
  height: 1,
  pointerEvents: "none",
});

const SideLabel = styled.div(({ theme }) => ({
  fontSize: "12px",
  fontWeight: 700,
  color: theme.color.defaultText,
  minWidth: 0,
}));

const SideImg = styled.img({
  display: "block",
  objectFit: "fill",
  pointerEvents: "none",
});

const Loupe = styled.div(({ theme }) => ({
  position: "absolute",
  width: `${LOUPE_SIZE}px`,
  height: `${LOUPE_SIZE}px`,
  borderRadius: "50%",
  border: `2px solid ${theme.color.secondary}`,
  boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
  pointerEvents: "none",
  zIndex: 5,
  backgroundRepeat: "no-repeat",
  overflow: "hidden",
}));

export function CompareView({
  baselineSrc,
  actualSrc,
  diffSrc,
  focusSrc,
  changeBounds,
  imageWidth,
  imageHeight,
  cssWidth,
  cssHeight,
  deviceScaleFactor = VISUAL_DEVICE_SCALE_FACTOR,
  defaultZoom = "100%",
  resultKey,
}: {
  baselineSrc: string;
  actualSrc: string;
  diffSrc: string;
  focusSrc: string;
  changeBounds: ChangeBounds | null;
  imageWidth: number;
  imageHeight: number;
  cssWidth?: number;
  cssHeight?: number;
  deviceScaleFactor?: number;
  defaultZoom?: VisualDeltaZoomDefault;
  resultKey?: string;
}) {
  const [tab, setTab] = useState<CompareTab>("sidebyside");
  const [position, setPosition] = useState(50);
  const [blinkShowActual, setBlinkShowActual] = useState(true);
  const [zoomToChange, setZoomToChange] = useState(true);
  const [zoomState, setZoomState] = useState<CompareZoomState>(() =>
    compareZoomFromDefault(defaultZoom),
  );
  const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(
    null,
  );
  const [available, setAvailable] = useState({ width: 1, height: 1 });
  const [sideOverflow, setSideOverflow] = useState({ x: false, y: false });
  const [loupe, setLoupe] = useState<{
    x: number;
    y: number;
    bgX: number;
    bgY: number;
    bgW: number;
    bgH: number;
    src: string;
  } | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const baselinePaneRef = useRef<HTMLDivElement>(null);
  const actualPaneRef = useRef<HTMLDivElement>(null);
  const horizontalRailRef = useRef<HTMLDivElement>(null);
  const horizontalSpacerRef = useRef<HTMLDivElement>(null);
  const verticalRailRef = useRef<HTMLDivElement>(null);
  const verticalSpacerRef = useRef<HTMLDivElement>(null);
  const sideScrollSyncing = useRef(false);
  const sideScrollFrame = useRef<number | null>(null);
  const desiredSideScroll = useRef({ top: 0, left: 0 });
  const dragging = useRef(false);
  const swipeClick = useRef<{
    image: LightboxImage;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    setZoomState(compareZoomFromDefault(defaultZoom));
  }, [defaultZoom, resultKey]);

  useEffect(() => {
    try {
      localStorage.removeItem(VIEW_ZOOM_STORAGE_KEY);
    } catch {
      /* private mode */
    }
  }, []);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setAvailable({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const nativeWidth =
    cssWidth && cssWidth > 0
      ? cssWidth
      : imageWidth / Math.max(1, deviceScaleFactor);
  const nativeHeight =
    cssHeight && cssHeight > 0
      ? cssHeight
      : imageHeight / Math.max(1, deviceScaleFactor);
  const isFocusTab = tab === "focus";
  const fitInput = useMemo(
    () => ({
      availableWidth: available.width,
      availableHeight: available.height,
      contentWidth: Math.max(1, nativeWidth),
      contentHeight: Math.max(1, nativeHeight),
      columns: tab === "sidebyside" ? (2 as const) : (1 as const),
      columnGap: tab === "sidebyside" ? SIDE_BY_SIDE_GAP : 0,
      labelHeight:
        tab === "sidebyside" || tab === "swipe" || tab === "blink" ? 24 : 0,
    }),
    [available, nativeHeight, nativeWidth, tab],
  );
  const viewZoom = resolvedCompareZoomScale(zoomState, fitInput);
  const scaledWidth = Math.max(1, nativeWidth * viewZoom);
  const scaledHeight = Math.max(1, nativeHeight * viewZoom);
  const stageSizeStyle = useMemo(
    () => ({ width: scaledWidth, height: scaledHeight }),
    [scaledHeight, scaledWidth],
  );
  const stackStyle = stageSizeStyle;
  const imageSizeStyle = useMemo(
    () => ({ width: scaledWidth, height: scaledHeight }),
    [scaledHeight, scaledWidth],
  );

  const synchronizeSideScroll = useCallback((top: number, left: number) => {
    const baselinePane = baselinePaneRef.current;
    const actualPane = actualPaneRef.current;
    if (!baselinePane || !actualPane) return;

    const maxTop = Math.max(
      0,
      baselinePane.scrollHeight - baselinePane.clientHeight,
      actualPane.scrollHeight - actualPane.clientHeight,
    );
    const maxLeft = Math.max(
      0,
      baselinePane.scrollWidth - baselinePane.clientWidth,
      actualPane.scrollWidth - actualPane.clientWidth,
    );
    const nextTop = Math.max(0, Math.min(maxTop, top));
    const nextLeft = Math.max(0, Math.min(maxLeft, left));
    desiredSideScroll.current = { top: nextTop, left: nextLeft };
    sideScrollSyncing.current = true;
    baselinePane.scrollTop = nextTop;
    baselinePane.scrollLeft = nextLeft;
    actualPane.scrollTop = nextTop;
    actualPane.scrollLeft = nextLeft;
    if (verticalRailRef.current) {
      verticalRailRef.current.scrollTop = nextTop;
    }
    if (horizontalRailRef.current) {
      horizontalRailRef.current.scrollLeft = nextLeft;
    }

    if (sideScrollFrame.current != null) {
      window.cancelAnimationFrame(sideScrollFrame.current);
    }
    sideScrollFrame.current = window.requestAnimationFrame(() => {
      sideScrollFrame.current = null;
      sideScrollSyncing.current = false;
      const desired = desiredSideScroll.current;
      baselinePane.scrollTop = desired.top;
      baselinePane.scrollLeft = desired.left;
      actualPane.scrollTop = desired.top;
      actualPane.scrollLeft = desired.left;
    });
  }, []);

  const refreshSideScroll = useCallback(() => {
    const baselinePane = baselinePaneRef.current;
    const actualPane = actualPaneRef.current;
    const horizontalRail = horizontalRailRef.current;
    const horizontalSpacer = horizontalSpacerRef.current;
    const verticalRail = verticalRailRef.current;
    const verticalSpacer = verticalSpacerRef.current;
    if (
      !baselinePane ||
      !actualPane ||
      !horizontalRail ||
      !horizontalSpacer ||
      !verticalRail ||
      !verticalSpacer
    ) {
      return;
    }

    const fitting = zoomState.mode === "fit";
    const maxTop = fitting
      ? 0
      : Math.max(
          0,
          baselinePane.scrollHeight - baselinePane.clientHeight,
          actualPane.scrollHeight - actualPane.clientHeight,
        );
    const maxLeft = fitting
      ? 0
      : Math.max(
          0,
          baselinePane.scrollWidth - baselinePane.clientWidth,
          actualPane.scrollWidth - actualPane.clientWidth,
        );
    const nextOverflow = { x: maxLeft > 1, y: maxTop > 1 };
    setSideOverflow((current) =>
      current.x === nextOverflow.x && current.y === nextOverflow.y
        ? current
        : nextOverflow,
    );
    horizontalSpacer.style.width = `${horizontalRail.clientWidth + maxLeft}px`;
    verticalSpacer.style.height = `${verticalRail.clientHeight + maxTop}px`;
    synchronizeSideScroll(
      fitting ? 0 : desiredSideScroll.current.top,
      fitting ? 0 : desiredSideScroll.current.left,
    );
  }, [synchronizeSideScroll, zoomState.mode]);

  useLayoutEffect(() => {
    if (tab !== "sidebyside") {
      setSideOverflow({ x: false, y: false });
      return;
    }
    const observed = [
      baselinePaneRef.current,
      actualPaneRef.current,
      horizontalRailRef.current,
      verticalRailRef.current,
    ].filter((element): element is HTMLDivElement => element != null);
    const observer = new ResizeObserver(refreshSideScroll);
    for (const element of observed) observer.observe(element);
    const frame = window.requestAnimationFrame(refreshSideScroll);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      if (sideScrollFrame.current != null) {
        window.cancelAnimationFrame(sideScrollFrame.current);
        sideScrollFrame.current = null;
      }
      sideScrollSyncing.current = false;
    };
  }, [
    refreshSideScroll,
    scaledHeight,
    scaledWidth,
    sideOverflow.x,
    sideOverflow.y,
    tab,
  ]);

  const onSidePaneScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (sideScrollSyncing.current) return;
      synchronizeSideScroll(
        event.currentTarget.scrollTop,
        event.currentTarget.scrollLeft,
      );
    },
    [synchronizeSideScroll],
  );

  const onHorizontalRailScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (sideScrollSyncing.current) return;
      synchronizeSideScroll(
        desiredSideScroll.current.top,
        event.currentTarget.scrollLeft,
      );
    },
    [synchronizeSideScroll],
  );

  const onVerticalRailScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (sideScrollSyncing.current) return;
      synchronizeSideScroll(
        event.currentTarget.scrollTop,
        desiredSideScroll.current.left,
      );
    },
    [synchronizeSideScroll],
  );

  const nudgeViewZoom = useCallback(
    (direction: -1 | 1) => {
      setZoomState({
        mode: "custom",
        scale: stepCompareZoom(viewZoom, direction),
      });
    },
    [viewZoom],
  );

  const resetViewZoom = useCallback(() => {
    setZoomState({ mode: "custom", scale: 1 });
  }, []);

  const lightbox = useCallback(
    (src: string, label: string): LightboxImage => ({
      src,
      label,
      width: nativeWidth,
      height: nativeHeight,
    }),
    [nativeHeight, nativeWidth],
  );

  const openOnKeyboard = useCallback(
    (image: LightboxImage) => (event: React.KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      setLightboxImage(image);
    },
    [],
  );

  const setFromClientX = useCallback((clientX: number) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, pct)));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (tab !== "swipe") return;
      const el = stageRef.current;
      const rect = el?.getBoundingClientRect();
      if (rect && rect.width > 0) {
        const clickPercent = ((e.clientX - rect.left) / rect.width) * 100;
        swipeClick.current = {
          image:
            clickPercent <= position
              ? lightbox(baselineSrc, "Baseline")
              : lightbox(actualSrc, "New"),
          x: e.clientX,
          y: e.clientY,
          moved: false,
        };
      }
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setFromClientX(e.clientX);
    },
    [actualSrc, baselineSrc, lightbox, position, tab, setFromClientX],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const candidate = swipeClick.current;
      if (
        candidate &&
        Math.hypot(e.clientX - candidate.x, e.clientY - candidate.y) > 4
      ) {
        candidate.moved = true;
      }
      setFromClientX(e.clientX);
    },
    [setFromClientX],
  );

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    dragging.current = false;
    const candidate = swipeClick.current;
    swipeClick.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (candidate && !candidate.moved) setLightboxImage(candidate.image);
  }, []);

  const onPointerCancel = useCallback(() => {
    dragging.current = false;
    swipeClick.current = null;
  }, []);

  const onToolbarWheel = useCallback((event: React.WheelEvent) => {
    const viewport = contentRef.current;
    if (
      !viewport ||
      event.deltaY === 0 ||
      Math.abs(event.deltaX) >= Math.abs(event.deltaY)
    ) {
      return;
    }
    const before = viewport.scrollTop;
    viewport.scrollTop += event.deltaY;
    if (viewport.scrollTop !== before) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, []);

  useEffect(() => {
    if (tab !== "blink") return;
    const id = window.setInterval(() => {
      setBlinkShowActual((v) => !v);
    }, BLINK_MS);
    return () => window.clearInterval(id);
  }, [tab]);

  useEffect(() => {
    if (isFocusTab && changeBounds) {
      setZoomToChange(true);
    }
  }, [isFocusTab, changeBounds]);

  const focusFrame = useMemo(() => {
    if (
      !isFocusTab ||
      !zoomToChange ||
      !changeBounds ||
      imageWidth < 1 ||
      imageHeight < 1
    ) {
      return { transform: "none" as const, transformOrigin: "50% 50%" };
    }
    const scaleX = imageWidth / Math.max(1, changeBounds.width);
    const scaleY = imageHeight / Math.max(1, changeBounds.height);
    const scale = Math.min(scaleX, scaleY, 8);
    const ox = ((changeBounds.x + changeBounds.width / 2) / imageWidth) * 100;
    const oy = ((changeBounds.y + changeBounds.height / 2) / imageHeight) * 100;
    return {
      transform: `scale(${scale})`,
      transformOrigin: `${ox}% ${oy}%`,
    };
  }, [isFocusTab, zoomToChange, changeBounds, imageWidth, imageHeight]);

  const loupeSrc =
    tab === "diff"
      ? diffSrc
      : tab === "focus" && !zoomToChange
        ? focusSrc
        : null;

  const onStageMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!loupeSrc) {
        setLoupe(null);
        return;
      }
      const el = stageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        setLoupe(null);
        return;
      }
      const pctX = x / rect.width;
      const pctY = y / rect.height;
      const bgW = rect.width * LOUPE_ZOOM;
      const bgH = rect.height * LOUPE_ZOOM;
      setLoupe({
        x: x - LOUPE_SIZE / 2,
        y: y - LOUPE_SIZE / 2,
        bgX: LOUPE_SIZE / 2 - pctX * bgW,
        bgY: LOUPE_SIZE / 2 - pctY * bgH,
        bgW,
        bgH,
        src: loupeSrc,
      });
    },
    [loupeSrc],
  );

  const onStageMouseLeave = useCallback(() => {
    setLoupe(null);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "1") {
        setTab("sidebyside");
        e.preventDefault();
      } else if (e.key === "2") {
        setTab("swipe");
        e.preventDefault();
      } else if (e.key === "3") {
        setTab("diff");
        e.preventDefault();
      } else if (e.key === "4") {
        setTab("focus");
        e.preventDefault();
      } else if (e.key === "5") {
        setTab("blink");
        e.preventDefault();
      } else if ((e.key === "f" || e.key === "F") && tab === "focus") {
        if (changeBounds) setZoomToChange((z) => !z);
        e.preventDefault();
      } else if (tab === "swipe" && e.key === "ArrowLeft") {
        setPosition((p) => Math.max(0, p - SWIPE_NUDGE));
        e.preventDefault();
      } else if (tab === "swipe" && e.key === "ArrowRight") {
        setPosition((p) => Math.min(100, p + SWIPE_NUDGE));
        e.preventDefault();
      } else if (e.key === "+" || e.key === "=") {
        nudgeViewZoom(1);
        e.preventDefault();
      } else if (e.key === "-" || e.key === "_") {
        nudgeViewZoom(-1);
        e.preventDefault();
      } else if (e.key === "0") {
        resetViewZoom();
        e.preventDefault();
      }
    },
    [tab, changeBounds, nudgeViewZoom, resetViewZoom],
  );

  const stageCursor = tab === "swipe" ? "ew-resize" : "zoom-in";

  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = TAB_DEFS.findIndex((item) => item.id === tab);
      let nextIndex = currentIndex;
      if (event.key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + TAB_DEFS.length) % TAB_DEFS.length;
      } else if (event.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % TAB_DEFS.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = TAB_DEFS.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      const next = TAB_DEFS[nextIndex];
      setTab(next.id);
      const tabList = event.currentTarget.parentElement;
      const buttons =
        tabList?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[nextIndex]?.focus();
    },
    [tab],
  );

  return (
    <Root
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Visual compare. Keyboard: 1 two-up, 2 swipe, 3 diff, 4 focus, 5 blink, F toggles focus zoom, arrows nudge swipe, +/− view zoom, 0 sets 100%"
      data-zoom-mode={zoomState.mode}
      data-zoom-scale={viewZoom.toFixed(4)}
    >
      <Toolbar onWheel={onToolbarWheel} data-testid="compare-toolbar">
        <CompareTabList role="tablist" aria-label="Compare view">
          {TAB_DEFS.map((item) => (
            <CompareTabButton
              key={item.id}
              id={`visual-delta-compare-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls="visual-delta-compare-panel"
              tabIndex={tab === item.id ? 0 : -1}
              $selected={tab === item.id}
              onClick={() => setTab(item.id)}
              onKeyDown={onTabKeyDown}
            >
              {item.title}
            </CompareTabButton>
          ))}
        </CompareTabList>
        <TabTools>
          {tab === "focus" && changeBounds ? (
            <ToggleButton
              size="small"
              pressed={zoomToChange}
              onClick={() => setZoomToChange((z) => !z)}
              ariaLabel={
                zoomToChange
                  ? "Fit full image (exit zoom to change)"
                  : "Zoom to first change"
              }
              title={zoomToChange ? "Fit full image" : "Zoom to first change"}
            >
              {zoomToChange ? <CollapseIcon /> : <ExpandAltIcon />}
            </ToggleButton>
          ) : null}
          {tab === "swipe" && Math.abs(position - 50) > 0.5 ? (
            <ToggleButton
              size="small"
              pressed={false}
              onClick={() => setPosition(50)}
              ariaLabel={false}
              title="Reset swipe divider to center"
            >
              Reset
            </ToggleButton>
          ) : null}
          <CompareZoomControl
            value={{ ...zoomState, scale: viewZoom }}
            onChange={setZoomState}
            label="View zoom"
            subject="compare view"
          />
        </TabTools>
      </Toolbar>

      <ContentViewport
        ref={contentRef}
        id="visual-delta-compare-panel"
        role="tabpanel"
        aria-labelledby={`visual-delta-compare-tab-${tab}`}
        data-testid="compare-scroll-viewport"
        $sideBySide={tab === "sidebyside"}
      >
        {tab === "sidebyside" ? (
          <SideBySide
            data-testid="compare-side-by-side"
            style={{
              gridTemplateColumns: `minmax(0, 1fr) ${
                sideOverflow.y ? SHARED_SCROLL_RAIL_SIZE : 0
              }px`,
              gridTemplateRows: `minmax(0, 1fr) ${
                sideOverflow.x ? SHARED_SCROLL_RAIL_SIZE : 0
              }px`,
            }}
          >
            <SidePanes>
              <SideLabel style={{ gridColumn: 1, gridRow: 1 }}>
                Baseline
              </SideLabel>
              <SideLabel style={{ gridColumn: 2, gridRow: 1 }}>New</SideLabel>
              <SidePaneViewport
                ref={baselinePaneRef}
                data-testid="compare-baseline-scroll"
                style={{ gridColumn: 1, gridRow: 2 }}
                onScroll={onSidePaneScroll}
              >
                <SidePane
                  type="button"
                  aria-label="Open Baseline full image"
                  style={imageSizeStyle}
                  onClick={() =>
                    setLightboxImage(lightbox(baselineSrc, "Baseline"))
                  }
                >
                  <SideImg
                    src={baselineSrc}
                    alt="Baseline"
                    draggable={false}
                    style={imageSizeStyle}
                    onLoad={refreshSideScroll}
                  />
                </SidePane>
              </SidePaneViewport>
              <SidePaneViewport
                ref={actualPaneRef}
                data-testid="compare-new-scroll"
                style={{ gridColumn: 2, gridRow: 2 }}
                onScroll={onSidePaneScroll}
              >
                <SidePane
                  type="button"
                  aria-label="Open New full image"
                  style={imageSizeStyle}
                  onClick={() => setLightboxImage(lightbox(actualSrc, "New"))}
                >
                  <SideImg
                    src={actualSrc}
                    alt="New"
                    draggable={false}
                    style={imageSizeStyle}
                    onLoad={refreshSideScroll}
                  />
                </SidePane>
              </SidePaneViewport>
            </SidePanes>
            <VerticalScrollRail
              ref={verticalRailRef}
              data-testid="compare-shared-scroll-y"
              aria-label="Shared vertical comparison scroll"
              $visible={sideOverflow.y}
              onScroll={onVerticalRailScroll}
            >
              <ScrollSpacer ref={verticalSpacerRef} />
            </VerticalScrollRail>
            <HorizontalScrollRail
              ref={horizontalRailRef}
              data-testid="compare-shared-scroll-x"
              aria-label="Shared horizontal comparison scroll"
              $visible={sideOverflow.x}
              onScroll={onHorizontalRailScroll}
            >
              <ScrollSpacer ref={horizontalSpacerRef} />
            </HorizontalScrollRail>
            <ScrollCorner $visible={sideOverflow.x && sideOverflow.y} />
          </SideBySide>
        ) : null}

        {tab === "swipe" ? (
          <>
            <Labels style={{ width: scaledWidth, margin: "0 auto" }}>
              <span>Baseline</span>
              <span>New</span>
            </Labels>
            <Stage
              ref={stageRef}
              style={{ ...stageSizeStyle, cursor: stageCursor }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onKeyDown={openOnKeyboard(
                position >= 50
                  ? lightbox(baselineSrc, "Baseline")
                  : lightbox(actualSrc, "New"),
              )}
              role="button"
              tabIndex={0}
              aria-label={`Open Swipe comparison full image, ${Math.round(position)}% baseline revealed`}
            >
              <Stack style={stackStyle} data-testid="compare-stack">
                <LayerImg src={actualSrc} alt="" draggable={false} />
                <TopLayer
                  style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
                >
                  <TopImg src={baselineSrc} alt="" draggable={false} />
                </TopLayer>
                <Handle style={{ left: `${position}%` }} />
              </Stack>
            </Stage>
          </>
        ) : null}

        {tab === "diff" ? (
          <Stage
            ref={stageRef}
            style={{ ...stageSizeStyle, cursor: stageCursor }}
            onMouseMove={onStageMouseMove}
            onMouseLeave={onStageMouseLeave}
            onClick={() => setLightboxImage(lightbox(diffSrc, "Diff"))}
            onKeyDown={openOnKeyboard(lightbox(diffSrc, "Diff"))}
            role="button"
            tabIndex={0}
            aria-label="Open Diff full image"
          >
            <Stack style={stackStyle} data-testid="compare-stack">
              <LayerImg src={diffSrc} alt="Diff heatmap" draggable={false} />
            </Stack>
            {loupe ? (
              <Loupe
                style={{
                  left: loupe.x,
                  top: loupe.y,
                  backgroundImage: `url(${loupe.src})`,
                  backgroundSize: `${loupe.bgW}px ${loupe.bgH}px`,
                  backgroundPosition: `${loupe.bgX}px ${loupe.bgY}px`,
                }}
              />
            ) : null}
          </Stage>
        ) : null}

        {tab === "focus" ? (
          <Stage
            ref={stageRef}
            style={{ ...stageSizeStyle, cursor: stageCursor }}
            onMouseMove={onStageMouseMove}
            onMouseLeave={onStageMouseLeave}
            onClick={() => setLightboxImage(lightbox(focusSrc, "Focus"))}
            onKeyDown={openOnKeyboard(lightbox(focusSrc, "Focus"))}
            role="button"
            tabIndex={0}
            aria-label="Open Focus full image"
          >
            <Stack
              data-testid="compare-stack"
              style={{
                ...stackStyle,
                willChange: "transform",
                ...focusFrame,
              }}
            >
              <LayerImg
                src={focusSrc}
                alt="Focus spotlight"
                draggable={false}
              />
            </Stack>
            {loupe ? (
              <Loupe
                style={{
                  left: loupe.x,
                  top: loupe.y,
                  backgroundImage: `url(${loupe.src})`,
                  backgroundSize: `${loupe.bgW}px ${loupe.bgH}px`,
                  backgroundPosition: `${loupe.bgX}px ${loupe.bgY}px`,
                }}
              />
            ) : null}
          </Stage>
        ) : null}

        {tab === "blink" ? (
          <>
            <Labels
              style={{
                width: scaledWidth,
                minHeight: 24,
                margin: "0 auto",
                alignItems: "center",
              }}
              data-testid="blink-label-row"
            >
              <span>{blinkShowActual ? "New" : "Baseline"}</span>
              <span />
            </Labels>
            <Stage
              ref={stageRef}
              style={{ ...stageSizeStyle, cursor: "zoom-in" }}
              onClick={() =>
                setLightboxImage(
                  lightbox(
                    blinkShowActual ? actualSrc : baselineSrc,
                    blinkShowActual ? "New" : "Baseline",
                  ),
                )
              }
              onKeyDown={openOnKeyboard(
                lightbox(
                  blinkShowActual ? actualSrc : baselineSrc,
                  blinkShowActual ? "New" : "Baseline",
                ),
              )}
              role="button"
              tabIndex={0}
              aria-label={`Open ${blinkShowActual ? "New" : "Baseline"} blink image full size`}
            >
              <Stack style={stackStyle} data-testid="compare-stack">
                <LayerImg
                  src={blinkShowActual ? actualSrc : baselineSrc}
                  alt={blinkShowActual ? "New" : "Baseline"}
                  draggable={false}
                />
              </Stack>
            </Stage>
          </>
        ) : null}
      </ContentViewport>
      <ImageLightbox
        image={lightboxImage}
        onClose={() => setLightboxImage(null)}
      />
    </Root>
  );
}
