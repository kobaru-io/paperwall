#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Install Paperwall Agent: CLI + integration (MCP or skill) + wallet configuration.
# Usage (from source): pwsh packages/agent/install.ps1
# Usage (one-liner):   irm https://raw.githubusercontent.com/kobaru-io/paperwall/main/packages/agent/install-remote.ps1 | iex

Write-Host ''
Write-Host '                                                ____'
Write-Host '    ____  ____ _____  ___  ______      ______ _/ / /'
Write-Host '   / __ \/ __ `/ __ \/ _ \/ ___/ | /| / / __ `/ / / '
Write-Host '  / /_/ / /_/ / /_/ /  __/ /   | |/ |/ / /_/ / / /  '
Write-Host ' / .___/\__,_/ .___/\___/_/    |__/|__/\__,_/_/_/   '
Write-Host '/_/         /_/                                     '
Write-Host ''

$AgentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SkillSrc = Join-Path $AgentDir 'skills' 'paperwall'

# -- Step 0: Check dependencies ---

$MissingRequired = $false

foreach ($cmd in @('node', 'npm')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "'$cmd' is required but not found."
        $MissingRequired = $true
    }
}

if ($MissingRequired) {
    Write-Host ''
    Write-Error 'Install Node.js 18+ (includes npm): https://nodejs.org/'
    exit 1
}

$NodeMajor = [int](node -e 'console.log(process.versions.node.split(".")[0])')
if ($NodeMajor -lt 18) {
    $NodeVersion = node --version
    Write-Error "Node.js 18+ is required (found $NodeVersion). Update from https://nodejs.org/"
    exit 1
}

# -- Step 1: Build & install paperwall CLI ---

Write-Host '==> Building paperwall...'
npm run --prefix $AgentDir build
if ($LASTEXITCODE -ne 0) { exit 1 }

$BinDir = Join-Path $env:USERPROFILE '.local' 'bin'
$CliTarget = Join-Path $AgentDir 'dist' 'cli.js'

Write-Host "==> Installing paperwall to $BinDir..."
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
}

$CmdWrapper = Join-Path $BinDir 'paperwall.cmd'
Set-Content -Path $CmdWrapper -Value "@node `"$CliTarget`" %*" -Encoding ASCII

if (-not (Get-Command paperwall -ErrorAction SilentlyContinue)) {
    Write-Warning 'paperwall not found on PATH.'
    Write-Warning "Add $BinDir to your PATH:"
    Write-Warning '  [Environment]::SetEnvironmentVariable("PATH", "$env:USERPROFILE\.local\bin;$env:PATH", "User")'
    Write-Warning 'Then restart your terminal.'
}

# -- Step 2: Choose AI client ---

$IntegrationDesc = ''

function Write-McpConfig {
    param([string]$Dest)

    $DestDir = Split-Path -Parent $Dest
    if (-not (Test-Path $DestDir)) {
        New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    }

    $McpEntry = [ordered]@{
        type    = 'stdio'
        command = 'node'
        args    = @($CliTarget, 'mcp')
    }

    if (Test-Path $Dest) {
        # Merge into existing file
        $Config = Get-Content -Raw $Dest | ConvertFrom-Json
        if (-not $Config.mcpServers) {
            $Config | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue ([PSCustomObject]@{}) -Force
        }
        $Config.mcpServers | Add-Member -NotePropertyName 'paperwall' -NotePropertyValue ([PSCustomObject]$McpEntry) -Force
        $Config | ConvertTo-Json -Depth 10 | Set-Content -Path $Dest -Encoding UTF8
        Write-Host "Updated existing MCP config: $Dest"
    }
    else {
        $Config = [ordered]@{
            mcpServers = [ordered]@{
                paperwall = $McpEntry
            }
        }
        $Config | ConvertTo-Json -Depth 10 | Set-Content -Path $Dest -Encoding UTF8
        Write-Host "MCP config written: $Dest"
    }
}

function Write-CodexConfig {
    $Dest = Join-Path $env:USERPROFILE '.codex' 'config.toml'
    $DestDir = Split-Path -Parent $Dest
    if (-not (Test-Path $DestDir)) {
        New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    }

    $TomlBlock = @"

[mcp_servers.paperwall]
command = "node"
args = ["$CliTarget", "mcp"]
"@

    if (Test-Path $Dest) {
        $Content = Get-Content -Raw $Dest
        if ($Content -match '\[mcp_servers\.paperwall\]') {
            Write-Host 'Codex config already contains paperwall — skipping.'
            Write-Host "Config file: $Dest"
        }
        else {
            Add-Content -Path $Dest -Value $TomlBlock -Encoding UTF8
            Write-Host "Updated Codex config: $Dest"
        }
    }
    else {
        # New file — no leading blank line
        Set-Content -Path $Dest -Value $TomlBlock.TrimStart() -Encoding UTF8
        Write-Host "Codex config written: $Dest"
    }
}

function Write-OpenCodeConfig {
    $Dest = Join-Path $env:USERPROFILE '.config' 'opencode' 'opencode.json'
    $DestDir = Split-Path -Parent $Dest
    if (-not (Test-Path $DestDir)) {
        New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    }

    $McpEntry = [ordered]@{
        type    = 'local'
        command = @('node', $CliTarget, 'mcp')
    }

    if (Test-Path $Dest) {
        $Config = Get-Content -Raw $Dest | ConvertFrom-Json
        if (-not $Config.mcp) {
            $Config | Add-Member -NotePropertyName 'mcp' -NotePropertyValue ([PSCustomObject]@{}) -Force
        }
        $Config.mcp | Add-Member -NotePropertyName 'paperwall' -NotePropertyValue ([PSCustomObject]$McpEntry) -Force
        $Config | ConvertTo-Json -Depth 10 | Set-Content -Path $Dest -Encoding UTF8
        Write-Host "Updated OpenCode config: $Dest"
    }
    else {
        $Config = [ordered]@{
            '$schema' = 'https://opencode.ai/config.json'
            mcp       = [ordered]@{
                paperwall = $McpEntry
            }
        }
        $Config | ConvertTo-Json -Depth 10 | Set-Content -Path $Dest -Encoding UTF8
        Write-Host "OpenCode config written: $Dest"
    }
}

function Write-GeminiMd {
    $Dest = Join-Path $env:USERPROFILE '.gemini' 'GEMINI.md'
    $DestDir = Split-Path -Parent $Dest
    if (-not (Test-Path $DestDir)) {
        New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    }

    $Marker = '## Paperwall'
    if ((Test-Path $Dest) -and (Get-Content -Raw $Dest).Contains($Marker)) {
        Write-Host 'GEMINI.md already contains Paperwall instructions — skipping.'
        return
    }

    $Snippet = @'

## Paperwall

When asked to fetch, read, or access a URL, use Paperwall's `fetch_url` MCP tool instead of the built-in `web_fetch`. Paperwall handles paywalled content by automatically detecting and paying micropayments (USDC on SKALE network). Use Paperwall's `set_budget` tool to manage spending limits.
'@
    Add-Content -Path $Dest -Value $Snippet -Encoding UTF8
    Write-Host "Appended Paperwall instructions to $Dest"
}

function Write-ClaudeMd {
    $Dest = Join-Path $env:USERPROFILE '.claude' 'CLAUDE.md'
    $DestDir = Split-Path -Parent $Dest
    if (-not (Test-Path $DestDir)) {
        New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    }

    $Marker = '## Paperwall'
    if ((Test-Path $Dest) -and (Get-Content -Raw $Dest).Contains($Marker)) {
        Write-Host 'CLAUDE.md already contains Paperwall instructions — skipping.'
        return
    }

    $Snippet = @'

## Paperwall

When asked to fetch, read, or access a URL that may be paywalled, use Paperwall's `fetch_url` MCP tool. Paperwall handles paywalled content by automatically detecting and paying micropayments (USDC on SKALE network). Use Paperwall's `set_budget` tool to manage spending limits.
'@
    Add-Content -Path $Dest -Value $Snippet -Encoding UTF8
    Write-Host "Appended Paperwall instructions to $Dest"
}

function Write-CodexAgentsMd {
    $Dest = Join-Path $env:USERPROFILE '.codex' 'AGENTS.md'
    $DestDir = Split-Path -Parent $Dest
    if (-not (Test-Path $DestDir)) {
        New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    }

    $Marker = '## Paperwall'
    if ((Test-Path $Dest) -and (Get-Content -Raw $Dest).Contains($Marker)) {
        Write-Host 'AGENTS.md already contains Paperwall instructions — skipping.'
        return
    }

    $Snippet = @'

## Paperwall

When asked to fetch, read, or access a URL that may be paywalled, use Paperwall's `fetch_url` MCP tool. Paperwall handles paywalled content by automatically detecting and paying micropayments (USDC on SKALE network). Use Paperwall's `set_budget` tool to manage spending limits.
'@
    Add-Content -Path $Dest -Value $Snippet -Encoding UTF8
    Write-Host "Appended Paperwall instructions to $Dest"
}

function Install-Skill {
    param(
        [string]$DestDir,
        [string]$Product
    )

    $SkillMd = Join-Path $SkillSrc 'SKILL.md'
    if (-not (Test-Path $SkillMd)) {
        Write-Error "SKILL.md not found at $SkillMd"
        exit 1
    }

    $Dest = Join-Path $DestDir 'paperwall'
    if (-not (Test-Path $DestDir)) {
        New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    }

    if (Test-Path $Dest) {
        $Item = Get-Item $Dest
        if ($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            Write-Host "Removing existing junction at $Dest"
            Remove-Item $Dest -Force
        }
        else {
            Write-Error "$Dest already exists and is not a junction. Remove it manually."
            exit 1
        }
    }

    New-Item -ItemType Junction -Path $Dest -Target $SkillSrc | Out-Null
    Write-Host "Skill installed for ${Product}: $Dest"
    $script:IntegrationDesc = "Skill: $Dest ($Product)"
}

Write-Host ''
Write-Host '============================================'
Write-Host ' Choose your AI client'
Write-Host '============================================'
Write-Host ''
Write-Host '  MCP server (recommended — native tools + live resources):'
Write-Host '   1) Claude Code     → ~/.claude/mcp.json'
Write-Host '   2) Cursor          → ~/.cursor/mcp.json'
Write-Host '   3) Windsurf        → ~/.codeium/windsurf/mcp_config.json'
Write-Host '   4) Codex           → ~/.codex/config.toml'
Write-Host '   5) OpenCode        → ~/.config/opencode/opencode.json'
Write-Host '   6) Claude Desktop  → %APPDATA%\Claude\claude_desktop_config.json'
Write-Host '   7) Gemini CLI      → ~/.gemini/settings.json'
Write-Host '   8) Antigravity     → ~/.gemini/antigravity/mcp_config.json'
Write-Host ''
Write-Host '  Agent skill (CLI-based — AI shells out to paperwall):'
Write-Host '   9) Gemini CLI      → ~/.gemini/skills/'
Write-Host '  10) Claude Code     → ~/.claude/skills/'
Write-Host ''
Write-Host '  11) Other           → print MCP config to copy-paste'
Write-Host ''

$ClientChoice = Read-Host 'Choose [1-11]'

switch ($ClientChoice) {
    '1' {
        Write-McpConfig (Join-Path $env:USERPROFILE '.claude' 'mcp.json')
        Write-ClaudeMd
        $IntegrationDesc = 'MCP: ~/.claude/mcp.json (Claude Code)'
    }
    '2' {
        Write-McpConfig (Join-Path $env:USERPROFILE '.cursor' 'mcp.json')
        $IntegrationDesc = 'MCP: ~/.cursor/mcp.json (Cursor)'
    }
    '3' {
        Write-McpConfig (Join-Path $env:USERPROFILE '.codeium' 'windsurf' 'mcp_config.json')
        $IntegrationDesc = 'MCP: ~/.codeium/windsurf/mcp_config.json (Windsurf)'
    }
    '4' {
        Write-CodexConfig
        Write-CodexAgentsMd
        $IntegrationDesc = 'MCP: ~/.codex/config.toml (Codex)'
    }
    '5' {
        Write-OpenCodeConfig
        $IntegrationDesc = 'MCP: ~/.config/opencode/opencode.json (OpenCode)'
    }
    '6' {
        Write-McpConfig (Join-Path $env:APPDATA 'Claude' 'claude_desktop_config.json')
        $IntegrationDesc = 'MCP: %APPDATA%\Claude\claude_desktop_config.json (Claude Desktop)'
        Write-Host 'Restart Claude Desktop to pick up the new MCP server.'
    }
    '7' {
        Write-McpConfig (Join-Path $env:USERPROFILE '.gemini' 'settings.json')
        Write-GeminiMd
        $IntegrationDesc = 'MCP: ~/.gemini/settings.json (Gemini CLI)'
    }
    '8' {
        Write-McpConfig (Join-Path $env:USERPROFILE '.gemini' 'antigravity' 'mcp_config.json')
        Write-GeminiMd
        $IntegrationDesc = 'MCP: ~/.gemini/antigravity/mcp_config.json (Antigravity)'
    }
    '9' {
        Install-Skill (Join-Path $env:USERPROFILE '.gemini' 'skills') 'Gemini CLI'
    }
    '10' {
        Install-Skill (Join-Path $env:USERPROFILE '.claude' 'skills') 'Claude Code'
    }
    '11' {
        Write-Host ''
        Write-Host 'Add this to your MCP client''s configuration:'
        Write-Host ''
        $ManualConfig = [ordered]@{
            mcpServers = [ordered]@{
                paperwall = [ordered]@{
                    type    = 'stdio'
                    command = 'node'
                    args    = @($CliTarget, 'mcp')
                }
            }
        }
        $ManualConfig | ConvertTo-Json -Depth 10 | Write-Host
        $IntegrationDesc = 'MCP: manual configuration'
    }
    default {
        Write-Error "Unknown choice '$ClientChoice'."
        exit 1
    }
}

# -- Step 3: Wallet configuration ---

$WalletFile = Join-Path $env:USERPROFILE '.paperwall' 'wallet.json'

if (Test-Path $WalletFile) {
    Write-Host ''
    Write-Host "Wallet already configured at $WalletFile — skipping setup."
}
else {
    Write-Host ''
    Write-Host '============================================'
    Write-Host ' Wallet Setup'
    Write-Host '============================================'
    Write-Host ''
    Write-Host 'A wallet is required to make micropayments.'
    Write-Host ''
    Write-Host '  1) Create new wallet (Recommended)'
    Write-Host '     Generates a fresh private key dedicated to micropayments.'
    Write-Host ''
    Write-Host '  2) Import existing private key'
    Write-Host '     Use a key you already have (e.g. from another machine).'
    Write-Host ''
    Write-Host '  3) Skip — configure later'
    Write-Host ''

    $WalletChoice = Read-Host 'Choose [1/2/3]'

    switch ($WalletChoice) {
        { $_ -eq '1' -or $_ -eq 'create' } {
            Write-Host ''
            & paperwall wallet create
            Write-Host ''
            Write-Host '--------------------------------------------'
            Write-Host ' How your key is stored'
            Write-Host '--------------------------------------------'
            Write-Host "  File:       $WalletFile"
            Write-Host '  Encryption: AES-256-GCM with PBKDF2 (600k iterations)'
            Write-Host '  Key source: Derived from this machine''s hostname + user ID'
            Write-Host ''
            Write-Host '  This means:'
            Write-Host '  - The wallet auto-decrypts on THIS machine, for THIS user'
            Write-Host '  - If the file is copied to another machine, it CANNOT be decrypted'
            Write-Host '  - If your hostname changes, re-create the wallet'
            Write-Host ''
            Write-Host 'Fund it with USDC on SKALE network:'
            Write-Host '  paperwall wallet address   # get your address'
            Write-Host '  paperwall wallet balance   # check balance'
        }
        { $_ -eq '2' -or $_ -eq 'import' } {
            Write-Host ''
            Write-Host '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'
            Write-Host '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'
            Write-Host '!!                                                      !!'
            Write-Host '!!   WARNING: NEVER import your main wallet key here!   !!'
            Write-Host '!!                                                      !!'
            Write-Host '!!   This agent makes AUTOMATED payments on your        !!'
            Write-Host '!!   behalf — AI assistants can trigger transactions    !!'
            Write-Host '!!   without manual approval.                           !!'
            Write-Host '!!                                                      !!'
            Write-Host '!!   ALWAYS use a DEDICATED wallet for micropayments.   !!'
            Write-Host '!!   Fund it with ONLY the amount you''re willing to     !!'
            Write-Host '!!   spend (e.g. $5-$50 USDC).                         !!'
            Write-Host '!!                                                      !!'
            Write-Host '!!   If you don''t have a dedicated wallet, choose       !!'
            Write-Host '!!   option 1 (Create new wallet) instead.              !!'
            Write-Host '!!                                                      !!'
            Write-Host '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'
            Write-Host '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'
            Write-Host ''
            $ImportConfirm = Read-Host 'I understand the risks. Continue? [y/N]'
            if ($ImportConfirm -ne 'y' -and $ImportConfirm -ne 'Y') {
                Write-Host 'Import cancelled.'
                Write-Host 'You can import later with: paperwall wallet import --key 0x<key>'
                Write-Host 'Or create a new wallet with: paperwall wallet create'
            }
            else {
                Write-Host ''
                $ImportKey = Read-Host 'Enter private key (0x-prefixed hex)'
                Write-Host ''
                & paperwall wallet import --key $ImportKey
                Write-Host ''
                Write-Host '--------------------------------------------'
                Write-Host ' How your key is stored'
                Write-Host '--------------------------------------------'
                Write-Host "  File:       $WalletFile"
                Write-Host '  Encryption: AES-256-GCM with PBKDF2 (600k iterations)'
                Write-Host '  Key source: Derived from this machine''s hostname + user ID'
                Write-Host ''
                Write-Host '  This means:'
                Write-Host '  - The wallet auto-decrypts on THIS machine, for THIS user'
                Write-Host '  - If the file is copied to another machine, it CANNOT be decrypted'
                Write-Host '  - The original private key is NOT stored in plaintext anywhere'
                Write-Host ''
                Write-Host 'Check your balance:'
                Write-Host '  paperwall wallet balance'
            }
        }
        { $_ -eq '3' -or $_ -eq 'skip' } {
            Write-Host ''
            Write-Host 'Skipped wallet setup. Before using the agent, either:'
            Write-Host '  - Create a wallet:   paperwall wallet create'
            Write-Host '  - Import a key:      paperwall wallet import --key 0x<key>'
            Write-Host '  - Or set env var:    $env:PAPERWALL_PRIVATE_KEY = "0x<key>"'
        }
        default {
            Write-Host "Unknown choice '$WalletChoice' — skipping wallet setup."
        }
    }
}

# -- Step 4: Budget configuration ---

Write-Host ''
Write-Host 'Set a spending budget? (recommended)'
Write-Host '  1) yes   - Set per-request, daily, and total limits'
Write-Host '  2) skip  - Configure later (paperwall budget set)'

$BudgetChoice = Read-Host 'Choose [yes/skip]'

switch ($BudgetChoice) {
    { $_ -eq 'yes' -or $_ -eq '1' } {
        $PerReq = Read-Host 'Max USDC per request (e.g. 0.10)'
        $Daily = Read-Host 'Max USDC per day    (e.g. 1.00)'
        $Total = Read-Host 'Max USDC total      (e.g. 10.00)'

        $BudgetArgs = @()
        if ($PerReq) { $BudgetArgs += '--per-request', $PerReq }
        if ($Daily) { $BudgetArgs += '--daily', $Daily }
        if ($Total) { $BudgetArgs += '--total', $Total }

        if ($BudgetArgs.Count -gt 0) {
            & paperwall budget set @BudgetArgs
            Write-Host 'Budget configured.'
        }
        else {
            Write-Host 'No limits provided — skipping.'
        }
    }
    default {
        Write-Host 'Skipped budget setup. Set limits later: paperwall budget set --per-request 0.10 --daily 1.00 --total 10.00'
    }
}

# -- Done ---

Write-Host ''
Write-Host '============================================'
Write-Host ' Paperwall Agent installed!'
Write-Host '============================================'
$PaperwallCmd = Get-Command paperwall -ErrorAction SilentlyContinue
if ($PaperwallCmd) {
    Write-Host "  CLI:   $($PaperwallCmd.Source)"
}
else {
    Write-Host '  CLI:   paperwall (check PATH)'
}
Write-Host "  Mode:  $IntegrationDesc"
Write-Host ''
Write-Host 'Try it out:'
Write-Host '  paperwall wallet balance'
Write-Host '  paperwall fetch <url> --max-price 0.05'
if ($IntegrationDesc -like 'MCP:*') {
    Write-Host '  paperwall mcp              # start MCP server (used by AI clients)'
}
