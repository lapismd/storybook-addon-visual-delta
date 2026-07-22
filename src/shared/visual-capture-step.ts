import { addons } from "storybook/preview-api";
import { EVENTS } from "../constants.js";
import {
  VISUAL_CAPTURE_READY_ATTR,
  VISUAL_CAPTURE_STEP_ATTR,
  VISUAL_CAPTURE_UNTIL_PARAM,
  readVisualCaptureUntil,
  slugifyStepLabel,
  waitWhileSessionParkedAt,
} from "./interaction-capture.js";

type StepRunner = (
  label: string,
  play: (context?: unknown) => Promise<void> | void,
) => Promise<void> | void;

/**
 * Mark the completed step on <html> and park play when asked via
 * `?visualCaptureUntil=<stepId>` (Playwright) or sessionStorage (Visual Delta
 * panel remount).
 *
 * URL park hangs forever (suite closes the page). Session park waits until the
 * panel clears/changes the target so scrubbing Default ↔ interactions works
 * without leaving Interactions UI stuck after navigation.
 */
export async function afterPlayStep(
  label: string,
  storyId?: string,
): Promise<void> {
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
      return;
    }
    addons.getChannel().emit(EVENTS.VISUAL_CAPTURE_PARKED, {
      storyId,
      stepId,
    });
    // Panel session park — cancellable when selecting another row / Default.
    await waitWhileSessionParkedAt(stepId);
    document.documentElement.removeAttribute(VISUAL_CAPTURE_READY_ATTR);
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
