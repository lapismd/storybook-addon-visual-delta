---
"@lapismd/storybook-addon-visual-delta": patch
---

Give native macOS and Linux captures the same cached-image reuse and affected-story skipping as Docker using measured host font manifests. Preserve capture availability when font evidence is incomplete, with conservative recapture instead of unsafe reuse.

Stage prior native actuals and sidecars for reuse, and invalidate passing affected results when the measured font, browser or operating-system profile changes.
