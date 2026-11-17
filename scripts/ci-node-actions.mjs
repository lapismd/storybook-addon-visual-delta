export const AUDITED_NODE24_ACTIONS = new Set([
  "lapismd/lapis-ci/actions/guard-version-runtime@dc81ff65ba812bf005fb2a806eb3308bb8b5f71f",
  "lapismd/dependency-automation/.github/workflows/completion.yml@92e3e55d174498916c134f950850e1d572656cab",
  // The shared notifier pins Node 24.15.0 and its own action commit SHAs.
  "lapismd/dependency-automation/.github/workflows/notify.yml@ea9d35b12b612467bbabf1c6271ffa41b5eda4ba",
  "actions/checkout@v5",
  "actions/configure-pages@v6",
  "actions/deploy-pages@v5",
  "actions/upload-pages-artifact@v5",
  "actions/upload-artifact@v6",
  "peter-evans/create-pull-request@v8",
  "docker/login-action@v4",
  "docker/setup-qemu-action@v4",
  "docker/setup-buildx-action@v4",
  "docker/build-push-action@v7",
]);
