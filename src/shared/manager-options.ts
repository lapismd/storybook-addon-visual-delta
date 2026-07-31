import { READ_ONLY_GLOBAL } from "./capabilities.js";

export const TOOLBAR_STATUS_GLOBAL =
  "__STORYBOOK_VISUAL_DELTA_SHOW_TOOLBAR_STATUS_LABELS__";

export { READ_ONLY_GLOBAL };

export function resolveToolbarStatusEnabled(configured?: boolean): boolean {
  return configured !== false;
}

export function renderToolbarStatusManagerHead(enabled: boolean): string {
  return `<script>globalThis.${TOOLBAR_STATUS_GLOBAL}=${JSON.stringify(enabled)};</script>`;
}

/** Inject host `readOnly` into the manager bundle (static builds also use CONFIG_TYPE). */
export function renderReadOnlyManagerHead(readOnly: boolean): string {
  if (!readOnly) return "";
  return `<script>globalThis.${READ_ONLY_GLOBAL}=true;</script>`;
}
