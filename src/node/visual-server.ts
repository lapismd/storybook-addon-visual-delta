import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

let warmServer: ChildProcess | null = null;

export function invalidateWarmStaticStorybookServer(): void {
  if (!warmServer || warmServer.killed) {
    warmServer = null;
    return;
  }
  try {
    warmServer.kill("SIGKILL");
  } catch {
    /* it may have already exited */
  }
  warmServer = null;
}

async function isStaticServerHealthy(port: number): Promise<boolean> {
  // index.json alone is not enough — a partial build can serve the index while
  // /iframe.html 404s and hang every Playwright story navigation.
  const urls = [
    `http://127.0.0.1:${port}/index.json`,
    `http://127.0.0.1:${port}/iframe.html`,
  ];
  try {
    for (const url of urls) {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2_000),
      });
      if (!response.ok) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * A stale listener that does not answer `/index.json` blocks Playwright with
 * EADDRINUSE. Preserve a healthy server and clear only an unhealthy listener.
 */
export async function ensurePlaywrightWebServerPort(
  port: number,
): Promise<void> {
  if (await isStaticServerHealthy(port)) return;

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

export type WarmStaticServerResult = {
  ok: boolean;
  started: boolean;
  reused: boolean;
  message: string;
};

/**
 * Keep a long-lived `python3 -m http.server` on the Playwright static port so
 * each Testing Module run can `reuseExistingServer` instead of cold-starting.
 */
export async function ensureWarmStaticStorybookServer(
  root: string,
  port: number,
): Promise<WarmStaticServerResult> {
  const indexPath = path.join(root, "storybook-static", "index.json");
  const iframePath = path.join(root, "storybook-static", "iframe.html");
  if (!existsSync(indexPath) || !existsSync(iframePath)) {
    return {
      ok: false,
      started: false,
      reused: false,
      message: !existsSync(indexPath)
        ? "storybook-static/index.json missing — static server not started"
        : "storybook-static incomplete (missing iframe.html) — static server not started",
    };
  }

  if (await isStaticServerHealthy(port)) {
    return {
      ok: true,
      started: false,
      reused: true,
      message: `Reusing static Storybook on :${port}`,
    };
  }

  await ensurePlaywrightWebServerPort(port);

  if (warmServer && !warmServer.killed) {
    try {
      warmServer.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    warmServer = null;
  }

  const child = spawn(
    "python3",
    [
      "-m",
      "http.server",
      String(port),
      "--directory",
      "storybook-static",
      "--bind",
      "127.0.0.1",
    ],
    {
      cwd: root,
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();
  warmServer = child;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await isStaticServerHealthy(port)) {
      return {
        ok: true,
        started: true,
        reused: false,
        message: `Started static Storybook on :${port}`,
      };
    }
    if (child.exitCode != null) break;
  }

  return {
    ok: false,
    started: false,
    reused: false,
    message: `Failed to start static Storybook on :${port}`,
  };
}
