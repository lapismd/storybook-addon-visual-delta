/** Portable onboarding status (suite + Playwright config presence). */
export type VisualDeltaOnboardingConfig = {
  suiteReady: boolean;
  playwrightConfigReady: boolean;
  snapshotDirExists: boolean;
  ready: boolean;
  hint: string;
};

export type VisualDeltaConfigDiagnostic = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  setting?: string;
  suggestion?: string;
};

export type VisualDeltaZoomDefault = "fit" | "100%";

export type VisualDeltaVcsMode = "off" | "review" | "auto";

export type {
  VisualBaselineEnvironment,
  VisualBaselineTarget,
  VisualDeltaBrowser,
} from "./environments.js";
export type { VisualCaptureProfile } from "./capture-profile.js";
export type { VisualTestFailureMode } from "./failure-mode.js";

export type VisualDeltaWorkflowConfig = {
  /** Approve the exact story after a fresh authoritative live pass. */
  autoAcceptLiveStoryComparisons: boolean;
  visualTestFailureMode: import("./failure-mode.js").VisualTestFailureMode;
  vcs: {
    mode: VisualDeltaVcsMode;
    commitMessageTemplate: string;
  };
};

export type VisualDeltaVcsCapability = {
  kind: "jj" | "git" | null;
  available: boolean;
  writeAllowed: boolean;
  reason?: string;
};

export type VisualDeltaProjectDefaults = {
  passThresholdPercent: number;
  diffThreshold: number;
  diffIncludeAntiAliasing: boolean;
  delay: number;
  /** Capture / display density when image entries omit deviceScaleFactor. */
  deviceScaleFactor: number;
  cropToViewport: boolean;
  placement: "left" | "right" | "above" | "below" | "center";
  opacity: number;
  baselineLabelOffset: { x: number; y: number };
  previewSplitZoomDefault: VisualDeltaZoomDefault;
  diffResultZoomDefault: VisualDeltaZoomDefault;
};

export type VisualDeltaProjectDefaultSource = "project" | "legacy" | "built-in";

/** Serializable host options exposed by GET /__visual-delta/config. */
export type VisualDeltaResolvedConfig = {
  ok: true;
  options: {
    root: string;
    snapshotDir: string;
    baselinePathMode: "nested-import" | "story-id";
    visualServerPort: number;
    allowRebuild: boolean;
    allowVcsWrites: boolean;
    visualUpdateArgs: string[];
    visualInteractionUpdateArgs: string[];
    visualTestArgs: string[];
    addonSrcDir: string | null;
  };
  /**
   * Package-wide Playwright pass threshold (% of pixels), from
   * `.visual-delta/playwright.json` or the built-in default (1.5).
   */
  playwrightPassThresholdPercent: number;
  /** Editable values resolved from project file → legacy fallback → built-ins. */
  projectDefaults: VisualDeltaProjectDefaults;
  /** Enabled local Playwright browser projects; Chromium alone by default. */
  browsers: import("./environments.js").VisualDeltaBrowser[];
  /** Node platform hosting the development middleware. */
  runtimePlatform: string;
  /** @deprecated Legacy environment inventory; canonical responses return []. */
  availableEnvironments: import("./environments.js").VisualBaselineEnvironment[];
  /** Canonical browser suffixes found beneath the configured snapshotDir. */
  availableBrowsers: import("./environments.js").VisualDeltaBrowser[];
  /** Canonical Linux/ARM64 capture provenance. */
  captureProfile: import("./capture-profile.js").VisualCaptureProfile;
  captureRunner: {
    kind: "docker" | "custom";
    available: boolean;
    reason?: string;
  };
  /** Project workflow policy. All mutation/commit automation defaults off. */
  workflow: VisualDeltaWorkflowConfig;
  /** Detected repository and effective host write capability. */
  vcs: VisualDeltaVcsCapability;
  projectDefaultSources: Record<
    keyof VisualDeltaProjectDefaults,
    VisualDeltaProjectDefaultSource
  >;
  projectConfigPath: string;
  projectConfigExists: boolean;
  onboarding: VisualDeltaOnboardingConfig;
  diagnostics?: VisualDeltaConfigDiagnostic[];
  /** Legacy flat messages retained for existing hosts and consumers. */
  warnings: string[];
};
