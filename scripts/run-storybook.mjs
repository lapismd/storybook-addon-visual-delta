#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const port = String(
  process.env.VISUAL_DELTA_STORYBOOK_PORT ||
    process.env.VISUAL_DELTA_PANEL_STORYBOOK_PORT ||
    "9109",
);
const ci = process.argv.includes("--ci");
const args = ["dev", "-p", port, "--no-open"];
if (ci) args.push("--ci");

const child = spawn("pnpm", ["exec", "storybook", ...args], {
  cwd: packageRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    VISUAL_DELTA_STORYBOOK_PORT: port,
  },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
