import type { Plugin } from "vite";
import type { VisualDeltaHostOptions } from "./options.js";

/**
 * Watch the workspace addon source (outside node_modules) so preview HMR
 * picks up overlay/decorator edits. Manager/panel edits still need a full
 * Storybook restart because the manager builder is a one-shot esbuild compile;
 * the manager runtime watcher reloads the open page after that restart.
 */
export function watchVisualDeltaSourcePlugin(
  options: VisualDeltaHostOptions = {},
): Plugin | null {
  const addonSrc = options.addonSrcDir?.trim();
  if (!addonSrc) return null;

  return {
    name: "watch-visual-delta-source",
    configureServer(server) {
      server.watcher.add(addonSrc);
      server.watcher.on("change", (file) => {
        if (!file.startsWith(addonSrc)) return;
        server.ws.send({ type: "full-reload", path: "*" });
      });
    },
  };
}
