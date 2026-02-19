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

# --- Gateway ---
rm -rf /tmp/openclaw-*/gateway.*.lock
exec node dist/index.js gateway --bind lan --port 18789 --allow-unconfigured
