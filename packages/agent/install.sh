#!/usr/bin/env bash
set -euo pipefail

# Install Paperwall Agent: CLI + skill + wallet configuration.
# Usage: bash packages/agent/install.sh [gemini|claude]

echo ''
echo '                                                ____'
echo '    ____  ____ _____  ___  ______      ______ _/ / /'
echo '   / __ \/ __ `/ __ \/ _ \/ ___/ | /| / / __ `/ / / '
echo '  / /_/ / /_/ / /_/ /  __/ /   | |/ |/ / /_/ / / /  '
echo ' / .___/\__,_/ .___/\___/_/    |__/|__/\__,_/_/_/   '
echo '/_/         /_/                                     '
echo ''

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$SCRIPT_DIR"
SKILL_SRC="$AGENT_DIR/skills/paperwall"

if [[ ! -f "$SKILL_SRC/SKILL.md" ]]; then
  echo "Error: SKILL.md not found at $SKILL_SRC/SKILL.md" >&2
  exit 1
fi

# -- Step 1: Install paperwall CLI ---

echo "==> Building paperwall..."
npm run --prefix "$AGENT_DIR" build

BIN_DIR="$HOME/.local/bin"
CLI_TARGET="$AGENT_DIR/dist/cli.js"

echo "==> Installing paperwall to $BIN_DIR..."
mkdir -p "$BIN_DIR"
ln -sf "$CLI_TARGET" "$BIN_DIR/paperwall"
chmod +x "$CLI_TARGET"

if ! command -v paperwall &>/dev/null; then
  echo "Warning: paperwall not found on PATH." >&2
  echo "Add ~/.local/bin to your PATH:" >&2
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\"" >&2
  echo "To make it permanent, add that line to your ~/.bashrc or ~/.zshrc" >&2
fi

# -- Step 2: Install Agent Skill ---

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo ""
  echo "Install Paperwall Agent skill for:"
  echo "  1) gemini  - Gemini CLI (.gemini/skills/)"
  echo "  2) claude  - Claude Code (.claude/skills/)"
  read -rp "Choose [gemini/claude]: " TARGET
fi

case "$TARGET" in
  gemini|1)
    DEST_DIR="$HOME/.gemini/skills"
    PRODUCT="Gemini CLI"
    ;;
  claude|2)
    DEST_DIR="$HOME/.claude/skills"
    PRODUCT="Claude Code"
    ;;
  *)
    echo "Error: Unknown target '$TARGET'. Use 'gemini' or 'claude'." >&2
    exit 1
    ;;
esac

DEST="$DEST_DIR/paperwall"

mkdir -p "$DEST_DIR"

if [[ -L "$DEST" ]]; then
  echo "Removing existing symlink at $DEST"
  rm "$DEST"
elif [[ -e "$DEST" ]]; then
  echo "Error: $DEST already exists and is not a symlink. Remove it manually." >&2
  exit 1
fi

ln -s "$SKILL_SRC" "$DEST"

echo "Skill installed for $PRODUCT: $DEST"

# -- Step 3: Wallet configuration ---

WALLET_FILE="$HOME/.paperwall/wallet.json"

if [[ -f "$WALLET_FILE" ]]; then
  echo ""
  echo "Wallet already configured at $WALLET_FILE — skipping setup."
else
  echo ""
  echo "============================================"
  echo " Wallet Setup"
  echo "============================================"
  echo ""
  echo "A wallet is required to make micropayments."
  echo ""
  echo "  1) Create new wallet (Recommended)"
  echo "     Generates a fresh private key dedicated to micropayments."
  echo ""
  echo "  2) Import existing private key"
  echo "     Use a key you already have (e.g. from another machine)."
  echo ""
  echo "  3) Skip — configure later"
  echo ""
  read -rp "Choose [1/2/3]: " WALLET_CHOICE

  case "$WALLET_CHOICE" in
    create|1)
      echo ""
      paperwall wallet create
      echo ""
      echo "--------------------------------------------"
      echo " How your key is stored"
      echo "--------------------------------------------"
      echo "  File:       $WALLET_FILE (permissions: 0600)"
      echo "  Encryption: AES-256-GCM with PBKDF2 (600k iterations)"
      echo "  Key source: Derived from this machine's hostname + user ID"
      echo ""
      echo "  This means:"
      echo "  - The wallet auto-decrypts on THIS machine, for THIS user"
      echo "  - If the file is copied to another machine, it CANNOT be decrypted"
      echo "  - If your hostname changes, re-create the wallet"
      echo ""
      echo "Fund it with USDC on SKALE network:"
      echo "  paperwall wallet address   # get your address"
      echo "  paperwall wallet balance   # check balance"
      ;;
    import|2)
      echo ""
      echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
      echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
      echo "!!                                                      !!"
      echo "!!   WARNING: NEVER import your main wallet key here!   !!"
      echo "!!                                                      !!"
      echo "!!   This agent makes AUTOMATED payments on your        !!"
      echo "!!   behalf — AI assistants can trigger transactions    !!"
      echo "!!   without manual approval.                           !!"
      echo "!!                                                      !!"
      echo "!!   ALWAYS use a DEDICATED wallet for micropayments.   !!"
      echo "!!   Fund it with ONLY the amount you're willing to     !!"
      echo "!!   spend (e.g. \$5-\$50 USDC).                         !!"
      echo "!!                                                      !!"
      echo "!!   If you don't have a dedicated wallet, choose       !!"
      echo "!!   option 1 (Create new wallet) instead.              !!"
      echo "!!                                                      !!"
      echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
      echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
      echo ""
      read -rp "I understand the risks. Continue? [y/N]: " IMPORT_CONFIRM
      if [[ "$IMPORT_CONFIRM" != "y" && "$IMPORT_CONFIRM" != "Y" ]]; then
        echo "Import cancelled."
        echo "You can import later with: paperwall wallet import --key 0x<key>"
        echo "Or create a new wallet with: paperwall wallet create"
      else
        echo ""
        read -rp "Enter private key (0x-prefixed hex): " IMPORT_KEY
        echo ""
        paperwall wallet import --key "$IMPORT_KEY"
        echo ""
        echo "--------------------------------------------"
        echo " How your key is stored"
        echo "--------------------------------------------"
        echo "  File:       $WALLET_FILE (permissions: 0600)"
        echo "  Encryption: AES-256-GCM with PBKDF2 (600k iterations)"
        echo "  Key source: Derived from this machine's hostname + user ID"
        echo ""
        echo "  This means:"
        echo "  - The wallet auto-decrypts on THIS machine, for THIS user"
        echo "  - If the file is copied to another machine, it CANNOT be decrypted"
        echo "  - The original private key is NOT stored in plaintext anywhere"
        echo ""
        echo "Check your balance:"
        echo "  paperwall wallet balance"
      fi
      ;;
    skip|3)
      echo ""
      echo "Skipped wallet setup. Before using the agent, either:"
      echo "  - Create a wallet:   paperwall wallet create"
      echo "  - Import a key:      paperwall wallet import --key 0x<key>"
      echo "  - Or set env var:    export PAPERWALL_PRIVATE_KEY=0x<key>"
      ;;
    *)
      echo "Unknown choice '$WALLET_CHOICE' — skipping wallet setup."
      ;;
  esac
fi

# -- Step 4: Budget configuration ---

echo ""
echo "Set a spending budget? (recommended)"
echo "  1) yes   - Set per-request, daily, and total limits"
echo "  2) skip  - Configure later (paperwall budget set)"
read -rp "Choose [yes/skip]: " BUDGET_CHOICE

case "$BUDGET_CHOICE" in
  yes|1)
    read -rp "Max USDC per request (e.g. 0.10): " PER_REQ
    read -rp "Max USDC per day    (e.g. 1.00): " DAILY
    read -rp "Max USDC total      (e.g. 10.00): " TOTAL

    BUDGET_ARGS=""
    [[ -n "${PER_REQ:-}" ]] && BUDGET_ARGS="$BUDGET_ARGS --per-request $PER_REQ"
    [[ -n "${DAILY:-}" ]]   && BUDGET_ARGS="$BUDGET_ARGS --daily $DAILY"
    [[ -n "${TOTAL:-}" ]]   && BUDGET_ARGS="$BUDGET_ARGS --total $TOTAL"

    if [[ -n "$BUDGET_ARGS" ]]; then
      # shellcheck disable=SC2086
      paperwall budget set $BUDGET_ARGS
      echo "Budget configured."
    else
      echo "No limits provided — skipping."
    fi
    ;;
  *)
    echo "Skipped budget setup. Set limits later: paperwall budget set --per-request 0.10 --daily 1.00 --total 10.00"
    ;;
esac

# -- Done ---

echo ""
echo "============================================"
echo " Paperwall Agent installed!"
echo "============================================"
echo "  CLI:   $(command -v paperwall 2>/dev/null || echo 'paperwall (check PATH)')"
echo "  Skill: $DEST"
echo ""
echo "Try it out:"
echo "  paperwall wallet balance"
echo "  paperwall fetch <url> --max-price 0.05"
