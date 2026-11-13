import { afterEach, expect, it, vi } from "vitest";
import { toPng } from "html-to-image";
import { capturePreviewSubject } from "./capture.js";

vi.mock("html-to-image", () => ({ toPng: vi.fn() }));
afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

it("blurs and restores the owning iframe element during Diff HTML capture", async () => {
  const iframe = document.createElement("iframe");
  iframe.id = "storybook-preview-iframe";
  document.body.append(iframe);
  const doc = iframe.contentDocument!;
  doc.body.innerHTML =
    '<div id="storybook-root"><button>Preview action</button></div>';
  const button = doc.querySelector("button")!;
  button.focus();
  expect(doc.activeElement).toBe(button);
  expect(button instanceof HTMLElement).toBe(false);
  vi.mocked(toPng).mockImplementation(async () => {
    expect(doc.activeElement).not.toBe(button);
    return "data:image/png;base64,capture";
  });

  await capturePreviewSubject();

  expect(toPng).toHaveBeenCalledOnce();
  expect(doc.activeElement).toBe(button);
});
