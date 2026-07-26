import { beforeEach, describe, expect, it, vi } from "vitest";
import { toPng } from "html-to-image";
import { VISUAL_DELTA_STORY_FINISHED_ATTR } from "../shared/capture-params-attrs.js";
import {
  PreviewViewportEstablishmentError,
  capturePreviewSubject,
  withVerifiedPreviewViewport,
} from "./capture.js";

vi.mock("html-to-image", () => ({
  toPng: vi.fn(async () => "data:image/png;base64,capture"),
}));

function installPreviewIframe(options?: {
  observedWidth?: number;
  observedHeight?: number;
}) {
  document.body.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.id = "storybook-preview-iframe";
  iframe.style.width = "640px";
  iframe.style.height = "400px";
  document.body.appendChild(iframe);

  const view = iframe.contentWindow!;
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(
    `<html ${VISUAL_DELTA_STORY_FINISHED_ATTR}="example--ready"><body>` +
      `<div id="storybook-root"><section style="width: 200px; height: 100px">Ready</section></div>` +
      `</body></html>`,
  );
  doc.close();

  Object.defineProperty(view, "innerWidth", {
    configurable: true,
    get: () =>
      options?.observedWidth ?? Number.parseInt(iframe.style.width, 10) ?? 0,
  });
  Object.defineProperty(view, "innerHeight", {
    configurable: true,
    get: () =>
      options?.observedHeight ?? Number.parseInt(iframe.style.height, 10) ?? 0,
  });
  Object.defineProperty(view, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) =>
      window.requestAnimationFrame(callback),
  });
  Object.defineProperty(doc, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  vi.spyOn(view, "scrollTo").mockImplementation(() => undefined);
  return { iframe, view, doc };
}

describe("verified Diff HTML viewport transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("proves the requested viewport and restores geometry after success", async () => {
    const { iframe, view } = installPreviewIframe();

    const transaction = await withVerifiedPreviewViewport(
      async () => ({
        width: view.innerWidth,
        height: view.innerHeight,
      }),
      {
        storyId: "example--ready",
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 3,
      },
    );

    expect(transaction.result).toEqual({ width: 1280, height: 900 });
    expect(transaction.diagnostics).toEqual({
      requestedViewport: { width: 1280, height: 900 },
      observedViewport: { width: 1280, height: 900 },
      deviceScaleFactor: 3,
    });
    expect(iframe.style.width).toBe("640px");
    expect(iframe.style.height).toBe("400px");
  });

  it("waits for storyFinished, preparation clearance, fonts, and one explicit delay", async () => {
    const { doc } = installPreviewIframe();
    doc.documentElement.removeAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR);
    const preparing = doc.createElement("div");
    preparing.className = "sb-show-preparing-story";
    doc.body.appendChild(preparing);
    let resolveFonts!: () => void;
    Object.defineProperty(doc, "fonts", {
      configurable: true,
      value: {
        ready: new Promise<void>((resolve) => {
          resolveFonts = resolve;
        }),
      },
    });
    window.setTimeout(() => {
      doc.documentElement.setAttribute(
        VISUAL_DELTA_STORY_FINISHED_ATTR,
        "example--ready",
      );
      preparing.remove();
      resolveFonts();
    }, 25);
    const startedAt = performance.now();

    await withVerifiedPreviewViewport(async () => undefined, {
      storyId: "example--ready",
      delay: 30,
    });

    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(50);
  });

  it("fails specifically when the requested viewport cannot be observed", async () => {
    const { iframe } = installPreviewIframe({
      observedWidth: 640,
      observedHeight: 400,
    });

    await expect(
      withVerifiedPreviewViewport(async () => "unreachable", {
        storyId: "example--ready",
        viewport: { width: 1440, height: 960 },
        timeout: 20,
      }),
    ).rejects.toBeInstanceOf(PreviewViewportEstablishmentError);

    expect(iframe.style.width).toBe("640px");
    expect(iframe.style.height).toBe("400px");
  });

  it("restores the preview after rasterization errors", async () => {
    const { iframe } = installPreviewIframe();

    await expect(
      withVerifiedPreviewViewport(
        async () => {
          throw new Error("html-to-image failed");
        },
        {
          storyId: "example--ready",
          viewport: { width: 1280, height: 900 },
        },
      ),
    ).rejects.toThrow("html-to-image failed");

    expect(iframe.style.width).toBe("640px");
    expect(iframe.style.height).toBe("400px");
  });

  it("restores the preview after cancellation", async () => {
    const { iframe } = installPreviewIframe();
    const abort = new AbortController();
    abort.abort();

    await expect(
      withVerifiedPreviewViewport(async () => "unreachable", {
        storyId: "example--ready",
        signal: abort.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(iframe.style.width).toBe("640px");
    expect(iframe.style.height).toBe("400px");
  });
});

describe("Diff HTML capture geometry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests an exact 1280×900 viewport raster at device scale 3", async () => {
    installPreviewIframe();

    await capturePreviewSubject({
      cropToViewport: true,
      viewport: { width: 1280, height: 900 },
      pixelRatio: 3,
    });

    expect(vi.mocked(toPng)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        width: 1280,
        height: 900,
        canvasWidth: 1280,
        canvasHeight: 900,
        pixelRatio: 3,
      }),
    );
  });
});
