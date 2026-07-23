import { execFileSync } from "node:child_process";

/**
 * A stale listener that does not answer `/index.json` blocks Playwright with
 * EADDRINUSE. Preserve a healthy server and clear only an unhealthy listener.
 */
export async function ensurePlaywrightWebServerPort(
  port: number,
): Promise<void> {
  const url = `http://127.0.0.1:${port}/index.json`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(2_000),
    });
    if (response.ok) return;
  } catch {
    // Unreachable or timed out; inspect the listener below.
  }

  try {
    const pids = execFileSync("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
    })
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGKILL");
      } catch {
        // It may have exited between lsof and kill.
      }
    }
  } catch {
    // Nothing is listening.
  }
}
