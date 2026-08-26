import { afterEach, describe, expect, it, vi } from "vitest";
import { ensurePlaywrightWebServerPort } from "./visual-server.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("static Storybook server health", () => {
  it("uses bodyless requests for both required static documents", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await ensurePlaywrightWebServerPort(5174);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:5174/index.json",
      expect.objectContaining({ method: "HEAD", signal: expect.anything() }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:5174/iframe.html",
      expect.objectContaining({ method: "HEAD", signal: expect.anything() }),
    );
  });
});
