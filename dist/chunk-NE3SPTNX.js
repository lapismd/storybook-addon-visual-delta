import { useChannel, useEffect } from 'storybook/preview-api';

// src/constants.ts
var ADDON_ID = "visual-delta";
var KEY = `visual-delta`;
var EVENTS = {
  // 初始化图片事件（从 preview 发送到 manager）
  INIT_IMAGE: `${ADDON_ID}/init-image`,
  // 选中图片事件（从 manager 发送到 preview）
  SELECT_IMAGE: `${ADDON_ID}/select-image`,
  // 更新覆盖层样式事件（从 manager 发送到 preview）
  UPDATE_OVERLAY_STYLE: `${ADDON_ID}/update-overlay-style`,
  // 请求覆盖层位置信息（从 manager 发送到 preview）
  REQUEST_OVERLAY_INFO: `${ADDON_ID}/request-overlay-info`,
  // 返回覆盖层位置信息（从 preview 发送到 manager）
  OVERLAY_INFO: `${ADDON_ID}/overlay-info`,
  // 隐藏覆盖层事件（从 manager 发送到 preview）
  HIDE_OVERLAY: `${ADDON_ID}/hide-overlay`,
  // 显示覆盖层事件（从 manager 发送到 preview）
  SHOW_OVERLAY: `${ADDON_ID}/show-overlay`,
  // 覆盖层已隐藏事件（从 preview 发送到 manager）
  OVERLAY_HIDDEN: `${ADDON_ID}/overlay-hidden`
};
function normalizeImages(images, globalAnchor, globalOffsetX, globalOffsetY, globalAlign) {
  const imagesArray = Array.isArray(images) ? images : [images];
  const defaultAlign = globalAlign ?? "viewport";
  return imagesArray.map((item) => {
    if (typeof item === "string") {
      return {
        src: item,
        anchor: globalAnchor,
        offsetX: globalOffsetX ?? 0,
        offsetY: globalOffsetY ?? 0,
        align: defaultAlign
      };
    } else {
      return {
        src: item.src,
        anchor: item.anchor ?? globalAnchor,
        offsetX: item.offsetX ?? globalOffsetX ?? 0,
        offsetY: item.offsetY ?? globalOffsetY ?? 0,
        align: item.align ?? defaultAlign
      };
    }
  });
}
var withInitImage = (storyFn, context) => {
  const visualDeltaParams = context.parameters?.visualDelta;
  const emit = useChannel({});
  useEffect(() => {
    if (visualDeltaParams?.images) {
      const normalizedImages = normalizeImages(
        visualDeltaParams.images,
        visualDeltaParams.anchor,
        visualDeltaParams.offsetX,
        visualDeltaParams.offsetY,
        visualDeltaParams.align
      );
      emit(EVENTS.INIT_IMAGE, {
        images: normalizedImages,
        storyId: context.id,
        storyName: context.name,
        opacity: visualDeltaParams.opacity ?? 0.5,
        colorInversion: visualDeltaParams.colorInversion ?? true,
        passThresholdPercent: visualDeltaParams.passThresholdPercent ?? 0.1
      });
    } else {
      emit(EVENTS.INIT_IMAGE, {
        images: [],
        storyId: context.id,
        storyName: context.name,
        opacity: visualDeltaParams?.opacity ?? 0.5,
        colorInversion: visualDeltaParams?.colorInversion ?? true,
        passThresholdPercent: visualDeltaParams?.passThresholdPercent ?? 0.1
      });
    }
  }, [visualDeltaParams?.images, context.id, context.name, emit]);
  return storyFn();
};
function parseTranslate(transform) {
  const match = transform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
  if (match && match[1] !== void 0 && match[2] !== void 0) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    return {
      x: isNaN(x) ? 0 : x,
      y: isNaN(y) ? 0 : y
    };
  }
  return { x: 0, y: 0 };
}
var withOverlayInfo = (storyFn) => {
  const emit = useChannel({
    [EVENTS.REQUEST_OVERLAY_INFO]: (data) => {
      const info = {
        iframe: null,
        overlay: null,
        image: null,
        cropArea: null
      };
      const frameElement = window.frameElement;
      if (frameElement) {
        const iframeRect = frameElement.getBoundingClientRect();
        info.iframe = {
          left: iframeRect.left,
          top: iframeRect.top,
          width: iframeRect.width,
          height: iframeRect.height
        };
      }
      const overlay = document.getElementById("visual-delta-overlay");
      if (overlay) {
        const overlayRect = overlay.getBoundingClientRect();
        const translate = parseTranslate(overlay.style.transform || "");
        info.overlay = {
          left: overlayRect.left,
          top: overlayRect.top,
          width: overlayRect.width,
          height: overlayRect.height,
          translateX: translate.x,
          translateY: translate.y
        };
        const img = overlay.querySelector("img");
        if (img) {
          const imgRect = img.getBoundingClientRect();
          info.image = {
            left: imgRect.left,
            top: imgRect.top,
            width: imgRect.width,
            height: imgRect.height,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            src: img.src
          };
          if (info.iframe) {
            info.cropArea = {
              x: info.iframe.left + imgRect.left,
              y: info.iframe.top + imgRect.top,
              width: imgRect.width,
              height: imgRect.height
            };
          }
        }
      }
      emit(EVENTS.OVERLAY_INFO, {
        ...info,
        requestId: data.requestId
      });
    }
  });
  return storyFn();
};
var dragCleanupRef = null;
function getCanvasScale(element) {
  const bodyStyle = window.getComputedStyle(document.body);
  const bodyTransform = bodyStyle.transform;
  if (bodyTransform && bodyTransform !== "none") {
    try {
      const matrix = new DOMMatrix(bodyTransform);
      if (matrix.a !== 1 || matrix.d !== 1) {
        return matrix.a || matrix.d || 1;
      }
    } catch {
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
      }
    }
    current = current.parentElement;
  }
  return 1;
}
function setupDragOverlay(overlay) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let translateX = 0;
  let translateY = 0;
  let parentElement = null;
  const getCurrentTransform = () => {
    const transform = overlay.style.transform || "";
    const match = transform.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
    if (match && match[1] !== void 0 && match[2] !== void 0) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      return {
        x: isNaN(x) ? 0 : x,
        y: isNaN(y) ? 0 : y
      };
    }
    return { x: 0, y: 0 };
  };
  const handleMouseDown = (e) => {
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
  const handleMouseMove = (e) => {
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
var withSelectImage = (storyFn, context) => {
  const canvasElement = context.canvasElement;
  const visualDeltaParams = context.parameters?.visualDelta;
  let currentOpacity = visualDeltaParams?.opacity ?? 0.5;
  let currentColorInversion = visualDeltaParams?.colorInversion ?? true;
  const updateOverlayStyle = (overlay) => {
    if (!overlay) return;
    if (currentColorInversion) {
      overlay.style.mixBlendMode = "difference";
    } else {
      overlay.style.mixBlendMode = "normal";
    }
    overlay.style.opacity = String(currentOpacity);
  };
  const calculateAnchorPosition = (imageItem, canvasParent) => {
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
      // Legacy: pin overlay to #storybook-root (or canvasElement) origin
      const canvasRect = canvasElement.getBoundingClientRect();
      const parentRect = canvasParent.getBoundingClientRect();
      x += (canvasRect.left - parentRect.left) / scale;
      y += (canvasRect.top - parentRect.top) / scale;
    }
    // Default align "viewport": offsets only — matches Playwright fullPage PNGs
    return { x, y };
  };
  const emit = useChannel({
    [EVENTS.SELECT_IMAGE]: (data) => {
      const overlayId = "visual-delta-overlay";
      let overlay = document.getElementById(overlayId);
      if (data.index === -1 || !data.images || data.index >= data.images.length) {
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
      const canvasParent = canvasElement.parentElement;
      if (!canvasParent) return;
      const { x: initialX, y: initialY } = calculateAnchorPosition(selectedImageItem, canvasParent);
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = overlayId;
        const blendMode = currentColorInversion ? "mix-blend-mode: difference;" : "";
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
        const img2 = document.createElement("img");
        img2.style.cssText = `
          width: auto;
          height: auto;
          max-width: none;
          max-height: none;
          pointer-events: none;
          user-select: none;
        `;
        overlay.appendChild(img2);
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
    [EVENTS.UPDATE_OVERLAY_STYLE]: (data) => {
      currentOpacity = data.opacity;
      currentColorInversion = data.colorInversion;
      const overlay = document.getElementById("visual-delta-overlay");
      updateOverlayStyle(overlay);
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
    }
  });
  useEffect(() => {
    return () => {
      if (dragCleanupRef) {
        dragCleanupRef();
        dragCleanupRef = null;
      }
      const overlay = document.getElementById("visual-delta-overlay");
      if (overlay) {
        overlay.remove();
      }
    };
  }, []);
  return storyFn();
};

// src/preview.ts
var preview = {
  decorators: [
    // withGlobals, 
    withInitImage,
    withSelectImage,
    withOverlayInfo
  ],
  initialGlobals: {
    [KEY]: false
  }
};
var preview_default = preview;

export { preview_default };
