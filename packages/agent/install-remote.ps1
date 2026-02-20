#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Paperwall Agent — remote installer
# Usage: irm https://raw.githubusercontent.com/kobaru-io/paperwall/main/packages/agent/install-remote.ps1 | iex

$Repo = 'kobaru-io/paperwall'
$Branch = 'main'
$InstallDir = if ($env:PAPERWALL_INSTALL_DIR) { $env:PAPERWALL_INSTALL_DIR } else { Join-Path $env:USERPROFILE '.paperwall' 'src' }
$ZipUrl = "https://github.com/$Repo/archive/refs/heads/$Branch.zip"

# -- Banner ---

Write-Host ''
Write-Host '                                                ____'
Write-Host '    ____  ____ _____  ___  ______      ______ _/ / /'
Write-Host '   / __ \/ __ `/ __ \/ _ \/ ___/ | /| / / __ `/ / / '
Write-Host '  / /_/ / /_/ / /_/ /  __/ /   | |/ |/ / /_/ / / /  '
Write-Host ' / .___/\__,_/ .___/\___/_/    |__/|__/\__,_/_/_/   '
Write-Host '/_/         /_/                                     '
Write-Host ''
Write-Host '  Remote installer — https://github.com/kobaru-io/paperwall'
Write-Host ''

# -- Check dependencies ---

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

# -- Download agent source ---

$ZipFile = Join-Path $env:TEMP 'paperwall.zip'
$ExtractDir = Join-Path $env:TEMP 'paperwall-extract'

if (Test-Path $InstallDir) {
    Write-Host "==> Updating paperwall in $InstallDir..."
} else {
    Write-Host "==> Downloading paperwall to $InstallDir..."
}

Write-Host "==> Downloading from GitHub..."
Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipFile -UseBasicParsing

# Extract to temp, then move agent directory into place
if (Test-Path $ExtractDir) { Remove-Item -Recurse -Force $ExtractDir }
Expand-Archive -Path $ZipFile -DestinationPath $ExtractDir

$AgentSrc = Join-Path $ExtractDir "paperwall-$Branch" 'packages' 'agent'
if (-not (Test-Path $AgentSrc)) {
    Write-Error "Failed to find agent source in downloaded archive."
    exit 1
}

# Preserve node_modules if updating
$NodeModules = Join-Path $InstallDir 'node_modules'
$PreserveModules = Test-Path $NodeModules
$TempModules = Join-Path $env:TEMP 'paperwall-node_modules'

if ($PreserveModules) {
    if (Test-Path $TempModules) { Remove-Item -Recurse -Force $TempModules }
    Move-Item -Path $NodeModules -Destination $TempModules
}

if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
New-Item -ItemType Directory -Path (Split-Path -Parent $InstallDir) -Force | Out-Null
Copy-Item -Path $AgentSrc -Destination $InstallDir -Recurse

if ($PreserveModules) {
    Move-Item -Path $TempModules -Destination $NodeModules
}

# Cleanup temp files
Remove-Item -Force $ZipFile -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $ExtractDir -ErrorAction SilentlyContinue

# -- Install dependencies ---

Write-Host '==> Installing dependencies...'
Push-Location $InstallDir
npm install 2>&1 | Select-Object -Last 1
Pop-Location

# -- Delegate to the local install script ---

$LocalInstaller = Join-Path $InstallDir 'install.ps1'
if (-not (Test-Path $LocalInstaller)) {
    Write-Error "Local install script not found at $LocalInstaller"
    exit 1
}

& $LocalInstaller
