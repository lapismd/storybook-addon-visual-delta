export type PreviewRenderLifecycle = {
  storyId: string;
  renderGeneration: number;
  storyFinished: boolean;
};

type PreviewRenderLifecycleStore = {
  nextGeneration: number;
  current: PreviewRenderLifecycle | null;
};

const STORE_KEY = Symbol.for("visual-delta.preview-render-lifecycle");

function lifecycleStore(): PreviewRenderLifecycleStore {
  const target = globalThis as typeof globalThis & {
    [STORE_KEY]?: PreviewRenderLifecycleStore;
  };
  if (!target[STORE_KEY]) {
    target[STORE_KEY] = {
      // A new iframe receives a later epoch, while the Symbol store preserves
      // increments when Vite replaces this module during HMR.
      nextGeneration: Date.now() * 1_000,
      current: null,
    };
  }
  return target[STORE_KEY];
}

export function beginPreviewRender(storyId: string): PreviewRenderLifecycle {
  const store = lifecycleStore();
  const current = {
    storyId,
    renderGeneration: ++store.nextGeneration,
    storyFinished: false,
  };
  store.current = current;
  return current;
}

export function readPreviewRender(
  storyId: string,
  renderGeneration: number,
): PreviewRenderLifecycle | null {
  const current = lifecycleStore().current;
  if (
    !current ||
    current.storyId !== storyId ||
    current.renderGeneration !== renderGeneration
  ) {
    return null;
  }
  return { ...current };
}

export function readCurrentPreviewRender(
  storyId: string,
): PreviewRenderLifecycle | null {
  const current = lifecycleStore().current;
  if (!current || current.storyId !== storyId) return null;
  return { ...current };
}

export function finishPreviewRender(
  storyId: string,
  renderGeneration: number,
): PreviewRenderLifecycle | null {
  const store = lifecycleStore();
  if (
    !store.current ||
    store.current.storyId !== storyId ||
    store.current.renderGeneration !== renderGeneration
  ) {
    return null;
  }
  store.current = { ...store.current, storyFinished: true };
  return { ...store.current };
}
