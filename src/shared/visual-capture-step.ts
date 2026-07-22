import {
  VISUAL_CAPTURE_READY_ATTR,
  VISUAL_CAPTURE_STEP_ATTR,
  VISUAL_CAPTURE_UNTIL_PARAM,
  readVisualCaptureUntil,
  slugifyStepLabel,
} from "./interaction-capture.js";

type StepRunner = (
  label: string,
  play: (context?: unknown) => Promise<void> | void,
) => Promise<void> | void;

/**
 * Mark the completed step on <html> and park play when Playwright asked via
 * `?visualCaptureUntil=<stepId>` so the suite can screenshot mid-play.
 *
 * Session-only park (Visual Delta panel remount) must not hang forever — that
 * leaves Storybook's instrumenter / Interactions UI stuck and can blank the
 * manager. Panel scrubbing uses instrumenter GOTO when a callId is available.
 */
export async function afterPlayStep(label: string): Promise<void> {
  if (typeof document === "undefined") return;
  const stepId = slugifyStepLabel(label);
  if (!stepId) return;

  document.documentElement.setAttribute(VISUAL_CAPTURE_STEP_ATTR, stepId);

  const until = readVisualCaptureUntil();
  if (until && until === stepId) {
    document.documentElement.setAttribute(VISUAL_CAPTURE_READY_ATTR, stepId);
    let fromUrl = false;
    try {
      fromUrl = Boolean(
        new URLSearchParams(location.search).get(VISUAL_CAPTURE_UNTIL_PARAM),
      );
    } catch {
      fromUrl = false;
    }
    if (fromUrl) {
      // Playwright capture — page is closed after the screenshot.
      await new Promise<never>(() => {});
    }
  }
}

/**
 * Author helper: wrap a play segment as a named Storybook step that participates
 * in the Interactions tab and can be opted into visual capture from Visual Delta.
 *
 * @example
 * play={async ({ canvas, step }) => {
 *   await visualCapture(step, "Opens chooser", async () => {
 *     await userEvent.click(canvas.getByRole("button", { name: "Add New Section" }));
 *   });
 * }}
 */
export async function visualCapture(
  step: StepRunner,
  label: string,
  play:
    | (() => Promise<void> | void)
    | ((context: unknown) => Promise<void> | void),
): Promise<void> {
  await step(label, async (context) => {
    if (play.length > 0) {
      await play(context);
    } else {
      await (play as () => Promise<void> | void)();
    }
  });
}
