#!/usr/bin/env bash
set -euo pipefail

# Remove stale gateway lock files from previous crashes
rm -rf /tmp/openclaw-*/gateway.*.lock

exec node dist/index.js gateway --bind lan --port 18789 --allow-unconfigured
