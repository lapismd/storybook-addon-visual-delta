import { storybookDocsPathFromTitle } from "./spec-chapters.js";

/** Stable Storybook docs paths for Spec chapters and story Guidance pages. */
export const SPEC_DOCS = {
  system: storybookDocsPathFromTitle(
    "Visual Delta/Specification/System specification",
  ),
  architecture: storybookDocsPathFromTitle(
    "Visual Delta/Specification/Architecture",
  ),
  configuration: storybookDocsPathFromTitle(
    "Visual Delta/Specification/Configuration",
  ),
  interfaces: storybookDocsPathFromTitle(
    "Visual Delta/Specification/Interfaces",
  ),
  baselineModel: storybookDocsPathFromTitle(
    "Visual Delta/Specification/Baseline model",
  ),
  captureAndComparison: storybookDocsPathFromTitle(
    "Visual Delta/Specification/Capture and comparison",
  ),
  panelAndPreview: storybookDocsPathFromTitle(
    "Visual Delta/Specification/Panel and preview",
  ),
  testRunsAndScopes: storybookDocsPathFromTitle(
    "Visual Delta/Specification/Test runs and scopes",
  ),
  mutationsAndReview: storybookDocsPathFromTitle(
    "Visual Delta/Specification/Mutations and review",
  ),
  vcsAndHistory: storybookDocsPathFromTitle(
    "Visual Delta/Specification/Version control and history",
  ),
  hostProfile: storybookDocsPathFromTitle(
    "Visual Delta/Specification/UI catalog host profile",
  ),
  governance: storybookDocsPathFromTitle(
    "Visual Delta/Specification/Specification governance",
  ),
  verification: storybookDocsPathFromTitle(
    "Visual Delta/Specification/Verification",
  ),
} as const;

export const GUIDANCE_DOCS = {
  panelShell: storybookDocsPathFromTitle("Visual Delta/Panel Shell/Guidance"),
  panelChrome: storybookDocsPathFromTitle("Visual Delta/Panel Chrome/Guidance"),
  testingModule: storybookDocsPathFromTitle(
    "Visual Delta/Testing Module/Guidance",
  ),
  diffResult: storybookDocsPathFromTitle("Visual Delta/Diff Result/Guidance"),
  compareAlignment: storybookDocsPathFromTitle(
    "Visual Delta/Compare Alignment/Guidance",
  ),
  readiness: storybookDocsPathFromTitle(
    "Visual Delta/Readiness Fixture/Guidance",
  ),
  hostStubs: storybookDocsPathFromTitle("Visual Delta/Host Stubs/Guidance"),
} as const;
