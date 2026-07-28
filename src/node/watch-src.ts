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
      // Adding the package source is sufficient for Vite to HMR preview
      // decorators/overlay modules. Manager/shared/node files are restarted by
      // the checkout-scoped supervisor; sending a full reload here duplicates
      // that restart and makes every preview edit reload the whole page. The
      // supervisor debounce is the sole manager reload trigger.
      server.watcher.add(addonSrc);
    },
  };
}
