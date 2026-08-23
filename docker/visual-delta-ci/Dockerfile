FROM node:24.15.0-bookworm

LABEL org.opencontainers.image.source="https://github.com/lapismd/storybook-addon-visual-delta"

ENV CI=true \
    DEBIAN_FRONTEND=noninteractive \
    DENO_DIR=/deno-dir \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fontconfig \
    git \
    jq \
    unzip \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global npm@12.0.2 \
  && npm cache clean --force

ARG TARGETARCH
RUN case "$TARGETARCH" in \
    amd64) \
      deno_target="x86_64-unknown-linux-gnu"; \
      deno_sha256="8b010a3b1a4a0188a67cdb8a7a27348b2a501af78aec7fc74f2ace167368d530" \
      ;; \
    arm64) \
      deno_target="aarch64-unknown-linux-gnu"; \
      deno_sha256="6b7cae3a8fc4385a59dea3146fcb8bad7fea4230e0ad36a8c692afacbc254be0" \
      ;; \
    *) \
      echo "Unsupported Deno architecture: $TARGETARCH" >&2; \
      exit 1 \
      ;; \
  esac \
  && deno_archive="deno-${deno_target}.zip" \
  && curl --fail --location --silent --show-error \
    "https://github.com/denoland/deno/releases/download/v2.9.5/${deno_archive}" \
    --output "/tmp/${deno_archive}" \
  && echo "${deno_sha256}  /tmp/${deno_archive}" | sha256sum --check --strict \
  && unzip -q "/tmp/${deno_archive}" -d /usr/local/bin \
  && rm "/tmp/${deno_archive}" \
  && deno --version | head -n 1 | grep -Fx "deno 2.9.5 (stable, release, ${deno_target})"

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

COPY package.json deno.json deno.lock ./

RUN jq 'del(.links)' deno.json > deno.container.json \
  && mv deno.container.json deno.json \
  && jq 'del(.workspace.links)' deno.lock > deno.container.lock \
  && mv deno.container.lock deno.lock \
  && deno ci \
  && node ./node_modules/playwright/cli.js install --with-deps chromium firefox webkit \
  && rm -rf /var/lib/apt/lists/*

RUN test "$(node --version)" = "v24.15.0" \
  && test "$(npm --version)" = "12.0.2" \
  && test "$(deno --version | head -n 1 | cut -d' ' -f2)" = "2.9.5" \
  && mdbook --version | grep -Fx "mdbook v0.5.4" \
  && node ./node_modules/playwright/cli.js --version | grep -Fx "Version 1.61.1" \
  && test -n "$(find /ms-playwright -type f \( -name chrome -o -name headless_shell \) -perm -u=x -print -quit)" \
  && test -n "$(find /ms-playwright -type f -name firefox -perm -u=x -print -quit)" \
  && test -n "$(find /ms-playwright -type f -name MiniBrowser -perm -u=x -print -quit)"

WORKDIR /__w/storybook-addon-visual-delta/storybook-addon-visual-delta
