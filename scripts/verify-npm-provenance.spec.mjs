import assert from "node:assert/strict";
import test from "node:test";

import { PACKAGE_NAME } from "./check-npm-release.mjs";
import {
  PROVENANCE_PREDICATE,
  PUBLISH_REPOSITORY,
  PUBLISH_WORKFLOW,
  verifyNpmProvenance,
} from "./verify-npm-provenance.mjs";

const VERSION = "0.0.1";
const CANONICAL_SUBJECT =
  `pkg:npm/%40lapismd/storybook-addon-visual-delta@${VERSION}`;

function encodedStatement(overrides = {}) {
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [
      {
        name: CANONICAL_SUBJECT,
        digest: { sha512: "tarball-digest" },
      },
    ],
    predicateType: PROVENANCE_PREDICATE,
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            repository: PUBLISH_REPOSITORY,
            path: PUBLISH_WORKFLOW,
            ref: `refs/tags/v${VERSION}`,
          },
        },
      },
    },
    ...overrides,
  };
  return Buffer.from(JSON.stringify(statement)).toString("base64url");
}

function audit(overrides = {}) {
  return {
    verified: [
      {
        name: PACKAGE_NAME,
        version: VERSION,
        attestations: {
          provenance: { predicateType: PROVENANCE_PREDICATE },
        },
        attestationBundles: [
          {
            predicateType: PROVENANCE_PREDICATE,
            bundle: {
              dsseEnvelope: { payload: encodedStatement() },
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

test("accepts a verified Sigstore provenance bundle for the exact release", () => {
  const result = verifyNpmProvenance(audit(), { version: VERSION });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("requires npm's canonical scoped-package PURL subject", () => {
  const result = verifyNpmProvenance(
    audit({
      verified: [
        {
          ...audit().verified[0],
          attestationBundles: [
            {
              predicateType: PROVENANCE_PREDICATE,
              bundle: {
                dsseEnvelope: {
                  payload: encodedStatement({
                    subject: [
                      {
                        name: `pkg:npm/${PACKAGE_NAME}@${VERSION}`,
                        digest: { sha512: "tarball-digest" },
                      },
                    ],
                  }),
                },
              },
            },
          ],
        },
      ],
    }),
    { version: VERSION },
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /pkg:npm\/%40lapismd/);
});

test("rejects a missing verified package or provenance bundle", () => {
  const missingPackage = verifyNpmProvenance({ verified: [] }, { version: VERSION });
  assert.equal(missingPackage.ok, false);
  assert.match(missingPackage.errors.join("\n"), /no verified registry package/);

  const missingBundle = verifyNpmProvenance(
    audit({
      verified: [
        {
          name: PACKAGE_NAME,
          version: VERSION,
          attestations: {},
          attestationBundles: [],
        },
      ],
    }),
    { version: VERSION },
  );
  assert.equal(missingBundle.ok, false);
  assert.match(missingBundle.errors.join("\n"), /Sigstore provenance bundle/);
});

test("rejects provenance from an unexpected tag, repository, or workflow", () => {
  const result = verifyNpmProvenance(
    audit({
      verified: [
        {
          ...audit().verified[0],
          attestationBundles: [
            {
              predicateType: PROVENANCE_PREDICATE,
              bundle: {
                dsseEnvelope: {
                  payload: encodedStatement({
                    predicate: {
                      buildDefinition: {
                        externalParameters: {
                          workflow: {
                            repository: "https://github.com/example/wrong",
                            path: ".github/workflows/wrong.yml",
                            ref: "refs/tags/v1.0.0",
                          },
                        },
                      },
                    },
                  }),
                },
              },
            },
          ],
        },
      ],
    }),
    { version: VERSION },
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /provenance repository/);
  assert.match(result.errors.join("\n"), /provenance workflow/);
  assert.match(result.errors.join("\n"), /provenance tag/);
});
