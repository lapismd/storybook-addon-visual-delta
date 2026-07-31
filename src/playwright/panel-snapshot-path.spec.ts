import { expect, it } from "vitest";
import {
  PANEL_SCREENSHOT_PATH_TEMPLATE,
  panelScreenshotExpect,
} from "./panel-snapshot-path.js";

it("uses the committed Darwin panel screenshot references on every runner", () => {
  expect(PANEL_SCREENSHOT_PATH_TEMPLATE).toBe(
    "{testDir}/{testFileName}-snapshots/{arg}-chromium-darwin{ext}",
  );
  expect(panelScreenshotExpect()).toMatchObject({
    pathTemplate: PANEL_SCREENSHOT_PATH_TEMPLATE,
  });
});
