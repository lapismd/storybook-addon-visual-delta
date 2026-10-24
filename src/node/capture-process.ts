import { captureProcessGroups } from "./capture-process-tree.js";
import { spawn } from "node:child_process";
import type { VisualCaptureRunnerContext } from "../runner/index.js";

/** Run one worker process group so cancellation reaches Playwright and builds. */
export function runNativeCaptureProcess(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  context: VisualCaptureRunnerContext,
): Promise<number> {
  if (context.signal?.aborted) return Promise.resolve(130);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let escalation: ReturnType<typeof setTimeout> | undefined;
    let groups: number[] = [];
    const kill = (signal: NodeJS.Signals) => {
      for (const group of groups.length
        ? groups
        : child.pid
          ? [child.pid]
          : []) {
        try {
          process.kill(-group, signal);
        } catch {
          /* Already exited. */
        }
      }
    };
    const abort = () => {
      groups = child.pid ? captureProcessGroups(child.pid) : [];
      kill("SIGTERM");
      escalation = setTimeout(() => kill("SIGKILL"), 2000);
      escalation.unref();
    };
    context.signal?.addEventListener("abort", abort, { once: true });
    if (context.signal?.aborted) abort();
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      context.onEvent?.({ type: "log", message: String(chunk) });
    });
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      context.onEvent?.({ type: "log", message: String(chunk) });
    });
    const finish = () => {
      context.signal?.removeEventListener("abort", abort);
      if (escalation) clearTimeout(escalation);
      if (context.signal?.aborted) kill("SIGKILL");
    };
    child.on("error", (error) => {
      finish();
      reject(error);
    });
    child.on("close", (code) => {
      finish();
      resolve(context.signal?.aborted ? 130 : (code ?? 1));
    });
  });
}
