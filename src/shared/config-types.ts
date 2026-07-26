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

/** Serializable host options exposed by GET /__visual-delta/config. */
export type VisualDeltaResolvedConfig = {
  ok: true;
  options: {
    root: string;
    snapshotDir: string;
    baselinePathMode: "nested-import" | "story-id";
    visualServerPort: number;
    allowRebuild: boolean;
    visualUpdateArgs: string[];
    visualInteractionUpdateArgs: string[];
    visualTestArgs: string[];
    addonSrcDir: string | null;
  };
  /**
   * Package-wide Playwright pass threshold (% of pixels), from
   * `.visual-delta/playwright.json` or the built-in default (1).
   */
  playwrightPassThresholdPercent: number;
  onboarding: VisualDeltaOnboardingConfig;
  diagnostics?: VisualDeltaConfigDiagnostic[];
  /** Legacy flat messages retained for existing hosts and consumers. */
  warnings: string[];
};
