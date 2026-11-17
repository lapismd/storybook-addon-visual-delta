import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCiImageSources,
  validateCiImageSources,
} from "./check-ci-image.mjs";
const sources = loadCiImageSources();

test("requires manager acceptance jobs to trust checkout history", () => {
  const workflowPath = ".github/workflows/visual-delta-ci.yml";
  const trustCommand =
    'git config --global --add safe.directory "$GITHUB_WORKSPACE"';
  const result = validateCiImageSources({
    ...sources,
    consumerWorkflows: {
      ...sources.consumerWorkflows,
      [workflowPath]: sources.consumerWorkflows[workflowPath]
        .replace(
          /(  manager:[\s\S]*?)        run: git config --global --add safe.directory "\$GITHUB_WORKSPACE"/,
          '$1        run: echo "moved"',
        )
        .replace(
          "      - name: Run panel acceptance",
          `      - name: Trust the wrong checkout\n        run: ${trustCommand}\n\n      - name: Run panel acceptance`,
        ),
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /manager must trust/);
});
