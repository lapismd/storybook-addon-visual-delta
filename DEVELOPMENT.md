# Visual Delta development reloads

The Storybook preview iframe is served by Vite, so preview and overlay source
changes use Vite HMR. Storybook's manager is different: its local addon entries
are compiled into a one-shot esbuild bundle.

The workspace `pnpm storybook` wrapper watches Visual Delta manager and panel
sources and restarts Storybook to rebuild that bundle. In development, the
manager polls `GET /__visual-delta/runtime` once per second. That endpoint
returns an identity which is stable for one middleware instance and changes
after a restart. When the identity changes, the manager reloads the page once
so the rebuilt bundle is loaded while retaining URL-backed story, panel, and
filter state.

Transient request failures during a restart are ignored. A host without the
runtime endpoint (404), or one returning a malformed success response, disables
the watcher for that browser session. Static and production builds do not
install the watcher.
