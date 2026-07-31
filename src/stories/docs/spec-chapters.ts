/**
 * Maps canonical `spec/src` filenames to Storybook Specification docs titles.
 * Keep in sync with `spec/src/SUMMARY.md`.
 */
export const SPEC_CHAPTERS = [
  {
    file: "index.md",
    title: "Visual Delta/Specification/System specification",
    label: "System specification",
  },
  {
    file: "architecture.md",
    title: "Visual Delta/Specification/Architecture",
    label: "Architecture",
  },
  {
    file: "configuration.md",
    title: "Visual Delta/Specification/Configuration",
    label: "Configuration",
  },
  {
    file: "interfaces.md",
    title: "Visual Delta/Specification/Interfaces",
    label: "Interfaces",
  },
  {
    file: "baseline-model.md",
    title: "Visual Delta/Specification/Baseline model",
    label: "Baseline model",
  },
  {
    file: "capture-and-comparison.md",
    title: "Visual Delta/Specification/Capture and comparison",
    label: "Capture and comparison",
  },
  {
    file: "panel-and-preview.md",
    title: "Visual Delta/Specification/Panel and preview",
    label: "Panel and preview",
  },
  {
    file: "test-runs-and-scopes.md",
    title: "Visual Delta/Specification/Test runs and scopes",
    label: "Test runs and scopes",
  },
  {
    file: "mutations-and-review.md",
    title: "Visual Delta/Specification/Mutations and review",
    label: "Mutations and review",
  },
  {
    file: "vcs-and-history.md",
    title: "Visual Delta/Specification/Version control and history",
    label: "Version control and history",
  },
  {
    file: "host-profile.md",
    title: "Visual Delta/Specification/UI catalog host profile",
    label: "UI catalog host profile",
  },
  {
    file: "spec-governance.md",
    title: "Visual Delta/Specification/Specification governance",
    label: "Specification governance",
  },
  {
    file: "verification.md",
    title: "Visual Delta/Specification/Verification",
    label: "Verification",
  },
] as const;

export type SpecChapterFile = (typeof SPEC_CHAPTERS)[number]["file"];

/** Storybook docs id for a CSF/MDX title (Storybook 10 slug rules). */
export function storybookDocsIdFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function storybookDocsPathFromTitle(title: string): string {
  return `/?path=/docs/${storybookDocsIdFromTitle(title)}--docs`;
}

const FILE_TO_DOCS_PATH = new Map(
  SPEC_CHAPTERS.map((chapter) => [
    chapter.file,
    storybookDocsPathFromTitle(chapter.title),
  ]),
);

/**
 * Rewrite a relative Markdown href targeting `spec/src` into a Storybook docs
 * path when possible. External and non-markdown links are left unchanged.
 */
export function rewriteSpecHref(href: string | undefined): string | undefined {
  if (!href || href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }
  if (href.startsWith("mailto:") || href.startsWith("#")) {
    return href;
  }

  const [pathPart, hash = ""] = href.split("#");
  const fileName = pathPart.replace(/^\.\//, "").replace(/^\//, "");
  if (!fileName.endsWith(".md")) {
    return href;
  }

  const docsPath = FILE_TO_DOCS_PATH.get(fileName as SpecChapterFile);
  if (!docsPath) {
    return href;
  }
  return hash ? `${docsPath}#${hash}` : docsPath;
}
