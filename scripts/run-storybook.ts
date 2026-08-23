import { dirname, fromFileUrl } from "jsr:@std/path@1.1.6";

const packageRoot = dirname(dirname(fromFileUrl(import.meta.url)));
const port = Deno.env.get("VISUAL_DELTA_STORYBOOK_PORT") ??
  Deno.env.get("VISUAL_DELTA_PANEL_STORYBOOK_PORT") ?? "9109";
const args = [
  "./node_modules/storybook/dist/bin/dispatcher.js",
  "dev",
  "-p",
  port,
  "--no-open",
];
if (Deno.args.includes("--ci")) args.push("--ci");

const child = new Deno.Command("node", {
  args,
  cwd: packageRoot,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
  env: { VISUAL_DELTA_STORYBOOK_PORT: port },
}).spawn();
const status = await child.status;
if (status.signal) Deno.kill(Deno.pid, status.signal);
Deno.exit(status.code);
