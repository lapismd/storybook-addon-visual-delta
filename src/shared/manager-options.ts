export const TOOLBAR_STATUS_GLOBAL =
  "__STORYBOOK_VISUAL_DELTA_SHOW_TOOLBAR_STATUS_LABELS__";

export function resolveToolbarStatusEnabled(configured?: boolean): boolean {
  return configured !== false;
}

export function renderToolbarStatusManagerHead(enabled: boolean): string {
  return `<script>globalThis.${TOOLBAR_STATUS_GLOBAL}=${JSON.stringify(enabled)};</script>`;
}
