import type { ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { createVisualDeltaRuntimeEndpoint } from "./runtime-instance.js";

function responseRecorder() {
  const headers = new Map<string, string>();
  let body = "";
  const response = {
    statusCode: 0,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    end(value = "") {
      body = value;
    },
  } as unknown as ServerResponse;

  return {
    response,
    headers,
    body: () => body,
    status: () => response.statusCode,
  };
}

describe("Visual Delta runtime endpoint", () => {
  it("keeps one identity stable and gives new middleware instances new identities", () => {
    const first = createVisualDeltaRuntimeEndpoint();
    const second = createVisualDeltaRuntimeEndpoint();

    expect(first.instanceId).toBe(first.instanceId);
    expect(first.instanceId).not.toBe(second.instanceId);
  });

  it("returns a no-store JSON identity", () => {
    const runtime = createVisualDeltaRuntimeEndpoint();
    const recorder = responseRecorder();

    runtime.handle("GET", recorder.response);

    expect(recorder.status()).toBe(200);
    expect(recorder.headers.get("cache-control")).toBe("no-store");
    expect(recorder.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(JSON.parse(recorder.body())).toEqual({
      ok: true,
      instanceId: runtime.instanceId,
    });
  });

  it("rejects non-GET methods", () => {
    const runtime = createVisualDeltaRuntimeEndpoint();
    const recorder = responseRecorder();

    runtime.handle("POST", recorder.response);

    expect(recorder.status()).toBe(405);
    expect(recorder.headers.get("allow")).toBe("GET");
    expect(recorder.body()).toBe("Method Not Allowed");
  });
});
