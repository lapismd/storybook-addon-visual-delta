/**
 * Capture Example baselines from a running package Storybook (Vite).
 * Usage:
 *   VISUAL_DELTA_STORYBOOK_PORT=9109 pnpm examples:baselines:capture
 *
 * Requires `pnpm storybook` (or storybook:ci) on that port.
 */
import { chromium } from "@playwright/test";
import { settleVisualStoryPage } from "../dist/playwright/index.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const outRoot = path.join(packageRoot, "tests/examples-snapshots/examples");
const port = Number(
  process.env.VISUAL_DELTA_STORYBOOK_PORT ??
    process.env.STORYBOOK_PORT ??
    "9109",
);
const base = `http://127.0.0.1:${port}`;

const CAPTURES = [
  {
    id: "examples-card--match",
    out: "card/match.png",
  },
  {
    id: "examples-card--intentional-difference",
    out: "card/drift.png",
    /** Baseline keeps the INTENTIONAL banner but undoes card drift. */
    prepare: async (page) => {
      await page.evaluate(() => {
        const card = document.querySelector('[data-testid="examples-card"]');
        if (!card) return;
        const header = card.querySelector("div > div");
        if (header instanceof HTMLElement) {
          header.style.background = "#1e4078";
          if (header.textContent?.includes("(changed)")) {
            header.textContent = header.textContent.replace(" (changed)", "");
          }
        }
        const bars = card.querySelectorAll("div > div > div > div");
        // structure: outer > white card > header + body; body bars are divs
        const body = card.querySelector("div > div:nth-child(2)");
        const barNodes = body?.querySelectorAll(":scope > div") ?? [];
        if (barNodes[0] instanceof HTMLElement) {
          barNodes[0].style.width = "180px";
          barNodes[0].style.background = "#373f50";
        }
        if (barNodes[1] instanceof HTMLElement) {
          barNodes[1].style.width = "220px";
        }
      });
    },
  },
  { id: "examples-gallery--multiple-images", out: "gallery/default.png" },
  { id: "examples-gallery--compact-variant", out: "gallery/compact.png" },
  {
    id: "examples-gallery--multiple-images",
    out: "gallery/accent.png",
    prepare: async (page) => {
      await page.evaluate(() => {
        const accent = document.querySelector(
          '[data-testid="examples-gallery"] > div',
        );
        if (accent instanceof HTMLElement) accent.style.background = "#b45a28";
      });
    },
  },
  {
    id: "examples-interactions--with-interaction-baseline",
    out: "interactions/opened.png",
    prepare: async (page) => {
      // Play opens details; wait for the parked opened state.
      await page.getByText(/Interaction baseline captures/i).waitFor({
        timeout: 15_000,
      });
    },
  },
  {
    id: "examples-interactions--with-interaction-baseline",
    out: "interactions/idle.png",
    prepare: async (page) => {
      await page.getByText(/Interaction baseline captures/i).waitFor({
        timeout: 15_000,
      });
      await page.getByRole("button", { name: /Hide details/i }).click();
      await page.getByRole("button", { name: /Show details/i }).waitFor();
    },
  },
  { id: "examples-modes--default-and-compact", out: "modes/default.png" },
  {
    id: "examples-modes--default-and-compact",
    out: "modes/compact.png",
    /**
     * Storybook iframe URL globals are unreliable for this preview setup.
     * Force Compact geometry + subject chrome to match EXAMPLE_SIZES.modesCompact
     * and DemoModeBlock(compact).
     */
    prepare: async (page) => {
      await page.evaluate(() => {
        const stage = document.querySelector("[data-testid=example-stage]");
        if (stage instanceof HTMLElement) {
          stage.style.width = "260px";
          stage.style.height = "72px";
        }
        const block = document.querySelector("[data-testid=examples-modes]");
        if (block instanceof HTMLElement) {
          block.style.padding = "12px 16px";
          const bar = block.querySelector(":scope > div");
          if (bar instanceof HTMLElement) {
            bar.style.height = "12px";
            bar.style.width = "100px";
          }
          const label = block.querySelector(":scope > div:nth-child(2)");
          if (label instanceof HTMLElement) label.textContent = "Compact mode";
        }
      });
    },
  },
  { id: "examples-filter-chip--default", out: "filter-chip/default.png" },
  { id: "examples-ai-reply--default", out: "ai-reply/default.png" },
  { id: "examples-form-field--default", out: "form-field/default.png" },
];

export async function captureOne(
  page,
  spec,
  {
    baseUrl = base,
    outputRoot = outRoot,
    settle = settleVisualStoryPage,
  } = {},
) {
  const extras = spec.urlExtras ?? "";
  const url = `${baseUrl}/iframe.html?id=${spec.id}&viewMode=story${extras}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid=example-stage]", { timeout: 15_000 });
  await page.waitForTimeout(300);
  if (spec.prepare) await spec.prepare(page);
  await settle(page, { delay: 100 });
  const stage = page.locator("[data-testid=example-stage]");
  const out = path.join(outputRoot, spec.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await stage.screenshot({
    path: out,
    animations: "disabled",
    caret: "hide",
  });
  const box = await stage.boundingBox();
  console.log(
    "wrote",
    path.relative(packageRoot, out),
    box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "",
  );
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  try {
    for (const spec of CAPTURES) {
      await captureOne(page, spec);
    }
  } finally {
    await browser.close();
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (import.meta.url === invokedPath) await main();
