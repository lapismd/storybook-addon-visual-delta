import { beforeEach, describe, expect, it } from "vitest";
import {
  VISUAL_CAPTURE_SURFACE_SELECTORS,
  measureVisualCaptureClip,
} from "./capture-target.js";

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
    width,
    height,
    toJSON: () => ({}),
  };
}

function setRect(element: Element, value: DOMRect): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => value,
  });
}

describe("visual capture target", () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="storybook-root"><main><section data-state="open"></section></main></div>';
    const root = document.querySelector("#storybook-root")!;
    const subject = root.firstElementChild!;
    const expanded = subject.firstElementChild!;
    setRect(root, rect(0, 0, 1280, 900));
    setRect(subject, rect(24, 24, 672, 100));
    setRect(expanded, rect(32, 32, 200, 60));
  });

  it("leaves ordinary in-subject expanded content on the subject path", () => {
    expect(
      measureVisualCaptureClip(VISUAL_CAPTURE_SURFACE_SELECTORS),
    ).toBeNull();
  });

  it("unions positioned in-root overlays that paint outside the subject", () => {
    const subject = document.querySelector("#storybook-root > main")!;
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    subject.appendChild(dialog);
    setRect(dialog, rect(58, 68, 487, 109));

    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    dialog.appendChild(listbox);
    setRect(listbox, rect(367, 122, 163, 176));

    expect(measureVisualCaptureClip(VISUAL_CAPTURE_SURFACE_SELECTORS)).toEqual({
      x: 24,
      y: 24,
      width: 672,
      height: 274,
    });
  });

  it("unions outside-root portals even when they overlap the subject", () => {
    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    document.body.appendChild(menu);
    setRect(menu, rect(500, 50, 260, 180));

    expect(measureVisualCaptureClip(VISUAL_CAPTURE_SURFACE_SELECTORS)).toEqual({
      x: 24,
      y: 24,
      width: 736,
      height: 206,
    });
  });

  it("ignores invisible and zero-sized overlay candidates", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.style.display = "none";
    document.body.appendChild(dialog);
    setRect(dialog, rect(10, 10, 900, 500));

    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    document.body.appendChild(menu);
    setRect(menu, rect(10, 10, 0, 0));

    expect(
      measureVisualCaptureClip(VISUAL_CAPTURE_SURFACE_SELECTORS),
    ).toBeNull();
  });
});
