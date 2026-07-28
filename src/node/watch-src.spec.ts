import { describe, expect, it, vi } from "vitest";
import { watchVisualDeltaSourcePlugin } from "./watch-src.js";

describe("watchVisualDeltaSourcePlugin", () => {
  it("registers addon source for Vite HMR without forcing a page reload", () => {
    const add = vi.fn();
    const on = vi.fn();
    const send = vi.fn();
    const plugin = watchVisualDeltaSourcePlugin({
      addonSrcDir: "/repo/addon/src",
    });

    expect(plugin).not.toBeNull();
    const configureServer = plugin?.configureServer;
    const server = {
      watcher: { add, on },
      ws: { send },
    } as never;
    if (typeof configureServer === "function") {
      configureServer(server);
    } else {
      configureServer?.handler(server);
    }

    expect(add).toHaveBeenCalledWith("/repo/addon/src");
    expect(on).not.toHaveBeenCalledWith("change", expect.any(Function));
    expect(send).not.toHaveBeenCalled();
  });
});
