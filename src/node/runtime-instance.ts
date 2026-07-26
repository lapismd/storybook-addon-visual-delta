import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";

export interface VisualDeltaRuntimeEndpoint {
  /** Stable for the lifetime of one Visual Delta middleware instance. */
  instanceId: string;
  handle(method: string | undefined, res: ServerResponse): void;
}

/**
 * Create the development runtime identity exposed to the Storybook manager.
 * Construct this once per Vite middleware plugin, not once per request.
 */
export function createVisualDeltaRuntimeEndpoint(): VisualDeltaRuntimeEndpoint {
  const instanceId = randomUUID();

  return {
    instanceId,
    handle(method, res) {
      res.setHeader("Cache-Control", "no-store");
      if (method !== "GET") {
        res.statusCode = 405;
        res.setHeader("Allow", "GET");
        res.end("Method Not Allowed");
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true, instanceId }));
    },
  };
}
