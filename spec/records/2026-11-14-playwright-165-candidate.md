# Playwright 1.65 candidate image

Published by [run 43540534442](https://github.com/lapismd/storybook-addon-visual-delta/actions/runs/43540534442). The build and both native architecture smokes passed before this manifest was assembled.

```json
{
  "sourceRevision": "011fbe152a884c3b6e5afd8842d557775c33b4f9",
  "lockSha256": "38566ba23a3797de5d170ac0f5364d6ee43bf0083d1e67fcc1cd33c60e1028ed",
  "schemaVersion": 1,
  "id": "visual-delta-linux-arm64-v1",
  "os": "linux",
  "architecture": "arm64",
  "image": "ghcr.io/lapismd/storybook-addon-visual-delta-ci",
  "imageDigest": "sha256:6b8f1165410982f4b7a5573bceefd008a6d349c23c48825231ec51b0e89dd948",
  "arm64ImageDigest": "sha256:1905b9652af6acc73e656193a78b9ee9a86a17c19a79bef0df60da133c375a27",
  "nodeVersion": "24.15.0",
  "npmVersion": "12.0.2",
  "pnpmVersion": "10.32.1",
  "playwrightVersion": "1.65.0",
  "browsers": [
    "chromium",
    "firefox",
    "webkit"
  ],
  "browserVersions": {
    "chromium": "158.0.8127.18",
    "firefox": "159.0",
    "webkit": "27.2"
  },
  "locale": "en-GB",
  "timezoneId": "Europe/London",
  "colorScheme": "light",
  "reducedMotion": "reduce",
  "viewport": {
    "width": 1280,
    "height": 900
  },
  "deviceScaleFactor": 1,
  "rendering": {
    "animations": "disabled",
    "caret": "hide",
    "screenshotScale": "device"
  },
  "fontManifestSha256": "sha256:be624be721eecdf535a480ca7e0382cd6510f8060b849f604eb55144ed1c83d3"
}
```

These pins are a PR candidate until required ARM64 browser acceptance passes.
No committed baseline files were changed. Release audit and consumer artifact
qualification remain separate gates.
