import { createServer, type Server } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isCapturePathInside } from "./capture-path-safety.js";
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};
export function createStaticStorybookServer(directory: string): Server {
  const root = path.resolve(directory);
  return createServer(async (request, response) => {
    if (!["GET", "HEAD"].includes(request.method ?? "")) {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(
        new URL(request.url ?? "/", "http://localhost").pathname,
      );
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (pathname.includes("\0")) {
      response.writeHead(400).end();
      return;
    }
    let file = path.resolve(root, `.${pathname}`);
    try {
      if (!isCapturePathInside(root, file)) {
        response.writeHead(403).end();
        return;
      }
      let info = await stat(file);
      if (info.isDirectory()) {
        file = path.join(file, "index.html");
        info = await stat(file);
      }
      if (!info.isFile() || !isCapturePathInside(root, file)) {
        response.writeHead(403).end();
        return;
      }
      response.writeHead(200, {
        "Content-Type":
          types[path.extname(file).toLowerCase()] ?? "application/octet-stream",
        "Content-Length": info.size,
        "Cache-Control": "no-store",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      const stream = createReadStream(file);
      stream.on("error", () => response.destroy());
      stream.pipe(response);
    } catch {
      response.writeHead(404).end();
    }
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const value = (name: string) => {
    const index = process.argv.indexOf(name);
    return index < 0 ? undefined : process.argv[index + 1];
  };
  const port = Number(value("--port"));
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Static Storybook server requires --port 1..65535.");
  const server = createStaticStorybookServer(
    value("--directory") || "storybook-static",
  );
  server.listen(port, "127.0.0.1");
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => {
      server.closeAllConnections();
      server.close(() => process.exit(0));
    });
}
