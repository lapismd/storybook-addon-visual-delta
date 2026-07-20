import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CollapseIcon, ExpandAltIcon } from "@storybook/icons";
import {
  TabList,
  ToggleButton,
  useTabsState,
} from "storybook/internal/components";
import { styled } from "storybook/theming";
import type { ChangeBounds } from "../types.js";
import { ButtonGroup } from "./styled.js";

type CompareTab = "sidebyside" | "swipe" | "diff" | "focus" | "blink";

const LOUPE_SIZE = 120;
const LOUPE_ZOOM = 2.5;
const BLINK_MS = 280;
const SWIPE_NUDGE = 5;
const STAGE_MAX_HEIGHT = 420;
const TWO_UP_MAX_HEIGHT = 520;
const VIEW_ZOOM_MIN = 0.5;
const VIEW_ZOOM_MAX = 3;
const VIEW_ZOOM_STEP = 0.25;
const VIEW_ZOOM_STORAGE_KEY =
  "storybook-addon-visual-delta/compare-view-zoom";

const TAB_DEFS: { id: CompareTab; title: string }[] = [
  { id: "sidebyside", title: "2-up" },
  { id: "swipe", title: "Swipe" },
  { id: "diff", title: "Diff" },
  { id: "focus", title: "Focus" },
  { id: "blink", title: "Blink" },
];

function clampViewZoom(value: number): number {
  const stepped = Math.round(value / VIEW_ZOOM_STEP) * VIEW_ZOOM_STEP;
  return Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, stepped));
}

function loadViewZoom(): number {
  if (typeof localStorage === "undefined") return 1;
  try {
    const raw = localStorage.getItem(VIEW_ZOOM_STORAGE_KEY);
    if (raw == null) return 1;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 1;
    return clampViewZoom(n);
  } catch {
    return 1;
  }
}

function saveViewZoom(zoom: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(VIEW_ZOOM_STORAGE_KEY, String(clampViewZoom(zoom)));
  } catch {
    /* quota / private mode */
  }
}

const Root = styled.div({
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  outline: "none",
  overflow: "auto",
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

const Stage = styled.div({
  position: "relative",
  maxWidth: "none",
  margin: "0 auto",
  overflow: "hidden",
  userSelect: "none",
  touchAction: "none",
});

const Stack = styled.div(({ theme }) => ({
  position: "relative",
  width: "100%",
  lineHeight: 0,
  overflow: "hidden",
  outline: `1px solid ${theme.appBorderColor}`,
  outlineOffset: 0,
  boxSizing: "border-box",
  ...checkerboard,
}));

const LayerImg = styled.img({
  display: "block",
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
  gridTemplateColumns: "1fr 1fr",
  gap: "0.75rem",
  width: "100%",
  alignItems: "start",
});

const SideColumn = styled.div({
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  minWidth: 0,
});

const SidePane = styled.div<{ $maxHeight: number }>(({ theme, $maxHeight }) => ({
  ...checkerboard,
  border: `1px solid ${theme.appBorderColor}`,
  overflow: "auto",
  maxHeight: `${$maxHeight}px`,
  width: "100%",
}));

const SideImg = styled.img({
  display: "block",
  width: "100%",
  height: "auto",
  objectFit: "contain",
  pointerEvents: "none",
});

const SideLabel = styled.div(({ theme }) => ({
  fontSize: "12px",
  fontWeight: 700,
  color: theme.color.defaultText,
}));

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
}: {
  baselineSrc: string;
  actualSrc: string;
  diffSrc: string;
  focusSrc: string;
  changeBounds: ChangeBounds | null;
  imageWidth: number;
  imageHeight: number;
}) {
  const [tab, setTab] = useState<CompareTab>("sidebyside");
  const [position, setPosition] = useState(50);
  const [blinkShowActual, setBlinkShowActual] = useState(true);
  const [zoomToChange, setZoomToChange] = useState(true);
  const [viewZoom, setViewZoom] = useState(loadViewZoom);
  const [loupe, setLoupe] = useState<{
    x: number;
    y: number;
    bgX: number;
    bgY: number;
    bgW: number;
    bgH: number;
    src: string;
  } | null>(null);

  const tabsState = useTabsState({
    selected: tab,
    onSelectionChange: (key) => setTab(key as CompareTab),
    tabs: TAB_DEFS,
  });

  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    saveViewZoom(viewZoom);
  }, [viewZoom]);

  const stageMaxHeight = STAGE_MAX_HEIGHT * viewZoom;
  const twoUpMaxHeight = TWO_UP_MAX_HEIGHT * viewZoom;
  const isFocusTab = tab === "focus";

  const stageSizeStyle = useMemo(
    () => ({
      width: `calc((100% - 0.5rem) / 2 * ${viewZoom})`,
    }),
    [viewZoom],
  );

  const sideBySideSizeStyle = useMemo(
    () => ({
      width: viewZoom === 1 ? "100%" : `calc(100% * ${viewZoom})`,
    }),
    [viewZoom],
  );

  const stackStyle = useMemo(() => {
    if (imageWidth < 1 || imageHeight < 1) {
      return { width: "100%" as const, maxHeight: stageMaxHeight };
    }
    return {
      width: "100%" as const,
      height: "auto" as const,
      maxHeight: stageMaxHeight,
      aspectRatio: `${imageWidth} / ${imageHeight}`,
    };
  }, [imageWidth, imageHeight, stageMaxHeight]);

  const nudgeViewZoom = useCallback((delta: number) => {
    setViewZoom((z) => clampViewZoom(z + delta));
  }, []);

  const resetViewZoom = useCallback(() => {
    setViewZoom(1);
  }, []);

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
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setFromClientX(e.clientX);
    },
    [tab, setFromClientX],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      setFromClientX(e.clientX);
    },
    [setFromClientX],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
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
    const ox =
      ((changeBounds.x + changeBounds.width / 2) / imageWidth) * 100;
    const oy =
      ((changeBounds.y + changeBounds.height / 2) / imageHeight) * 100;
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
        setZoomToChange((z) => !z);
        e.preventDefault();
      } else if (tab === "swipe" && e.key === "ArrowLeft") {
        setPosition((p) => Math.max(0, p - SWIPE_NUDGE));
        e.preventDefault();
      } else if (tab === "swipe" && e.key === "ArrowRight") {
        setPosition((p) => Math.min(100, p + SWIPE_NUDGE));
        e.preventDefault();
      } else if (e.key === "+" || e.key === "=") {
        nudgeViewZoom(VIEW_ZOOM_STEP);
        e.preventDefault();
      } else if (e.key === "-" || e.key === "_") {
        nudgeViewZoom(-VIEW_ZOOM_STEP);
        e.preventDefault();
      } else if (e.key === "0") {
        resetViewZoom();
        e.preventDefault();
      }
    },
    [tab, nudgeViewZoom, resetViewZoom],
  );

  const stageCursor =
    tab === "swipe" ? "ew-resize" : loupeSrc ? "none" : "default";

  return (
    <Root
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Visual compare. Keyboard: 1 two-up, 2 swipe, 3 diff, 4 focus, 5 blink, F toggles focus zoom, arrows nudge swipe, +/− view zoom, 0 reset zoom"
    >
      <Toolbar>
        <TabList state={tabsState} aria-label="Compare view" />
        <TabTools>
          {tab === "focus" ? (
            <ToggleButton
              size="small"
              pressed={zoomToChange}
              disabled={!changeBounds}
              onClick={() => setZoomToChange((z) => !z)}
              aria-label={
                zoomToChange
                  ? "Fit full image (exit zoom to change)"
                  : "Zoom to first change"
              }
              title={
                zoomToChange
                  ? "Fit full image"
                  : "Zoom to first change"
              }
            >
              {zoomToChange ? <CollapseIcon /> : <ExpandAltIcon />}
            </ToggleButton>
          ) : null}
          {tab === "swipe" && Math.abs(position - 50) > 0.5 ? (
            <ToggleButton
              size="small"
              pressed={false}
              onClick={() => setPosition(50)}
              aria-label="Reset swipe divider to center"
            >
              Reset
            </ToggleButton>
          ) : null}
          <ButtonGroup role="group" aria-label="View zoom">
            <ToggleButton
              size="small"
              pressed={false}
              disabled={viewZoom <= VIEW_ZOOM_MIN}
              onClick={() => nudgeViewZoom(-VIEW_ZOOM_STEP)}
              aria-label="Zoom out compare view"
              title="Zoom out (−)"
            >
              −
            </ToggleButton>
            <ToggleButton
              size="small"
              pressed={false}
              disabled={viewZoom === 1}
              onClick={resetViewZoom}
              aria-label="Reset view zoom"
              title={
                viewZoom === 1
                  ? "View zoom 100%"
                  : "Reset zoom to 100% (0)"
              }
              style={{
                minWidth: "3.25rem",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {Math.round(viewZoom * 100)}%
            </ToggleButton>
            <ToggleButton
              size="small"
              pressed={false}
              disabled={viewZoom >= VIEW_ZOOM_MAX}
              onClick={() => nudgeViewZoom(VIEW_ZOOM_STEP)}
              aria-label="Zoom in compare view"
              title="Zoom in (+)"
            >
              +
            </ToggleButton>
          </ButtonGroup>
        </TabTools>
      </Toolbar>

      {tab === "sidebyside" ? (
        <SideBySide style={sideBySideSizeStyle}>
          <SideColumn>
            <SideLabel>Baseline</SideLabel>
            <SidePane $maxHeight={twoUpMaxHeight}>
              <SideImg src={baselineSrc} alt="Baseline" draggable={false} />
            </SidePane>
          </SideColumn>
          <SideColumn>
            <SideLabel>New</SideLabel>
            <SidePane $maxHeight={twoUpMaxHeight}>
              <SideImg src={actualSrc} alt="New" draggable={false} />
            </SidePane>
          </SideColumn>
        </SideBySide>
      ) : null}

      {tab === "swipe" ? (
        <>
          <Labels style={{ ...stageSizeStyle, margin: "0 auto" }}>
            <span>Baseline</span>
            <span>New</span>
          </Labels>
          <Stage
            ref={stageRef}
            style={{ ...stageSizeStyle, cursor: stageCursor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="img"
            aria-label={`Swipe comparison, ${Math.round(position)}% baseline revealed`}
          >
            <Stack style={stackStyle}>
              <LayerImg src={actualSrc} alt="" draggable={false} />
              <TopLayer style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
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
          role="img"
          aria-label="Diff heatmap"
        >
          <Stack style={stackStyle}>
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
          role="img"
          aria-label="Focus spotlight"
        >
          <Stack
            style={{
              ...stackStyle,
              willChange: "transform",
              ...focusFrame,
            }}
          >
            <LayerImg src={focusSrc} alt="Focus spotlight" draggable={false} />
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
        <Stage
          ref={stageRef}
          style={{ ...stageSizeStyle, cursor: "default" }}
          role="img"
          aria-label="Blink compare"
        >
          <Stack style={stackStyle}>
            <LayerImg
              src={blinkShowActual ? actualSrc : baselineSrc}
              alt={blinkShowActual ? "New" : "Baseline"}
              draggable={false}
            />
          </Stack>
          <Labels
            style={{
              position: "absolute",
              top: 6,
              left: 8,
              right: 8,
              pointerEvents: "none",
            }}
          >
            <span>{blinkShowActual ? "New" : "Baseline"}</span>
            <span />
          </Labels>
        </Stage>
      ) : null}
    </Root>
  );
}
