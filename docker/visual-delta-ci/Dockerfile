FROM node:24.15.0-bookworm

LABEL org.opencontainers.image.source="https://github.com/lapismd/storybook-addon-visual-delta"

ENV CI=true \
    DEBIAN_FRONTEND=noninteractive \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fontconfig \
    git \
    jq \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global npm@12.0.2 \
  && npm cache clean --force \
  && corepack enable \
  && corepack prepare pnpm@10.32.1 --activate \
  && pnpm config set store-dir /pnpm/store

ARG TARGETARCH
RUN case "$TARGETARCH" in \
    amd64) \
      mdbook_target="x86_64-unknown-linux-musl"; \
      mdbook_sha256="5222beabd3e37dc5be0d18ff99b79058469354db5c220153a1b92db5ba12be89" \
      ;; \
    arm64) \
      mdbook_target="aarch64-unknown-linux-musl"; \
      mdbook_sha256="753e5c5c363ee8a56972344dcf91466f005a51db84a7aeffe427ae3ef83d6d44" \
      ;; \
    *) \
      echo "Unsupported mdBook architecture: $TARGETARCH" >&2; \
      exit 1 \
      ;; \
  esac \
  && mdbook_archive="mdbook-v0.5.4-${mdbook_target}.tar.gz" \
  && curl --fail --location --silent --show-error \
    "https://github.com/rust-lang/mdBook/releases/download/v0.5.4/${mdbook_archive}" \
    --output "/tmp/${mdbook_archive}" \
  && echo "${mdbook_sha256}  /tmp/${mdbook_archive}" | sha256sum --check --strict \
  && tar --extract --gzip --file "/tmp/${mdbook_archive}" --directory /usr/local/bin mdbook \
  && rm "/tmp/${mdbook_archive}" \
  && mdbook --version | grep -Fx "mdbook v0.5.4"

WORKDIR /build

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --ignore-scripts \
  && pnpm exec playwright install --with-deps chromium firefox webkit \
  && rm -rf /var/lib/apt/lists/*

RUN test "$(node --version)" = "v24.15.0" \
  && test "$(npm --version)" = "12.0.2" \
  && test "$(pnpm --version)" = "10.32.1" \
  && mdbook --version | grep -Fx "mdbook v0.5.4" \
  && pnpm exec playwright --version | grep -Fx "Version 1.61.1" \
  && test -n "$(find /ms-playwright -type f \( -name chrome -o -name headless_shell \) -perm -u=x -print -quit)" \
  && test -n "$(find /ms-playwright -type f -name firefox -perm -u=x -print -quit)" \
  && test -n "$(find /ms-playwright -type f -name MiniBrowser -perm -u=x -print -quit)"

WORKDIR /__w/storybook-addon-visual-delta/storybook-addon-visual-delta
