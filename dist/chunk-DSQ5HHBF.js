// src/constants.ts
var ADDON_ID = "visual-delta";
var PANEL_ID = `${ADDON_ID}/panel`;
var EVENTS = {
  RESULT: `${ADDON_ID}/result`,
  REQUEST: `${ADDON_ID}/request`,
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

export { ADDON_ID, EVENTS, PANEL_ID };
