/** Portable onboarding status (suite + Playwright config presence). */
export type VisualDeltaOnboardingConfig = {
  suiteReady: boolean;
  playwrightConfigReady: boolean;
  snapshotDirExists: boolean;
  ready: boolean;
  hint: string;
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
  onboarding: VisualDeltaOnboardingConfig;
  warnings: string[];
};
