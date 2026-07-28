import { describe, expect, it, vi } from "vitest";
import {
  baselineSourceStem,
  verifyBaselineSources,
} from "./baseline-source-availability.js";

describe("baseline source availability", () => {
  it("normalizes cache-busted baseline URLs", () => {
    expect(baselineSourceStem("/visual-baselines/dialog.png?t=123")).toBe(
      "/visual-baselines/dialog.png",
    );
  });

  it("distinguishes present, deleted, and transient responses", async () => {
    const fetcher = vi.fn(async (source: string) => {
      if (source.includes("present")) return { ok: true, status: 200 };
      if (source.includes("deleted")) return { ok: false, status: 404 };
      return { ok: false, status: 503 };
    });

    const result = await verifyBaselineSources(
      [
        "/visual-baselines/present.png",
        "/visual-baselines/deleted.png",
        "/visual-baselines/restarting.png",
      ],
      { fetcher },
    );

    expect(result).toEqual(
      new Map([
        ["/visual-baselines/present.png", "present"],
        ["/visual-baselines/deleted.png", "absent"],
        ["/visual-baselines/restarting.png", "unknown"],
      ]),
    );
  });

  it("keeps network failures unknown", async () => {
    const result = await verifyBaselineSources(
      ["/visual-baselines/unreachable.png"],
      {
        fetcher: async () => {
          throw new Error("server restarting");
        },
      },
    );

    expect(result.get("/visual-baselines/unreachable.png")).toBe("unknown");
  });
});
