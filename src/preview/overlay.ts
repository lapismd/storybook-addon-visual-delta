import { useChannel, useEffect } from "storybook/preview-api";
import type { DecoratorFunction } from "storybook/internal/types";
import { EVENTS, type VisualDeltaImage, type VisualDeltaParams } from "../constants.js";

let dragCleanupRef: (() => void) | null = null;

function getCanvasScale(element: Element): number {
  const bodyStyle = window.getComputedStyle(document.body);
  const bodyTransform = bodyStyle.transform;
  if (bodyTransform && bodyTransform !== "none") {
    try {
      const matrix = new DOMMatrix(bodyTransform);
      if (matrix.a !== 1 || matrix.d !== 1) {
        return matrix.a || matrix.d || 1;
      }
    } catch {
      /* ignore */
    }
  }
  const bodyInlineTransform = document.body.style.transform;
  if (bodyInlineTransform && bodyInlineTransform !== "none") {
    try {
      const matrix = new DOMMatrix(bodyInlineTransform);
      if (matrix.a !== 1 || matrix.d !== 1) {
        return matrix.a || matrix.d || 1;
      }
    } catch {
      /* ignore */
    }
  }
  let current = element.parentElement;
  while (current && current !== document.body) {
    const computedStyle = window.getComputedStyle(current);
    const transform = computedStyle.transform;
    if (transform && transform !== "none") {
      try {
        const matrix = new DOMMatrix(transform);
        if (matrix.a !== 1 || matrix.d !== 1) {
          return matrix.a || matrix.d || 1;
        }
      } catch {
        /* ignore */
      }
    }
    current = current.parentElement;
  }
  return 1;
}

function setupDragOverlay(overlay: HTMLElement): () => void {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let translateX = 0;
  let translateY = 0;
  let parentElement: HTMLElement | null = null;

  const getCurrentTransform = () => {
    const transform = overlay.style.transform || "";
    const match = transform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      return {
        x: Number.isNaN(x) ? 0 : x,
        y: Number.isNaN(y) ? 0 : y,
      };
    }
    return { x: 0, y: 0 };
  };

  const handleMouseDown = (e: MouseEvent) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    parentElement = overlay.parentElement;
    if (!parentElement) return;
    const currentTransform = getCurrentTransform();
    translateX = currentTransform.x;
    translateY = currentTransform.y;
    overlay.style.cursor = "grabbing";
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !parentElement) return;
    const scale = getCanvasScale(overlay);
    const deltaX = (e.clientX - startX) / scale;
    const deltaY = (e.clientY - startY) / scale;
    overlay.style.transform = `translate(${translateX + deltaX}px, ${translateY + deltaY}px)`;
  };

  const handleMouseUp = () => {
    isDragging = false;
    overlay.style.cursor = "grab";
  };

  overlay.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
  return () => {
    overlay.removeEventListener("mousedown", handleMouseDown);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };
}

export const withSelectImage: DecoratorFunction = (storyFn, context) => {
  const canvasElement = context.canvasElement as HTMLElement;
  const visualDeltaParams = context.parameters?.visualDelta as
    | VisualDeltaParams
    | undefined;
  let currentOpacity = visualDeltaParams?.opacity ?? 0.5;
  let currentColorInversion = visualDeltaParams?.colorInversion ?? false;

  const updateOverlayStyle = (overlay: HTMLElement | null) => {
    if (!overlay) return;
    overlay.style.mixBlendMode = currentColorInversion ? "difference" : "normal";
    overlay.style.opacity = String(currentOpacity);
  };

  const calculateAnchorPosition = (
    imageItem: VisualDeltaImage,
    canvasParent: HTMLElement,
  ) => {
    let x = imageItem.offsetX ?? 0;
    let y = imageItem.offsetY ?? 0;
    const scale = getCanvasScale(canvasParent);
    if (imageItem.anchor) {
      const anchorElement = document.querySelector(imageItem.anchor);
      if (anchorElement) {
        const anchorRect = anchorElement.getBoundingClientRect();
        const parentRect = canvasParent.getBoundingClientRect();
        x += (anchorRect.left - parentRect.left) / scale;
        y += (anchorRect.top - parentRect.top) / scale;
      }
    } else if (imageItem.align === "canvas") {
      const canvasRect = canvasElement.getBoundingClientRect();
      const parentRect = canvasParent.getBoundingClientRect();
      x += (canvasRect.left - parentRect.left) / scale;
      y += (canvasRect.top - parentRect.top) / scale;
    }
    return { x, y };
  };

  let lastSelection: {
    index: number;
    images: VisualDeltaImage[];
  } | null = null;

  const applyOverlayPosition = (
    overlay: HTMLElement,
    imageItem: VisualDeltaImage,
  ) => {
    const canvasParent = canvasElement.parentElement;
    if (!canvasParent) return;
    const { x, y } = calculateAnchorPosition(imageItem, canvasParent);
    overlay.style.transform = `translate(${x}px, ${y}px)`;
  };

  const emit = useChannel({
    [EVENTS.SELECT_IMAGE]: (data: {
      index: number;
      images?: VisualDeltaImage[];
    }) => {
      const overlayId = "visual-delta-overlay";
      let overlay = document.getElementById(overlayId);
      if (
        data.index === -1 ||
        !data.images ||
        data.index >= data.images.length
      ) {
        lastSelection = null;
        if (overlay) {
          if (dragCleanupRef) {
            dragCleanupRef();
            dragCleanupRef = null;
          }
          overlay.remove();
        }
        return;
      }
      const selectedImageItem = data.images[data.index];
      if (!selectedImageItem) return;
      lastSelection = { index: data.index, images: data.images };
      const canvasParent = canvasElement.parentElement;
      if (!canvasParent) return;
      const { x: initialX, y: initialY } = calculateAnchorPosition(
        selectedImageItem,
        canvasParent,
      );
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = overlayId;
        const blendMode = currentColorInversion
          ? "mix-blend-mode: difference;"
          : "";
        overlay.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: auto;
          z-index: 9999;
          ${blendMode}
          opacity: ${currentOpacity};
          cursor: grab;
          transform: translate(${initialX}px, ${initialY}px);
        `;
        const img = document.createElement("img");
        img.style.cssText = `
          width: auto;
          height: auto;
          max-width: none;
          max-height: none;
          pointer-events: none;
          user-select: none;
        `;
        overlay.appendChild(img);
        canvasParent.style.position = "relative";
        canvasParent.appendChild(overlay);
        dragCleanupRef = setupDragOverlay(overlay);
        updateOverlayStyle(overlay);
      } else {
        overlay.style.transform = `translate(${initialX}px, ${initialY}px)`;
        updateOverlayStyle(overlay);
      }
      const img = overlay.querySelector("img");
      if (img) {
        img.src = selectedImageItem.src;
      }
    },
    [EVENTS.RESET_OVERLAY]: () => {
      const overlay = document.getElementById("visual-delta-overlay");
      if (!overlay || !lastSelection) return;
      const imageItem = lastSelection.images[lastSelection.index];
      if (!imageItem) return;
      applyOverlayPosition(overlay, imageItem);
    },
    [EVENTS.UPDATE_OVERLAY_STYLE]: (data: {
      opacity: number;
      colorInversion: boolean;
    }) => {
      currentOpacity = data.opacity;
      currentColorInversion = data.colorInversion;
      updateOverlayStyle(document.getElementById("visual-delta-overlay"));
    },
    [EVENTS.HIDE_OVERLAY]: () => {
      const overlay = document.getElementById("visual-delta-overlay");
      if (overlay) {
        overlay.style.display = "none";
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            emit(EVENTS.OVERLAY_HIDDEN, {});
          });
        });
      } else {
        emit(EVENTS.OVERLAY_HIDDEN, {});
      }
    },
    [EVENTS.SHOW_OVERLAY]: () => {
      const overlay = document.getElementById("visual-delta-overlay");
      if (overlay) {
        overlay.style.display = "";
      }
    },
  });

  useEffect(() => {
    return () => {
      if (dragCleanupRef) {
        dragCleanupRef();
        dragCleanupRef = null;
      }
      document.getElementById("visual-delta-overlay")?.remove();
    };
  }, []);

  return storyFn();
};
