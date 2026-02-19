#!/usr/bin/env bash
set -euo pipefail

# --- Virtual display + noVNC (lets users watch the browser live) ---
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix
Xvfb :99 -screen 0 1280x800x24 -ac +extension GLX +render -noreset &

# Give Xvfb a moment to initialise before starting the VNC server
sleep 1

# x11vnc: expose display :99 over VNC (port 5900, localhost only)
x11vnc -display :99 -rfbport 5900 -shared -forever -nopw -localhost \
  -noncache -quiet &

# websockify: proxy VNC → noVNC websocket on port 6080
websockify --web /usr/share/novnc/ 6080 localhost:5900 &

# Virtual audio device (PulseAudio) — needed for browser audio APIs and ffmpeg capture
# --system is required when running as root; HOME=/root for config storage
HOME=/root pulseaudio --system --exit-idle-time=-1 --daemonize=true 2>/dev/null || true

# --- Instance info (written fresh on every start so URLs are always correct) ---
if [[ -n "${INSTANCE_NAME:-}" && -n "${GATEWAY_PORT:-}" ]]; then
  mkdir -p /home/node/.openclaw/workspace
  cat > /home/node/.openclaw/workspace/CLAUDE.md << EOF
# Instance: ${INSTANCE_NAME}

## Your External URLs (accessible from the host machine)
- **Dashboard**: http://127.0.0.1:${GATEWAY_PORT}
- **Live browser view (noVNC)**: http://127.0.0.1:${VNC_PORT}/vnc.html?autoconnect=1
- **Terminal**: http://127.0.0.1:${TERMINAL_PORT}

When the user asks for the noVNC or browser view link, give them the Live browser view URL above.
EOF
fi

# --- Gateway ---
rm -rf /tmp/openclaw-*/gateway.*.lock
exec node dist/index.js gateway --bind lan --port 18789 --allow-unconfigured
