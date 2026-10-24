import { fileURLToPath } from "node:url";
import path from "node:path";
export function staticStorybookServerArgs(port: number): string[] {
  return [
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../dist/node/static-storybook-server.js",
    ),
    "--port",
    String(port),
    "--directory",
    "storybook-static",
  ];
}
export function staticStorybookServerCommand(port: number): string {
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  return [process.execPath, ...staticStorybookServerArgs(port)]
    .map(quote)
    .join(" ");
}
