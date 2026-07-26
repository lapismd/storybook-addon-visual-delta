import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installVisualDeltaReloadWatcher,
  readVisualDeltaRuntime,
  startVisualDeltaReloadWatcher,
  type VisualDeltaRuntimeRead,
} from "./reload-on-restart.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function advancePoll() {
  await vi.advanceTimersByTimeAsync(1_000);
}

describe("Visual Delta manager restart watcher", () => {
  it("seeds the first identity and leaves an unchanged server alone", async () => {
    const reload = vi.fn();
    const readRuntime = vi
      .fn<() => Promise<VisualDeltaRuntimeRead>>()
      .mockResolvedValue({ kind: "runtime", instanceId: "server-a" });

    const stop = startVisualDeltaReloadWatcher({ readRuntime, reload });
    await vi.waitFor(() => expect(readRuntime).toHaveBeenCalledTimes(1));
    await advancePoll();
    await advancePoll();

    expect(readRuntime).toHaveBeenCalledTimes(3);
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it("recovers from a network interruption and reloads once on a new identity", async () => {
    const reload = vi.fn();
    const readRuntime = vi
      .fn<() => Promise<VisualDeltaRuntimeRead>>()
      .mockResolvedValueOnce({ kind: "runtime", instanceId: "server-a" })
      .mockResolvedValueOnce({ kind: "retry" })
      .mockResolvedValue({ kind: "runtime", instanceId: "server-b" });

    startVisualDeltaReloadWatcher({ readRuntime, reload });
    await vi.waitFor(() => expect(readRuntime).toHaveBeenCalledTimes(1));
    await advancePoll();
    await advancePoll();
    await advancePoll();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(readRuntime).toHaveBeenCalledTimes(3);
  });

  it.each([
    { label: "a missing endpoint", result: { kind: "unsupported" } as const },
    {
      label: "a malformed successful response",
      result: { kind: "unsupported" } as const,
    },
  ])("stops permanently for $label", async ({ result }) => {
    const readRuntime = vi
      .fn<() => Promise<VisualDeltaRuntimeRead>>()
      .mockResolvedValue(result);

    startVisualDeltaReloadWatcher({ readRuntime });
    await vi.waitFor(() => expect(readRuntime).toHaveBeenCalledTimes(1));
    await advancePoll();

    expect(readRuntime).toHaveBeenCalledTimes(1);
  });

  it("guards against duplicate installs", async () => {
    const globalObject: Record<string, unknown> = {};
    const readRuntime = vi
      .fn<() => Promise<VisualDeltaRuntimeRead>>()
      .mockResolvedValue({ kind: "retry" });

    expect(installVisualDeltaReloadWatcher({ globalObject, readRuntime })).toBe(
      true,
    );
    expect(installVisualDeltaReloadWatcher({ globalObject, readRuntime })).toBe(
      false,
    );
    await vi.waitFor(() => expect(readRuntime).toHaveBeenCalledTimes(1));
  });
});

describe("readVisualDeltaRuntime", () => {
  it("uses no-store and parses a valid runtime identity", async () => {
    const fetchRuntime = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, instanceId: "server-a" }),
    });

    await expect(readVisualDeltaRuntime(fetchRuntime)).resolves.toEqual({
      kind: "runtime",
      instanceId: "server-a",
    });
    expect(fetchRuntime).toHaveBeenCalledWith("/__visual-delta/runtime", {
      cache: "no-store",
    });
  });

  it("retries network errors and stops for 404 or malformed successes", async () => {
    await expect(
      readVisualDeltaRuntime(vi.fn().mockRejectedValue(new Error("offline"))),
    ).resolves.toEqual({ kind: "retry" });
    await expect(
      readVisualDeltaRuntime(
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          json: async () => ({}),
        }),
      ),
    ).resolves.toEqual({ kind: "unsupported" });
    await expect(
      readVisualDeltaRuntime(
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        }),
      ),
    ).resolves.toEqual({ kind: "unsupported" });
  });
});
