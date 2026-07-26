import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Modal } from "storybook/internal/components";
import { styled } from "storybook/theming";
import {
  resolvedCompareZoomScale,
  type CompareZoomState,
} from "../shared/compare-zoom.js";
import { CompareZoomControl } from "./CompareZoomControl.js";

export type LightboxImage = {
  src: string;
  label: string;
  width: number;
  height: number;
};

const LightboxModal = styled(Modal)({
  maxWidth: "calc(100% - 32px) !important",
  maxHeight: "calc(100% - 32px) !important",
  overflow: "hidden",
});

const Shell = styled.div({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
});

const Header = styled.div(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flex: "0 0 auto",
  minHeight: 44,
  padding: "8px 10px 8px 14px",
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: theme.background.bar,
}));

const Title = styled.h2(({ theme }) => ({
  minWidth: 0,
  margin: 0,
  overflow: "hidden",
  color: theme.color.defaultText,
  fontSize: 13,
  fontWeight: 700,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}));

const Tools = styled.div({
  display: "flex",
  alignItems: "center",
  gap: 8,
  flex: "0 0 auto",
});

const Viewport = styled.div({
  flex: "1 1 auto",
  minWidth: 0,
  minHeight: 0,
  overflow: "auto",
  overscrollBehavior: "contain",
  backgroundColor: "#202124",
  backgroundImage: `
    linear-gradient(45deg, #292b2e 25%, transparent 25%),
    linear-gradient(-45deg, #292b2e 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #292b2e 75%),
    linear-gradient(-45deg, transparent 75%, #292b2e 75%)
  `,
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
});

const Centerer = styled.div({
  display: "grid",
  placeItems: "center",
  width: "max-content",
  height: "max-content",
  minWidth: "100%",
  minHeight: "100%",
});

const FullImage = styled.img({
  display: "block",
  flex: "0 0 auto",
  maxWidth: "none",
  maxHeight: "none",
  objectFit: "fill",
});

export function ImageLightbox({
  image,
  onClose,
}: {
  image: LightboxImage | null;
  onClose: () => void;
}) {
  const [zoomState, setZoomState] = useState<CompareZoomState>({
    mode: "custom",
    scale: 1,
  });
  const [available, setAvailable] = useState({ width: 1, height: 1 });
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (image) setZoomState({ mode: "custom", scale: 1 });
  }, [image?.src, image?.label]);

  const measureViewport = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const next = { width: rect.width, height: rect.height };
    setAvailable(next);
    return next;
  }, []);

  useLayoutEffect(() => {
    if (!image) return;
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(measureViewport);
    observer.observe(element);
    const frame = window.requestAnimationFrame(measureViewport);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [image, measureViewport]);

  const fitInput = useMemo(
    () => ({
      availableWidth: available.width,
      availableHeight: available.height,
      contentWidth: Math.max(1, image?.width ?? 1),
      contentHeight: Math.max(1, image?.height ?? 1),
    }),
    [available, image?.height, image?.width],
  );
  const scale = resolvedCompareZoomScale(zoomState, fitInput);
  const scaledWidth = Math.max(1, (image?.width ?? 1) * scale);
  const scaledHeight = Math.max(1, (image?.height ?? 1) * scale);
  const handleZoomChange = useCallback(
    (next: CompareZoomState) => {
      if (next.mode === "fit") measureViewport();
      setZoomState(next);
    },
    [measureViewport],
  );

  if (!image) return null;

  return (
    <LightboxModal
      open
      width="calc(100% - 32px)"
      height="calc(100% - 32px)"
      ariaLabel={`${image.label} full image`}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Shell
        data-testid="image-lightbox"
        data-zoom-mode={zoomState.mode}
        data-zoom-scale={scale.toFixed(4)}
      >
        <Header>
          <Title>{image.label}</Title>
          <Tools>
            <CompareZoomControl
              value={{ ...zoomState, scale }}
              onChange={handleZoomChange}
              label="Image zoom"
              subject="full image"
            />
            <Modal.Close />
          </Tools>
        </Header>
        <Viewport ref={viewportRef} data-testid="image-lightbox-viewport">
          <Centerer data-testid="image-lightbox-centerer">
            <FullImage
              src={image.src}
              alt={`${image.label} full image`}
              draggable={false}
              style={{ width: scaledWidth, height: scaledHeight }}
            />
          </Centerer>
        </Viewport>
      </Shell>
    </LightboxModal>
  );
}
