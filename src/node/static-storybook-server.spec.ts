import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createStaticStorybookServer } from "./static-storybook-server.js";
let root: string;
let server: ReturnType<typeof createStaticStorybookServer>;
let base: string;
beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "vd-static-"));
  mkdirSync(path.join(root, "public"));
  writeFileSync(
    path.join(root, "public/iframe.html"),
    "<!doctype html><html>Storybook</html>",
  );
  writeFileSync(path.join(root, "public/module.js"), "export default 42;");
  writeFileSync(path.join(root, "private.txt"), "private");
  server = createStaticStorybookServer(path.join(root, "public"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(root, { recursive: true, force: true });
});
it("serves the module graph concurrently without resetting asset requests", async () => {
  const responses = await Promise.all(
    Array.from({ length: 50 }, () => fetch(`${base}/module.js`)),
  );
  expect(
    responses.every(
      (response) =>
        response.ok &&
        response.headers.get("content-type") ===
          "text/javascript; charset=utf-8",
    ),
  ).toBe(true);
  expect(
    await Promise.all(responses.map((response) => response.text())),
  ).toEqual(Array(50).fill("export default 42;"));
});
it("supports HEAD, query parameters and a missing iframe health check", async () => {
  const head = await fetch(`${base}/module.js?t=1`, { method: "HEAD" });
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
  expect((await fetch(`${base}/iframe.html`)).status).toBe(200);
  expect((await fetch(`${base}/missing.html`)).status).toBe(404);
});
it("rejects traversal, invalid URLs, methods and symlink escapes", async () => {
  symlinkSync(
    path.join(root, "private.txt"),
    path.join(root, "public/link.txt"),
  );
  expect((await fetch(`${base}/..%2Fprivate.txt`)).status).toBe(403);
  expect((await fetch(`${base}/link.txt`)).status).toBe(403);
  expect((await fetch(`${base}/%ZZ`)).status).toBe(400);
  expect((await fetch(`${base}/module.js`, { method: "POST" })).status).toBe(
    405,
  );
});
