#!/usr/bin/env bash
set -euo pipefail

# Install Paperwall Agent: CLI + integration (MCP or skill) + wallet configuration.
# Usage (from source): bash packages/agent/install.sh
# Usage (one-liner):   curl -fsSL https://raw.githubusercontent.com/kobaru-io/paperwall/main/packages/agent/install-remote.sh | bash

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

# -- Step 0: Check dependencies ---

MISSING_REQUIRED=false

for cmd in node npm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: '$cmd' is required but not found." >&2
    MISSING_REQUIRED=true
  fi
done

if [[ "$MISSING_REQUIRED" == "true" ]]; then
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

if ! command -v jq &>/dev/null; then
  echo "Note: 'jq' not found — MCP configs will be written fresh, but cannot"
  echo "merge into existing config files. Install jq for automatic merging:"
  echo "  brew install jq      # macOS"
  echo "  sudo apt install jq  # Debian/Ubuntu"
  echo "  sudo dnf install jq  # Fedora"
  echo "  sudo pacman -S jq    # Arch"
  echo ""
fi

# -- Step 1: Build & install paperwall CLI ---

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

# -- Step 2: Choose AI client ---

INTEGRATION_DESC=""

_write_mcp_config() {
  local dest="$1"
  mkdir -p "$(dirname "$dest")"

  if [[ -f "$dest" ]] && command -v jq &>/dev/null; then
    # Merge into existing file — jq --arg safely escapes the path
    local tmp
    tmp="$(mktemp)"
    jq --arg path "$CLI_TARGET" \
      '.mcpServers.paperwall = {"type":"stdio","command":"node","args":[$path,"mcp"]}' \
      "$dest" > "$tmp" && mv "$tmp" "$dest"
    echo "Updated existing MCP config: $dest"
  elif [[ -f "$dest" ]]; then
    # File exists but jq unavailable — print instructions
    echo "Warning: jq not found — cannot auto-merge into existing $dest" >&2
    echo "Add this entry manually under 'mcpServers' in $dest:" >&2
    echo ""
    echo '    "paperwall": {'
    echo "      \"type\": \"stdio\","
    echo "      \"command\": \"node\","
    echo "      \"args\": [\"$CLI_TARGET\", \"mcp\"]"
    echo '    }'
  else
    # New file
    cat > "$dest" <<JSON
{
  "mcpServers": {
    "paperwall": {
      "type": "stdio",
      "command": "node",
      "args": ["$CLI_TARGET", "mcp"]
    }
  }
}
JSON
    echo "MCP config written: $dest"
  fi
}

_write_codex_config() {
  local dest="$HOME/.codex/config.toml"
  mkdir -p "$(dirname "$dest")"

  if [[ -f "$dest" ]] && grep -q '\[mcp_servers\.paperwall\]' "$dest"; then
    echo "Codex config already contains paperwall — skipping."
    echo "Config file: $dest"
  elif [[ -f "$dest" ]]; then
    cat >> "$dest" <<TOML

[mcp_servers.paperwall]
command = "node"
args = ["$CLI_TARGET", "mcp"]
TOML
    echo "Updated Codex config: $dest"
  else
    cat > "$dest" <<TOML
[mcp_servers.paperwall]
command = "node"
args = ["$CLI_TARGET", "mcp"]
TOML
    echo "Codex config written: $dest"
  fi
}

_write_opencode_config() {
  local dest="$HOME/.config/opencode/opencode.json"
  mkdir -p "$(dirname "$dest")"

  if [[ -f "$dest" ]] && command -v jq &>/dev/null; then
    local tmp
    tmp="$(mktemp)"
    jq --arg path "$CLI_TARGET" \
      '.mcp.paperwall = {"type":"local","command":["node",$path,"mcp"]}' \
      "$dest" > "$tmp" && mv "$tmp" "$dest"
    echo "Updated OpenCode config: $dest"
  elif [[ -f "$dest" ]]; then
    echo "Warning: jq not found — cannot auto-merge into existing $dest" >&2
    echo "Add this entry manually under 'mcp' in $dest:" >&2
    echo ""
    echo '    "paperwall": {'
    echo '      "type": "local",'
    echo "      \"command\": [\"node\", \"$CLI_TARGET\", \"mcp\"]"
    echo '    }'
  else
    cat > "$dest" <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "mcp": {
    "paperwall": {
      "type": "local",
      "command": ["node", "$CLI_TARGET", "mcp"]
    }
  }
}
JSON
    echo "OpenCode config written: $dest"
  fi
}

_write_instructions_block() {
  local dest="$1"
  local label="$2"  # e.g. "GEMINI.md", "CLAUDE.md", "AGENTS.md"
  mkdir -p "$(dirname "$dest")"

  local start_marker="<!-- paperwall-start -->"
  local end_marker="<!-- paperwall-end -->"

  local block
  block="$(cat <<'BLOCK'
<!-- paperwall-start -->
## Paperwall

When asked to fetch, read, or access a URL, use Paperwall's `fetch_url` MCP tool instead of any built-in web fetch. Paperwall handles paywalled content by automatically detecting and paying micropayments (USDC on SKALE network). Use Paperwall's `set_budget` tool to manage spending limits.
<!-- paperwall-end -->
BLOCK
)"

  if [[ -f "$dest" ]] && grep -qF "$start_marker" "$dest"; then
    # Replace existing block between markers
    local tmp
    tmp="$(mktemp)"
    awk -v block="$block" '
      /<!-- paperwall-start -->/ { printing=0; print block; next }
      /<!-- paperwall-end -->/ { printing=1; next }
      printing!=0 { print }
      BEGIN { printing=1 }
    ' "$dest" > "$tmp" && mv "$tmp" "$dest"
    echo "Updated Paperwall instructions in $label: $dest"
  else
    # Append new block
    printf '\n%s\n' "$block" >> "$dest"
    echo "Added Paperwall instructions to $label: $dest"
  fi
}

_write_gemini_md() {
  _write_instructions_block "$HOME/.gemini/GEMINI.md" "GEMINI.md"
}

_write_claude_md() {
  _write_instructions_block "$HOME/.claude/CLAUDE.md" "CLAUDE.md"
}

_write_codex_agents_md() {
  _write_instructions_block "$HOME/.codex/AGENTS.md" "AGENTS.md"
}

_install_skill() {
  local dest_dir="$1"
  local product="$2"

  if [[ ! -f "$SKILL_SRC/SKILL.md" ]]; then
    echo "Error: SKILL.md not found at $SKILL_SRC/SKILL.md" >&2
    exit 1
  fi

  local dest="$dest_dir/paperwall"
  mkdir -p "$dest_dir"

  if [[ -L "$dest" ]]; then
    echo "Removing existing symlink at $dest"
    rm "$dest"
  elif [[ -e "$dest" ]]; then
    echo "Error: $dest already exists and is not a symlink. Remove it manually." >&2
    exit 1
  fi

  ln -s "$SKILL_SRC" "$dest"
  echo "Skill installed for $product: $dest"
  INTEGRATION_DESC="Skill: $dest ($product)"
}

echo ""
echo "============================================"
echo " Choose your AI client"
echo "============================================"
echo ""
echo "  MCP server (recommended — native tools + live resources):"
echo "   1) Claude Code     → ~/.claude/mcp.json"
echo "   2) Cursor          → ~/.cursor/mcp.json"
echo "   3) Windsurf        → ~/.codeium/windsurf/mcp_config.json"
echo "   4) Codex           → ~/.codex/config.toml"
echo "   5) OpenCode        → ~/.config/opencode/opencode.json"
echo "   6) Claude Desktop  → platform config directory"
echo "   7) Gemini CLI      → ~/.gemini/settings.json"
echo "   8) Antigravity     → ~/.gemini/antigravity/mcp_config.json"
echo ""
echo "  Agent skill (CLI-based — AI shells out to paperwall):"
echo "   9) Gemini CLI      → ~/.gemini/skills/"
echo "  10) Claude Code     → ~/.claude/skills/"
echo ""
echo "  11) Other           → print MCP config to copy-paste"
echo ""
read -rp "Choose [1-11]: " CLIENT_CHOICE

case "$CLIENT_CHOICE" in
  1)
    _write_mcp_config "$HOME/.claude/mcp.json"
    _write_claude_md
    INTEGRATION_DESC="MCP: ~/.claude/mcp.json (Claude Code)"
    ;;
  2)
    _write_mcp_config "$HOME/.cursor/mcp.json"
    INTEGRATION_DESC="MCP: ~/.cursor/mcp.json (Cursor)"
    ;;
  3)
    _write_mcp_config "$HOME/.codeium/windsurf/mcp_config.json"
    INTEGRATION_DESC="MCP: ~/.codeium/windsurf/mcp_config.json (Windsurf)"
    ;;
  4)
    _write_codex_config
    _write_codex_agents_md
    INTEGRATION_DESC="MCP: ~/.codex/config.toml (Codex)"
    ;;
  5)
    _write_opencode_config
    INTEGRATION_DESC="MCP: ~/.config/opencode/opencode.json (OpenCode)"
    ;;
  6)
    if [[ "$(uname)" == "Darwin" ]]; then
      _write_mcp_config "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
      INTEGRATION_DESC="MCP: Claude Desktop config"
    else
      _write_mcp_config "$HOME/.config/Claude/claude_desktop_config.json"
      INTEGRATION_DESC="MCP: ~/.config/Claude/claude_desktop_config.json (Claude Desktop)"
    fi
    echo "Restart Claude Desktop to pick up the new MCP server."
    ;;
  7)
    _write_mcp_config "$HOME/.gemini/settings.json"
    _write_gemini_md
    INTEGRATION_DESC="MCP: ~/.gemini/settings.json (Gemini CLI)"
    ;;
  8)
    _write_mcp_config "$HOME/.gemini/antigravity/mcp_config.json"
    _write_gemini_md
    INTEGRATION_DESC="MCP: ~/.gemini/antigravity/mcp_config.json (Antigravity)"
    ;;
  9)
    _install_skill "$HOME/.gemini/skills" "Gemini CLI"
    ;;
  10)
    _install_skill "$HOME/.claude/skills" "Claude Code"
    ;;
  11)
    echo ""
    echo "Add this to your MCP client's configuration:"
    echo ""
    cat <<JSON
{
  "mcpServers": {
    "paperwall": {
      "type": "stdio",
      "command": "node",
      "args": ["$CLI_TARGET", "mcp"]
    }
  }
}
JSON
    INTEGRATION_DESC="MCP: manual configuration"
    ;;
  *)
    echo "Error: Unknown choice '$CLIENT_CHOICE'." >&2
    exit 1
    ;;
esac

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
echo "  Mode:  $INTEGRATION_DESC"
echo ""
echo "Try it out:"
echo "  paperwall wallet balance"
echo "  paperwall fetch <url> --max-price 0.05"
if [[ "$INTEGRATION_DESC" == MCP:* ]]; then
  echo "  paperwall mcp              # start MCP server (used by AI clients)"
fi
