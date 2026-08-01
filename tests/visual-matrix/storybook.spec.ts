import { defineVisualSuite } from "../../src/playwright/suite.js";
import {
  VISUAL_MATRIX_FIXTURE_ROOT,
  VISUAL_MATRIX_SNAPSHOT_DIR,
} from "./fixture.js";

const selectedCase = process.env.VISUAL_DELTA_MATRIX_CASE ?? "pass";

defineVisualSuite({
  packageRoot: VISUAL_MATRIX_FIXTURE_ROOT,
  snapshotDir: VISUAL_MATRIX_SNAPSHOT_DIR,
  includeStory: (entry) => entry.id === `visual-matrix--${selectedCase}`,
});
