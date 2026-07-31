import { beforeEach, describe, expect, it, vi } from "vitest";
import { toPng } from "html-to-image";
import { VISUAL_DELTA_STORY_FINISHED_ATTR } from "../shared/capture-params-attrs.js";
import {
  PreviewLayoutSettlementError,
  PreviewViewportEstablishmentError,
  capturePreviewSubject,
  measureCurrentPreviewLayout,
  measureSettledOverlayLayout,
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
  let scrollX = 0;
  let scrollY = 0;
  Object.defineProperty(view, "scrollX", {
    configurable: true,
    get: () => scrollX,
  });
  Object.defineProperty(view, "scrollY", {
    configurable: true,
    get: () => scrollY,
  });
  vi.spyOn(view, "scrollTo").mockImplementation((x, y) => {
    scrollX = x;
    scrollY = y;
  });
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

  it("measures initial Storybook geometry inside the verified viewport", async () => {
    const { iframe, doc } = installPreviewIframe();
    doc.body.style.padding = "3px 5px 7px 11px";
    const root = doc.getElementById("storybook-root")!;
    root.setAttribute("style", "padding: 13px 17px");

    const transaction = await withVerifiedPreviewViewport(
      async () =>
        measureCurrentPreviewLayout({
          storyId: "example--ready",
          viewport: { width: 1440, height: 960 },
          layout: "padded",
        }),
      {
        storyId: "example--ready",
        viewport: { width: 1440, height: 960 },
      },
    );

    expect(transaction.result).toMatchObject({
      storyId: "example--ready",
      viewport: { width: 1440, height: 960 },
      layout: "padded",
      body: {
        padding: { top: 3, right: 5, bottom: 7, left: 11 },
      },
      root: {
        padding: { top: 13, right: 17, bottom: 13, left: 17 },
      },
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
    let fontStatus: FontFaceSetLoadStatus = "loading";
    Object.defineProperty(doc, "fonts", {
      configurable: true,
      value: {
        get status() {
          return fontStatus;
        },
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
      fontStatus = "loaded";
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

  it("retries against the current preview when Storybook replaces the iframe", async () => {
    const first = installPreviewIframe();
    let captures = 0;
    window.setTimeout(() => {
      installPreviewIframe();
    }, 0);

    const transaction = await withVerifiedPreviewViewport(
      async () => {
        captures += 1;
        const current = document.querySelector<HTMLIFrameElement>(
          "#storybook-preview-iframe",
        )!;
        return {
          width: current.contentWindow!.innerWidth,
          height: current.contentWindow!.innerHeight,
        };
      },
      {
        storyId: "example--ready",
        viewport: { width: 1280, height: 900 },
      },
    );

    expect(first.iframe.isConnected).toBe(false);
    expect(captures).toBe(1);
    expect(transaction.result).toEqual({ width: 1280, height: 900 });
    const current = document.querySelector<HTMLIFrameElement>(
      "#storybook-preview-iframe",
    )!;
    expect(current.style.width).toBe("640px");
    expect(current.style.height).toBe("400px");
  });

  it("restores preview scroll and focus after measurement", async () => {
    const { view, doc } = installPreviewIframe();
    const subject = doc.querySelector("#storybook-root > section")!;
    subject.setAttribute("tabindex", "0");
    (subject as HTMLElement).focus();
    view.scrollTo(19, 37);

    await withVerifiedPreviewViewport(
      async () => {
        view.scrollTo(200, 300);
        (doc.body as HTMLElement).focus();
      },
      {
        storyId: "example--ready",
        viewport: { width: 1280, height: 900 },
      },
    );

    expect(view.scrollX).toBe(19);
    expect(view.scrollY).toBe(37);
    expect(doc.activeElement).toBe(subject);
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

describe("overlay layout settlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("measures at the current preview size without resizing the iframe", async () => {
    const { iframe } = installPreviewIframe({
      observedWidth: 640,
      observedHeight: 400,
    });

    const snapshot = await measureSettledOverlayLayout({
      storyId: "example--ready",
      layout: "padded",
    });

    expect(snapshot).toMatchObject({
      storyId: "example--ready",
      viewport: { width: 640, height: 400 },
      layout: "padded",
    });
    expect(iframe.style.width).toBe("640px");
    expect(iframe.style.height).toBe("400px");
  });

  it("waits for storyFinished without forcing the capture viewport", async () => {
    const { iframe, doc } = installPreviewIframe({
      observedWidth: 640,
      observedHeight: 400,
    });
    doc.documentElement.removeAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR);
    window.setTimeout(() => {
      doc.documentElement.setAttribute(
        VISUAL_DELTA_STORY_FINISHED_ATTR,
        "example--ready",
      );
    }, 20);

    const snapshot = await measureSettledOverlayLayout({
      storyId: "example--ready",
    });

    expect(snapshot.viewport).toEqual({ width: 640, height: 400 });
    expect(iframe.style.width).toBe("640px");
  });

  it("fails when the current preview never settles", async () => {
    const { doc } = installPreviewIframe();
    doc.documentElement.removeAttribute(VISUAL_DELTA_STORY_FINISHED_ATTR);

    await expect(
      measureSettledOverlayLayout({
        storyId: "example--ready",
        timeout: 20,
      }),
    ).rejects.toBeInstanceOf(PreviewLayoutSettlementError);
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
