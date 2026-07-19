import { ADDON_ID } from './chunk-DSQ5HHBF.js';
import React from 'react';

function renderLabel(item) {
  if (item.type !== "story" && item.type !== "docs") {
    return;
  }
  if (item.title.startsWith(ADDON_ID)) {
    return /* @__PURE__ */ React.createElement("span", null, "\u{1F31F} ", item.name);
  }
}

export { renderLabel };
