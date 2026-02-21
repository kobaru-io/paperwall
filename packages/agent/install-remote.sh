#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Paperwall Agent — remote installer
# Usage: curl -fsSL https://raw.githubusercontent.com/kobaru-io/paperwall/main/packages/agent/install-remote.sh | bash
# Usage: curl -fsSL ... | bash -s v0.1.0   (pinned version)

REPO="kobaru-io/paperwall"
VERSION="${1:-main}"
INSTALL_DIR="${PAPERWALL_INSTALL_DIR:-$HOME/.paperwall/src}"
TMPDIR_WORK=""

# -- Cleanup trap ---

cleanup() {
  if [[ -n "$TMPDIR_WORK" && -d "$TMPDIR_WORK" ]]; then
    rm -rf "$TMPDIR_WORK"
  fi
}
trap cleanup EXIT ERR INT TERM

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
echo "  Remote installer — https://github.com/$REPO"
if [[ "$VERSION" != "main" ]]; then
  echo "  Version: $VERSION"
fi
echo ''

# -- Check core dependencies ---

if ! command -v curl &>/dev/null; then
  echo "Error: 'curl' is required but not found." >&2
  echo "curl is usually pre-installed on macOS/Linux." >&2
  exit 1
fi

# -- npm fast-path option ---

if command -v npm &>/dev/null; then
  echo "Detected npm on your system. You have two install options:"
  echo ""
  echo "  A) npm install -g @kobaru/paperwall"
  echo "     Quick install of the CLI binary. Skips wallet setup and AI client integration."
  echo ""
  echo "  B) Full source install (git clone + build)"
  echo "     Includes guided wallet creation, budget config, and AI client integration."
  echo ""
  read -r -p "Choose [A/b]: " choice
  choice="${choice:-A}"

  if [[ "${choice,,}" == "a" ]]; then
    echo "==> Installing via npm..."
    if [[ "$VERSION" != "main" ]]; then
      npm install -g "@kobaru/paperwall@$VERSION"
    else
      npm install -g @kobaru/paperwall
    fi
    echo ""
    echo "Done! Run 'paperwall --help' to get started."
    exit 0
  fi

  echo ""
  echo "==> Continuing with full source install..."
  echo ""
fi

# -- Check build dependencies ---

MISSING=false

for cmd in node npm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' is required but not found." >&2
    MISSING=true
  fi
done

if [[ "$MISSING" == "true" ]]; then
  echo "" >&2
  echo "Install Node.js 18+ (includes npm): https://nodejs.org/" >&2
  exit 1
fi

NODE_MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "Error: Node.js 18+ is required (found $(node --version))." >&2
  echo "Update from https://nodejs.org/" >&2
  exit 1
fi

# -- Build tarball URL ---

if [[ "$VERSION" == "main" ]]; then
  TARBALL_URL="https://github.com/$REPO/archive/refs/heads/main.tar.gz"
  STRIP_PREFIX="paperwall-main"
else
  TARBALL_URL="https://github.com/$REPO/archive/refs/tags/$VERSION.tar.gz"
  # GitHub strips the leading 'v' from the directory name inside the tarball
  STRIP_PREFIX="paperwall-${VERSION#v}"
fi

# -- Download agent source ---

if [[ -d "$INSTALL_DIR" && -f "$INSTALL_DIR/package.json" ]]; then
  echo "==> Updating paperwall in $INSTALL_DIR..."
else
  echo "==> Downloading paperwall to $INSTALL_DIR..."
fi

TMPDIR_WORK="$(mktemp -d)"
mkdir -p "$INSTALL_DIR"
curl -fsSL "$TARBALL_URL" -o "$TMPDIR_WORK/paperwall.tar.gz"
tar xzf "$TMPDIR_WORK/paperwall.tar.gz" --strip-components=2 -C "$INSTALL_DIR" "$STRIP_PREFIX/packages/agent"

# -- Install dependencies ---

echo "==> Installing dependencies..."
npm install --prefix "$INSTALL_DIR" 2>&1 | tail -1

# -- Idempotent PATH update for ~/.local/bin ---

BIN_DIR="$HOME/.local/bin"
PATH_EXPORT="export PATH=\"\$HOME/.local/bin:\$PATH\""

ensure_path_in_rc() {
  local rc_file="$1"
  if [[ -f "$rc_file" ]]; then
    if ! grep -qF '.local/bin' "$rc_file"; then
      echo "" >> "$rc_file"
      echo "# Added by paperwall installer" >> "$rc_file"
      echo "$PATH_EXPORT" >> "$rc_file"
      echo "==> Added ~/.local/bin to PATH in $rc_file"
    fi
  fi
}

mkdir -p "$BIN_DIR"
ensure_path_in_rc "$HOME/.bashrc"
ensure_path_in_rc "$HOME/.zshrc"

# -- Delegate to the local install script ---

exec bash "$INSTALL_DIR/install.sh"
