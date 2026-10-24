import { mkdirSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/** A disposable Storybook-compatible host for the public package worker. */
export function prepareNativeCaptureFixture(
  root,
  packageRoot,
  browsers = ["chromium", "firefox", "webkit"],
  toolingRoot = packageRoot,
) {
  const requirePackage = createRequire(path.join(toolingRoot, "package.json"));
  const write = (file, value) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, value);
  };
  write(
    "package.json",
    JSON.stringify({
      name: "visual-delta-native-example",
      private: true,
      type: "module",
      scripts: { "build-storybook": "node build.mjs" },
    }),
  );
  for (const [name, target] of [
    [
      "playwright",
      path.dirname(requirePackage.resolve("playwright/package.json")),
    ],
    [
      "@playwright/test",
      path.dirname(requirePackage.resolve("@playwright/test/package.json")),
    ],
    ["@lapismd/storybook-addon-visual-delta", packageRoot],
  ]) {
    const destination = path.join(root, "node_modules", name);
    mkdirSync(path.dirname(destination), { recursive: true });
    if (!existsSync(destination)) symlinkSync(target, destination, "dir");
  }
  write(
    "node_modules/.bin/playwright",
    `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${path.join(path.dirname(requirePackage.resolve("playwright/package.json")), "cli.js").replaceAll("'", "'\\''")}' "$@"\n`,
  );
  write(
    ".visual-delta/config.json",
    JSON.stringify({
      browsers,
      workflow: { visualTestFailureMode: "strict" },
    }),
  );
  write(
    ".visual-delta/config.local.json",
    JSON.stringify({
      capture: { profile: "native" },
      passThresholdPercent: 0.5,
    }),
  );
  write(
    "src/Native.stories.tsx",
    'export default {title: "Native"};\nexport const Basic = {parameters: {visualDelta: {modes: {contrast: {globals: {theme: "dark"}}}}}};\n',
  );
  write(
    "tests/visual/storybook.spec.ts",
    'import {defineVisualSuite} from "@lapismd/storybook-addon-visual-delta/playwright"; defineVisualSuite();\n',
  );
  write(
    "playwright.config.ts",
    'import {defineVisualPlaywrightConfig} from "@lapismd/storybook-addon-visual-delta/playwright"; export default defineVisualPlaywrightConfig({port: Number(process.env.VISUAL_DELTA_NATIVE_EXAMPLE_PORT ?? 9398), override: {workers: 1, reporter: "list"}});\n',
  );
  write("color.json", JSON.stringify([20, 120, 220]));
  write(
    "build.mjs",
    `import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
const color = JSON.parse(readFileSync("color.json", "utf8"));
const id = "native--basic";
mkdirSync("storybook-static", {recursive: true});
mkdirSync(".visual-delta/cache", {recursive: true});
writeFileSync("storybook-static/index.json", JSON.stringify({entries: {[id]: {id, type:"story", title:"Native", name:"Basic", importPath:"./src/Native.stories.tsx", exportName:"Basic", tags:[]}}}));
writeFileSync(".visual-delta/cache/preview-stats.json", JSON.stringify({modules:[{name:"@storybook/builder-vite", reasons:[]},{name:"./src/Native.stories.tsx", reasons:[]}]}));
writeFileSync("storybook-static/iframe.html", \`<!doctype html><html><head><style>html,body{margin:0;padding:0}#subject{width:64px;height:48px;background:rgb(\${color.join(",")})}</style></head><body><div id="storybook-root"><div id="subject"></div></div><script>
const params = new URLSearchParams(location.search);
const root = document.documentElement;
root.setAttribute("data-visual-delta-story-finished", params.get("id") || "");
root.setAttribute("data-visual-delta-modes", JSON.stringify({contrast:{globals:{theme:"dark"}}}));
if (params.get("globals")?.includes("dark")) document.querySelector("#subject").style.opacity = ".5";
if(params.get("visualCaptureUntil")) root.setAttribute("data-visual-capture-ready", params.get("visualCaptureUntil"));
</script></body></html>\`);
`,
  );
  return root;
}
