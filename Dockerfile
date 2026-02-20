FROM node:22-bookworm@sha256:cd7bcd2e7a1e6f72052feb023c7f6b722205d3fcab7bbcbd2d1bfdab10b1e935

# Install Bun (required for build scripts)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /app

ARG OPENCLAW_DOCKER_APT_PACKAGES=""
RUN if [ -n "$OPENCLAW_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $OPENCLAW_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

# Install Chromium, Xvfb, noVNC stack, and agent tooling.
# Chromium runs on a virtual display (Xvfb :99); x11vnc exposes it;
# websockify proxies it to noVNC so users can watch the browser live.
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      chromium xvfb x11vnc websockify novnc \
      xclip xdotool scrot wmctrl \
      fonts-noto fonts-noto-color-emoji fonts-liberation \
      pulseaudio \
      ffmpeg imagemagick \
      poppler-utils tesseract-ocr \
      python3-pip python3-venv \
      jq \
      zip unzip p7zip-full \
      build-essential \
      libreoffice && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/* && \
    printf '#!/bin/bash\nexport DISPLAY=:99\nexec chromium --load-extension=/opt/openclaw-stealth --disable-extensions-except=/opt/openclaw-stealth "$@"\n' \
      > /usr/local/bin/chromium-display && \
    chmod +x /usr/local/bin/chromium-display

# Install cloudflared for remote VNC tunnel access (any network, no account needed)
RUN ARCH=$(dpkg --print-architecture) && \
    wget -q -O /usr/local/bin/cloudflared \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}" && \
    chmod +x /usr/local/bin/cloudflared

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY patches ./patches
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

# Optionally install Chromium and Xvfb for browser automation.
# Build with: docker build --build-arg OPENCLAW_INSTALL_BROWSER=1 ...
# Adds ~300MB but eliminates the 60-90s Playwright install on every container start.
# Must run after pnpm install so playwright-core is available in node_modules.
ARG OPENCLAW_INSTALL_BROWSER=""
RUN if [ -n "$OPENCLAW_INSTALL_BROWSER" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends xvfb && \
      node /app/node_modules/playwright-core/cli.js install --with-deps chromium && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

COPY . .
# Install the stealth Chrome extension at the path chromium-display expects
COPY scripts/stealth-ext /opt/openclaw-stealth
RUN pnpm build
# Force pnpm for UI build (Bun may fail on ARM/Synology architectures)
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

ENV NODE_ENV=production

# Add /app to PATH so the `oc` / `openclaw` CLI is reachable from subprocesses
# (e.g. the agent's exec tool) without needing an absolute path.
ENV PATH="/app:${PATH}"

# Install gateway entrypoint script (starts Xvfb if available, then node)
COPY scripts/gateway-entrypoint.sh /usr/local/bin/gateway-entrypoint
RUN chmod +x /usr/local/bin/gateway-entrypoint

# Allow non-root user to write temp files during runtime/tests.
RUN chown -R node:node /app

# Security hardening: Run as non-root user
# The node:22-bookworm image includes a 'node' user (uid 1000)
# This reduces the attack surface by preventing container escape via root privileges
USER node

# Start gateway server with default config.
# Binds to loopback (127.0.0.1) by default for security.
#
# For container platforms requiring external health checks:
#   1. Set OPENCLAW_GATEWAY_TOKEN or OPENCLAW_GATEWAY_PASSWORD env var
#   2. Override CMD: ["node","openclaw.mjs","gateway","--allow-unconfigured","--bind","lan"]
CMD ["node", "openclaw.mjs", "gateway", "--allow-unconfigured"]
