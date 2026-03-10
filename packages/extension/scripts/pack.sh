#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$EXT_DIR/../.." && pwd)"
RELEASES_DIR="$EXT_DIR/releases"

mkdir -p "$RELEASES_DIR"

# Chrome/Edge zip
echo "Packaging Chrome/Edge..."
rm -f "$RELEASES_DIR/paperwall-chrome.zip"
(cd "$EXT_DIR/dist-chrome" && zip -r "$RELEASES_DIR/paperwall-chrome.zip" .)
echo "  → releases/paperwall-chrome.zip"

# Firefox xpi
echo "Packaging Firefox..."
rm -f "$RELEASES_DIR/paperwall-firefox.xpi"
(cd "$EXT_DIR/dist-firefox" && zip -r "$RELEASES_DIR/paperwall-firefox.xpi" .)
echo "  → releases/paperwall-firefox.xpi"

# AMO source zip
echo "Packaging source..."
rm -f "$RELEASES_DIR/paperwall-source.zip"
(cd "$REPO_DIR" && zip -r "$RELEASES_DIR/paperwall-source.zip" \
  packages/extension/src/ \
  packages/extension/icons/ \
  packages/extension/__tests__/ \
  packages/extension/manifest.json \
  packages/extension/build.ts \
  packages/extension/package.json \
  packages/extension/tsconfig.json \
  packages/extension/BUILD.md \
  package.json \
  package-lock.json \
  --exclude "*/node_modules/*" \
  --exclude "*/.git/*")
echo "  → releases/paperwall-source.zip"

echo ""
echo "Done. Files in packages/extension/releases/:"
ls -lh "$RELEASES_DIR"
