#!/usr/bin/env bash
set -euo pipefail

# Paperwall Agent — remote installer
# Usage: curl -fsSL https://raw.githubusercontent.com/kobaru-io/paperwall/main/packages/agent/install-remote.sh | bash

REPO="kobaru-io/paperwall"
BRANCH="main"
INSTALL_DIR="${PAPERWALL_INSTALL_DIR:-$HOME/.paperwall/src}"
TARBALL_URL="https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz"

# -- Reopen stdin from terminal (needed when piped from curl) ---

if [ ! -t 0 ]; then
  exec < /dev/tty
fi

# -- Banner ---

echo ''
echo '                                                ____'
echo '    ____  ____ _____  ___  ______      ______ _/ / /'
echo '   / __ \/ __ `/ __ \/ _ \/ ___/ | /| / / __ `/ / / '
echo '  / /_/ / /_/ / /_/ /  __/ /   | |/ |/ / /_/ / / /  '
echo ' / .___/\__,_/ .___/\___/_/    |__/|__/\__,_/_/_/   '
echo '/_/         /_/                                     '
echo ''
echo '  Remote installer — https://github.com/kobaru-io/paperwall'
echo ''

# -- Check dependencies ---

MISSING=false

for cmd in node npm curl; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' is required but not found." >&2
    MISSING=true
  fi
done

if [[ "$MISSING" == "true" ]]; then
  echo "" >&2
  echo "Install Node.js 18+ (includes npm): https://nodejs.org/" >&2
  echo "curl is usually pre-installed on macOS/Linux." >&2
  exit 1
fi

NODE_MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "Error: Node.js 18+ is required (found $(node --version))." >&2
  echo "Update from https://nodejs.org/" >&2
  exit 1
fi

# -- Download agent source ---

if [[ -d "$INSTALL_DIR" && -f "$INSTALL_DIR/package.json" ]]; then
  echo "==> Updating paperwall in $INSTALL_DIR..."
else
  echo "==> Downloading paperwall to $INSTALL_DIR..."
fi

mkdir -p "$INSTALL_DIR"
curl -fsSL "$TARBALL_URL" \
  | tar xz --strip-components=2 -C "$INSTALL_DIR" "paperwall-$BRANCH/packages/agent"

# -- Install dependencies ---

echo "==> Installing dependencies..."
npm install --prefix "$INSTALL_DIR" 2>&1 | tail -1

# -- Delegate to the local install script ---

exec bash "$INSTALL_DIR/install.sh"
