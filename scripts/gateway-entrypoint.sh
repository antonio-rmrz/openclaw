#!/usr/bin/env bash
set -euo pipefail

# Start Xvfb virtual display if installed (browser support)
if command -v Xvfb >/dev/null 2>&1; then
  # Clean up stale X lock/socket files from previous container crashes
  rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
  mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix
  Xvfb :99 -screen 0 1280x800x24 -ac +extension GLX +render -noreset &
fi

# Remove stale gateway lock files from previous crashes
rm -rf /tmp/openclaw-*/gateway.*.lock

exec node dist/index.js gateway --bind lan --port 18789 --allow-unconfigured
