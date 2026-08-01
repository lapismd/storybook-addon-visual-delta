/**
 * Manager/panel capability resolution for development vs static read-only
 * preview (`VD-CONF-007`, `VD-UI-008`).
 */

export const READ_ONLY_GLOBAL = "__STORYBOOK_VISUAL_DELTA_READ_ONLY__";

export type VisualDeltaCapabilities = {
  /** Any middleware-backed mutation or official browser compare. */
  readOnly: boolean;
  writes: boolean;
  chromiumCompare: boolean;
  /** Browser-neutral capability; chromiumCompare remains a compatibility alias. */
  browserCompare?: boolean;
  runs: boolean;
  configuration: boolean;
  changes: boolean;
  init: boolean;
  history: boolean;
  testingModule: boolean;
};

export type ResolveCapabilitiesInput = {
  /** Host `options.visualDelta.readOnly`. */
  forcedReadOnly?: boolean;
  /** Storybook `CONFIG_TYPE` (`DEVELOPMENT` | `PRODUCTION`). */
  configType?: string;
  /**
   * Result of probing `/__visual-delta/runtime` (or equivalent).
   * `unsupported` means middleware is absent.
   */
  runtime?: "ok" | "unsupported" | "unknown";
};

export function isStorybookDevelopment(configType?: string): boolean {
  return configType === "DEVELOPMENT";
}

export function resolveVisualDeltaCapabilities(
  input: ResolveCapabilitiesInput = {},
): VisualDeltaCapabilities {
  const development = isStorybookDevelopment(input.configType);
  const runtimeBlocks =
    input.runtime === "unsupported" ||
    (input.runtime === "unknown" && !development);
  const readOnly =
    input.forcedReadOnly === true || !development || runtimeBlocks;

  if (readOnly) {
    return {
      readOnly: true,
      writes: false,
      chromiumCompare: false,
      browserCompare: false,
      runs: false,
      configuration: false,
      changes: false,
      init: false,
      history: false,
      testingModule: false,
    };
  }

  return {
    readOnly: false,
    writes: true,
    chromiumCompare: true,
    browserCompare: true,
    runs: true,
    configuration: true,
    changes: true,
    init: true,
    history: true,
    testingModule: true,
  };
}

/** Read host-injected force flag from manager/preview globalThis. */
export function readForcedReadOnlyFromGlobal(
  globalObject: typeof globalThis = globalThis,
): boolean | undefined {
  const value = (globalObject as typeof globalThis & {
    [READ_ONLY_GLOBAL]?: boolean;
  })[READ_ONLY_GLOBAL];
  return typeof value === "boolean" ? value : undefined;
}

export function resolveCapabilitiesFromEnvironment(
  globalObject: typeof globalThis = globalThis,
  runtime: ResolveCapabilitiesInput["runtime"] = "unknown",
): VisualDeltaCapabilities {
  const configType = (
    globalObject as typeof globalThis & { CONFIG_TYPE?: string }
  ).CONFIG_TYPE;
  return resolveVisualDeltaCapabilities({
    forcedReadOnly: readForcedReadOnlyFromGlobal(globalObject),
    configType,
    runtime,
  });
}

export const READ_ONLY_REQUIRES_DEV =
  "Requires Storybook development with Visual Delta middleware.";
