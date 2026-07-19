import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ToggleButton } from "storybook/internal/components";
import { styled } from "storybook/theming";
import type { ChangeBounds } from "../types.js";

type CompareMode = "swipe" | "sidebyside" | "diff" | "focus" | "blink";

const LOUPE_SIZE = 120;
const LOUPE_ZOOM = 2.5;
const BLINK_MS = 280;
const SWIPE_NUDGE = 5;

const Root = styled.div({
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  outline: "none",
});

const ModeRow = styled.div({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  flexWrap: "wrap",
});

const ModeGroup = styled.div({
  display: "flex",
  gap: "0.25rem",
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

const Stage = styled.div(({ theme }) => ({
  position: "relative",
  width: "100%",
  maxHeight: "420px",
  overflow: "hidden",
  border: `1px solid ${theme.appBorderColor}`,
  userSelect: "none",
  touchAction: "none",
  ...checkerboard,
}));

const StageInner = styled.div({
  position: "relative",
  width: "100%",
  willChange: "transform",
});

const LayerImg = styled.img({
  display: "block",
  width: "100%",
  height: "auto",
  maxHeight: "420px",
  objectFit: "contain",
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
  objectFit: "contain",
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

const Hint = styled.p(({ theme }) => ({
  margin: 0,
  fontSize: "11px",
  color: theme.color.mediumdark,
}));

const SideBySide = styled.div({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.5rem",
});

const SidePane = styled.div(({ theme }) => ({
  ...checkerboard,
  border: `1px solid ${theme.appBorderColor}`,
  overflow: "hidden",
  maxHeight: "420px",
}));

const SideLabel = styled.div(({ theme }) => ({
  fontSize: "11px",
  fontWeight: 600,
  color: theme.color.mediumdark,
  marginBottom: "0.25rem",
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

const ActionRow = styled.div({
  display: "flex",
  gap: "0.25rem",
  alignItems: "center",
});

function modeHint(mode: CompareMode, focused: boolean): string {
  switch (mode) {
    case "swipe":
      return "Drag divider · ←/→ nudge · 1–3 modes · F focus · B blink";
    case "sidebyside":
      return "Baseline vs actual · 1 Swipe · 3 Diff · F Focus · B Blink";
    case "diff":
      return "Pixelmatch heatmap · hover for loupe";
    case "focus":
      return focused
        ? "Spotlight + zoom to change · hover for loupe · F toggles zoom"
        : "Spotlight on changes · hover for loupe";
    case "blink":
      return "Strobe baseline ↔ actual";
  }
}

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
  const [mode, setMode] = useState<CompareMode>("swipe");
  const [position, setPosition] = useState(50);
  const [blinkShowActual, setBlinkShowActual] = useState(true);
  const [zoomToChange, setZoomToChange] = useState(true);
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
  const dragging = useRef(false);

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
      if (mode !== "swipe") return;
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setFromClientX(e.clientX);
    },
    [mode, setFromClientX],
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

  // Blink strobe
  useEffect(() => {
    if (mode !== "blink") return;
    const id = window.setInterval(() => {
      setBlinkShowActual((v) => !v);
    }, BLINK_MS);
    return () => window.clearInterval(id);
  }, [mode]);

  // Auto-enable zoom when entering focus with a change box
  useEffect(() => {
    if (mode === "focus" && changeBounds) {
      setZoomToChange(true);
    }
  }, [mode, changeBounds]);

  const focusFrame = useMemo(() => {
    if (
      mode !== "focus" ||
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
  }, [mode, zoomToChange, changeBounds, imageWidth, imageHeight]);

  // Loupe maps stage coords → image; skip while Focus zoom is active.
  const loupeSrc =
    mode === "diff"
      ? diffSrc
      : mode === "focus" && !zoomToChange
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
        setMode("swipe");
        e.preventDefault();
      } else if (e.key === "2") {
        setMode("sidebyside");
        e.preventDefault();
      } else if (e.key === "3") {
        setMode("diff");
        e.preventDefault();
      } else if (e.key === "f" || e.key === "F") {
        if (mode === "focus") {
          setZoomToChange((z) => !z);
        } else {
          setMode("focus");
        }
        e.preventDefault();
      } else if (e.key === "b" || e.key === "B") {
        setMode("blink");
        e.preventDefault();
      } else if (mode === "swipe" && e.key === "ArrowLeft") {
        setPosition((p) => Math.max(0, p - SWIPE_NUDGE));
        e.preventDefault();
      } else if (mode === "swipe" && e.key === "ArrowRight") {
        setPosition((p) => Math.min(100, p + SWIPE_NUDGE));
        e.preventDefault();
      }
    },
    [mode],
  );

  const stageCursor =
    mode === "swipe" ? "ew-resize" : loupeSrc ? "none" : "default";

  return (
    <Root
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Visual compare. Keyboard: 1 swipe, 2 side by side, 3 diff, F focus, B blink, arrows nudge swipe"
    >
      <ModeRow>
        <ModeGroup>
          <ToggleButton
            size="small"
            pressed={mode === "swipe"}
            onClick={() => setMode("swipe")}
            aria-label="Swipe compare baseline and actual"
          >
            Swipe
          </ToggleButton>
          <ToggleButton
            size="small"
            pressed={mode === "sidebyside"}
            onClick={() => setMode("sidebyside")}
            aria-label="Side by side baseline and actual"
          >
            2-up
          </ToggleButton>
          <ToggleButton
            size="small"
            pressed={mode === "diff"}
            onClick={() => setMode("diff")}
            aria-label="Show superimposed diff heatmap"
          >
            Diff
          </ToggleButton>
          <ToggleButton
            size="small"
            pressed={mode === "focus"}
            onClick={() => setMode("focus")}
            aria-label="Focus spotlight on changed pixels"
          >
            Focus
          </ToggleButton>
          <ToggleButton
            size="small"
            pressed={mode === "blink"}
            onClick={() => setMode("blink")}
            aria-label="Blink strobe between baseline and actual"
          >
            Blink
          </ToggleButton>
        </ModeGroup>
        <ActionRow>
          {mode === "focus" && changeBounds ? (
            <ToggleButton
              size="small"
              pressed={zoomToChange}
              onClick={() => setZoomToChange((z) => !z)}
              aria-label="Zoom to first change"
            >
              Zoom
            </ToggleButton>
          ) : null}
          {mode === "swipe" && Math.abs(position - 50) > 0.5 ? (
            <ToggleButton
              size="small"
              pressed={false}
              onClick={() => setPosition(50)}
              aria-label="Reset swipe divider to center"
            >
              Reset
            </ToggleButton>
          ) : null}
          <Hint>{modeHint(mode, zoomToChange && !!changeBounds)}</Hint>
        </ActionRow>
      </ModeRow>

      {mode === "swipe" ? (
        <>
          <Labels>
            <span>Baseline</span>
            <span>Actual</span>
          </Labels>
          <Stage
            ref={stageRef}
            style={{ cursor: stageCursor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="img"
            aria-label={`Swipe comparison, ${Math.round(position)}% baseline revealed`}
          >
            <LayerImg src={actualSrc} alt="" draggable={false} />
            <TopLayer style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
              <TopImg src={baselineSrc} alt="" draggable={false} />
            </TopLayer>
            <Handle style={{ left: `${position}%` }} />
          </Stage>
        </>
      ) : null}

      {mode === "sidebyside" ? (
        <SideBySide>
          <div>
            <SideLabel>Baseline</SideLabel>
            <SidePane>
              <LayerImg src={baselineSrc} alt="Baseline" draggable={false} />
            </SidePane>
          </div>
          <div>
            <SideLabel>Actual</SideLabel>
            <SidePane>
              <LayerImg src={actualSrc} alt="Actual" draggable={false} />
            </SidePane>
          </div>
        </SideBySide>
      ) : null}

      {mode === "diff" || mode === "focus" ? (
        <Stage
          ref={stageRef}
          style={{ cursor: stageCursor }}
          onMouseMove={onStageMouseMove}
          onMouseLeave={onStageMouseLeave}
          role="img"
          aria-label={mode === "diff" ? "Diff heatmap" : "Focus spotlight"}
        >
          <StageInner style={mode === "focus" ? focusFrame : undefined}>
            <LayerImg
              src={mode === "diff" ? diffSrc : focusSrc}
              alt={mode === "diff" ? "Diff heatmap" : "Focus spotlight"}
              draggable={false}
            />
          </StageInner>
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

      {mode === "blink" ? (
        <Stage style={{ cursor: "default" }} role="img" aria-label="Blink compare">
          <LayerImg
            src={blinkShowActual ? actualSrc : baselineSrc}
            alt={blinkShowActual ? "Actual" : "Baseline"}
            draggable={false}
          />
          <Labels
            style={{
              position: "absolute",
              top: 6,
              left: 8,
              right: 8,
              pointerEvents: "none",
            }}
          >
            <span>{blinkShowActual ? "Actual" : "Baseline"}</span>
            <span />
          </Labels>
        </Stage>
      ) : null}
    </Root>
  );
}
