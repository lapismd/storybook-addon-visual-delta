import {
  defineConfig,
  groupedIdVerification,
  tableRequirements,
} from "@lapismd/spec-validator";

export default defineConfig(tableRequirements(), {
  name: "storybook-addon-visual-delta",
  idPattern: /^VD-[A-Z]+-\d{3}$/,
  referencePattern: /\bVD-(?!GAP-)[A-Z]+-\d{3}\b/g,
  ruleIds: {
    summary: "VD-GOV-001",
    governance: "VD-GOV-001",
    verification: "VD-GOV-003",
    book: "VD-GOV-001",
    bookIgnore: "VD-GOV-007",
    repositoryLayout: "VD-GOV-007",
    markdownlint: "VD-GOV-001",
    specFirst: "VD-GOV-004",
    internal: "VD-GOV-005",
  },
  validators: {
    summary: true,
    governance: {
      acceptance: false,
      normative: true,
      proseLimits: false,
      references: true,
      changeMap: false,
    },
    verification: groupedIdVerification({
      headers: {
        ids: ["Requirements"],
        status: ["Audit state"],
        evidence: ["Primary automated evidence"],
        required: [["Primary implementation evidence"]],
      },
      statuses: ["Conforming", "Partial", "Gap", "Not run"],
      statusMatch: "prefix",
    }),
    book: true,
    repositoryLayout: {
      requiredFiles: [
        "AGENTS.md",
        "CHANGELOG.md",
        "DEVELOPMENT.md",
        "README.md",
      ],
      forbiddenEntries: ["specs"],
      forbiddenPaths: ["^specs(?:/|$)"],
      allowedRootMarkdown: [
        "AGENTS.md",
        "CHANGELOG.md",
        "DEVELOPMENT.md",
        "README.md",
      ],
    },
    markdownlint: { config: ".markdownlint-cli2.jsonc" },
    specFirst: {
      mode: "any",
      canonicalPattern: "^spec/src/(?!SUMMARY\\.md$).+\\.md$",
      ignore: [
        "(^|/)node_modules/",
        "(^|/)dist/",
        "(^|/)(?:coverage|test-results|playwright-report|blob-report)/",
        "(^|/)\\.cache/",
        "^spec/book/",
        "^tests/",
        "^src/test/",
        "^src/stories/",
        "\\.(?:spec|test)\\.[cm]?[jt]sx?$",
        "\\.stories\\.(?:svelte|[cm]?[jt]sx?)$",
        "\\.d\\.ts$",
        "\\.(?:actual|diff)\\.png$",
      ],
      protected: [
        "^src/.+\\.(?:[cm]?[jt]sx?|svelte|css)$",
        "^(?:playwright\\.panel\\.config\\.ts|tsconfig(?:\\.[^.]+)*\\.json|AGENTS\\.md)$",
        "^(?:\\.markdownlint-cli2\\.jsonc|spec/(?:book\\.toml|Makefile))$",
        "^(?:\\.dockerignore|docker/visual-delta-ci/Dockerfile)$",
        "^(?:deno\\.json|deno\\.lock|lapismd-workspace\\.json|\\.node-version)$",
        "^scripts/check-ci-image\\.mjs$",
        "^scripts/audit-dependencies\\.ts$",
        "^scripts/check-runtime-boundaries\\.ts$",
        "^scripts/check-spec-.+\\.mjs$",
        "^\\.storybook/.+\\.[cm]?[jt]sx?$",
        "^\\.github/workflows/.+\\.ya?ml$",
        "^spec-validator\\.config\\.mjs$",
      ],
      conditional: {
        "package.json":
          'visual-delta|storybook|test:|spec:|markdownlint|playwright|"checks"|publishConfig|repository|private|"version"|release:',
      },
    },
  },
  check: {
    lanes: [
      {
        name: "repository script tests",
        command: "deno",
        args: ["task", "test:scripts"],
      },
      {
        name: "CI image contract",
        command: "deno",
        args: ["task", "ci:image:check"],
      },
    ],
    build: true,
    first: true,
  },
});
