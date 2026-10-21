import { hostPlaywright } from "./capture-profile.js";
import { existsSync } from "node:fs";
import path from "node:path";
import { inspectVisualDeltaOnboarding } from "./init-scaffold.js";
import { readVisualDeltaProjectConfig } from "./project-config.js";
import { detectVisualDeltaVcsKind } from "./change-set-vcs.js";
import { discoverSnapshotBrowsers } from "./snapshot-environments.js";
import {
  resolveSnapshotDir,
  resolveBaselinePathMode,
  DEFAULT_VISUAL_UPDATE_ARGS,
  DEFAULT_VISUAL_INTERACTION_UPDATE_ARGS,
  DEFAULT_VISUAL_TEST_ARGS,
  type VisualDeltaHostOptions,
} from "./options.js";
import { validateVisualCaptureProfile } from "../shared/capture-profile.js";
import type {
  VisualDeltaResolvedConfig,
  VisualDeltaConfigDiagnostic,
} from "../shared/config-types.js";
import { resolveVisualDeltaCaptureRunner } from "./capture-runner.js";
import {
  captureNamespace,
  readCaptureConfiguration,
} from "./capture-configuration.js";
export async function resolvedConfigPayload(
  root: string,
  options: VisualDeltaHostOptions,
  visualPort: number,
): Promise<VisualDeltaResolvedConfig> {
  const runner = await resolveVisualDeltaCaptureRunner(root);
  const profileErrors = validateVisualCaptureProfile(runner.profile);
  if (runner.kind === "native") {
    try {
      const playwright = hostPlaywright(root);
      for (const browser of runner.profile.browsers)
        if (!existsSync(playwright[browser].executablePath()))
          profileErrors.push(
            `Native ${browser} is unavailable; run pnpm exec playwright install ${browser}.`,
          );
    } catch (error) {
      profileErrors.push(String(error));
    }
  }
  const snapshotDir = resolveSnapshotDir(options, root);
  const onboardingStatus = inspectVisualDeltaOnboarding(root, snapshotDir);
  const diagnostics: VisualDeltaConfigDiagnostic[] = [];
  const projectConfig = readVisualDeltaProjectConfig(root);
  const vcsKind = detectVisualDeltaVcsKind(root);
  diagnostics.push(...projectConfig.diagnostics);
  if (!existsSync(snapshotDir)) {
    diagnostics.push({
      code: "snapshot-dir-missing",
      severity: "warning",
      setting: "snapshotDir",
      message: `Snapshot directory does not exist yet: ${snapshotDir}`,
      suggestion: "Create the first visual baseline to initialize it.",
    });
  }
  if (!onboardingStatus.ready) {
    diagnostics.push({
      code: "playwright-setup-incomplete",
      severity: "error",
      setting: "onboarding",
      message: onboardingStatus.hint,
      suggestion: "Run pnpm exec visual-delta init from the package root.",
    });
  }
  const staticHint =
    "Preset staticDirs mounts snapshotDir at /visual-baselines (or host maps it).";
  diagnostics.push({
    code: "static-baseline-mount",
    severity: "info",
    setting: "snapshotDir",
    message: staticHint,
  });
  const payload: VisualDeltaResolvedConfig = {
    ok: true,
    options: {
      root,
      snapshotDir,
      baselinePathMode: resolveBaselinePathMode(options),
      visualServerPort: visualPort,
      allowRebuild: options.allowRebuild !== false,
      allowVcsWrites: options.allowVcsWrites === true,
      visualUpdateArgs: [
        ...(options.visualUpdateArgs ?? [...DEFAULT_VISUAL_UPDATE_ARGS]),
      ],
      visualInteractionUpdateArgs: [
        ...(options.visualInteractionUpdateArgs ?? [
          ...DEFAULT_VISUAL_INTERACTION_UPDATE_ARGS,
        ]),
      ],
      visualTestArgs: [
        ...(options.visualTestArgs ?? [...DEFAULT_VISUAL_TEST_ARGS]),
      ],
      addonSrcDir: options.addonSrcDir?.trim() || null,
    },
    playwrightPassThresholdPercent: projectConfig.defaults.passThresholdPercent,
    projectDefaults: projectConfig.defaults,
    browsers: projectConfig.browsers,
    captureWorkspaceIgnore: projectConfig.captureWorkspaceIgnore,
    runtimePlatform: process.platform,
    availableEnvironments: [],
    availableBrowsers: discoverSnapshotBrowsers(snapshotDir),
    captureProfile: runner.profile,
    artifactNamespace: captureNamespace(root),
    captureConfiguration: readCaptureConfiguration(root),
    localConfigPath: path.join(root, ".visual-delta/config.local.json"),
    captureRunner: {
      kind: runner.kind,
      available: profileErrors.length === 0,
      ...(profileErrors.length ? { reason: profileErrors.join(" ") } : {}),
    },
    workflow: projectConfig.workflow,
    vcs: {
      kind: vcsKind,
      available: vcsKind != null,
      writeAllowed: vcsKind != null && options.allowVcsWrites === true,
      ...(!vcsKind
        ? { reason: "No Git or Jujutsu repository was detected." }
        : options.allowVcsWrites !== true
          ? {
              reason:
                "VCS commits are disabled until allowVcsWrites is enabled in Storybook.",
            }
          : {}),
    },
    projectDefaultSources: projectConfig.sources,
    projectConfigPath: projectConfig.path,
    projectConfigExists: projectConfig.exists,
    onboarding: {
      suiteReady: onboardingStatus.suiteReady,
      playwrightConfigReady: onboardingStatus.playwrightConfigReady,
      snapshotDirExists: onboardingStatus.snapshotDirExists,
      ready: onboardingStatus.ready,
      hint: onboardingStatus.hint,
    },
    diagnostics,
    warnings: diagnostics.map((diagnostic) => diagnostic.message),
  };
  return payload;
}
