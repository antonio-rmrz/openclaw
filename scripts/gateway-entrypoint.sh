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

# --- Cloudflare Tunnel: public VNC URL accessible from any network ---
# Runs cloudflared quick tunnel in background; writes the full ready-to-share
# noVNC URL to .vnc-tunnel-url once the tunnel is established (~10-15s).
mkdir -p /home/node/.openclaw/workspace
(
  cloudflared tunnel --url http://localhost:6080 --no-autoupdate 2>&1 | \
    grep -m1 -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | \
    sed 's|$|/vnc.html?autoconnect=1|' \
    > /home/node/.openclaw/workspace/.vnc-tunnel-url
) &

# --- Instance info (written fresh on every start so URLs are always correct) ---
if [[ -n "${INSTANCE_NAME:-}" && -n "${GATEWAY_PORT:-}" ]]; then
  cat > /home/node/.openclaw/workspace/CLAUDE.md << EOF
# Instance: ${INSTANCE_NAME}

## Your External URLs
- **Dashboard**: http://127.0.0.1:${GATEWAY_PORT}
- **Terminal**: http://127.0.0.1:${TERMINAL_PORT}

## Live Browser View (noVNC)

There are two URLs for the live browser view — **always prefer the public one** so the
user can open it from any device (phone, another computer, any network):

| | URL |
|---|---|
| **Public (any network)** | \`cat ~/.openclaw/workspace/.vnc-tunnel-url\` |
| Local (same Mac only) | http://127.0.0.1:${VNC_PORT}/vnc.html?autoconnect=1 |

The public URL is a Cloudflare tunnel that starts automatically with the container.
Run the \`cat\` command above to get the current URL — it takes ~15 seconds after
startup and changes on every container restart.

## Human-in-the-Loop Browser Protocol

When you hit something in the browser that requires human interaction,
**do not guess, skip, or brute-force it**. Use this protocol:

1. **Stop** the current browser action immediately.
2. **Get the public VNC URL**: run \`cat ~/.openclaw/workspace/.vnc-tunnel-url\`
3. **Send a Telegram message** to the user:
   - What you were trying to do
   - What is blocking you (CAPTCHA, 2FA, login wall, etc.)
   - The public noVNC URL from step 2
   - Ask them to complete the action and reply when done
4. **Wait** for the user's reply before resuming. Do not poll or retry.

### Trigger this protocol when you encounter:
- CAPTCHA or bot-detection challenges
- Two-factor authentication (2FA / OTP codes / SMS verification)
- Login walls where you don't have credentials
- "Verify you're human" or image selection challenges
- Any step where you've failed 2 times in a row
- Anything that legally or ethically requires explicit human confirmation

### Example Telegram message:
> I need your help with the browser.
> **What I was doing**: logging into X to post the update
> **What's blocking me**: 2FA code required
> **Open the live view**: https://example-abc-def.trycloudflare.com/vnc.html?autoconnect=1
> Please enter the code and reply "done" when finished.
EOF
fi

# --- Gateway ---
rm -rf /tmp/openclaw-*/gateway.*.lock
exec node dist/index.js gateway --bind lan --port 18789 --allow-unconfigured
