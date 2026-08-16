$ErrorActionPreference = 'Stop'

param(
  [Parameter(Mandatory = $true)]
  [string]$ZipPath
)

$ExpectedRepo = 'loftfull/NOTE2'
$ExpectedHash = 'faf8695578a1fc613e63325001dafbfcdb02c1f9b565c4692e027e2799ec0bee'
$ImportBranch = 'import/noteai-v3.7-verified'

function Fail([string]$Message) {
  throw "NOTE2 import guard: $Message"
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail 'Git is required.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js is required for the verification test gate.' }
if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) { Fail "ZIP not found: $ZipPath" }

$RepoRoot = (git rev-parse --show-toplevel 2>$null)
if (-not $RepoRoot) { Fail 'Run this script from inside the NOTE2 Git checkout.' }
$RepoRoot = (Resolve-Path $RepoRoot).Path
Set-Location $RepoRoot

$Origin = (git remote get-url origin).Trim()
$OriginNormalized = $Origin -replace '^git@github.com:', 'https://github.com/' -replace '\.git$', ''
if ($OriginNormalized -ne "https://github.com/$ExpectedRepo") {
  Fail "Refusing to run. origin is '$Origin', expected only https://github.com/$ExpectedRepo.git"
}

$Status = git status --porcelain
if ($Status) { Fail 'Working tree is not clean. Commit/stash local work before importing.' }

$CurrentBranch = (git branch --show-current).Trim()
if ($CurrentBranch -ne 'main') { Fail "Start from NOTE2 main. Current branch: '$CurrentBranch'." }

git fetch origin main
$LocalMain = (git rev-parse main).Trim()
$RemoteMain = (git rev-parse origin/main).Trim()
if ($LocalMain -ne $RemoteMain) { Fail 'Local main is not identical to origin/main. Run: git pull --ff-only origin main' }

$Hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ZipPath).Hash.ToLowerInvariant()
if ($Hash -ne $ExpectedHash) {
  Fail "ZIP checksum mismatch. Got $Hash; expected $ExpectedHash. Do not import an unverified archive."
}

$ExistingBranch = git branch --list $ImportBranch
if ($ExistingBranch) { Fail "Branch '$ImportBranch' already exists locally. Refusing to overwrite it." }
$RemoteExisting = git ls-remote --heads origin $ImportBranch
if ($RemoteExisting) { Fail "Branch '$ImportBranch' already exists on GitHub. Refusing to overwrite it." }

$Temp = Join-Path $env:TEMP ("note2-verified-import-" + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $Temp | Out-Null
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $Temp -Force

  $Required = @(
    'package.json',
    'vite.config.js',
    'server.mjs',
    'src/App.jsx',
    'src/source-db.js',
    'src/rag.js',
    'native/android/SecureCredentialsPlugin.java',
    'test/secure-credentials.test.mjs'
  )
  foreach ($Relative in $Required) {
    if (-not (Test-Path -LiteralPath (Join-Path $Temp $Relative) -PathType Leaf)) {
      Fail "Verified archive is incomplete: missing $Relative"
    }
  }

  $Package = Get-Content -Raw -LiteralPath (Join-Path $Temp 'package.json') | ConvertFrom-Json
  if ($Package.name -ne 'noteai-v3') { Fail "Unexpected package identity '$($Package.name)'." }
  if ($Package.type -ne 'module') { Fail "Unexpected package type '$($Package.type)'." }

  git switch -c $ImportBranch main

  # Keep NOTE2's canonical root README and provenance rules. Preserve the source README under history.
  $HistoryDir = Join-Path $RepoRoot 'docs/history'
  New-Item -ItemType Directory -Force -Path $HistoryDir | Out-Null
  Copy-Item -LiteralPath (Join-Path $Temp 'README.md') -Destination (Join-Path $HistoryDir 'NOTEAI-v3.7-README.md') -Force
  Remove-Item -LiteralPath (Join-Path $Temp 'README.md') -Force

  # Copy only the verified NoteAI snapshot into this NOTE2 checkout. No other repository is read or written.
  Get-ChildItem -LiteralPath $Temp -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $RepoRoot -Recurse -Force
  }

  $Provenance = @"
# NOTE2 verified source import

- Source: NoteAI v3.7 build-candidate recovered from the current NOTE2 chat/project line.
- Source ZIP SHA-256: `$ExpectedHash`
- Package identity at import: `$($Package.name)`
- Package version at import: `$($Package.version)`
- Imported branch: `$ImportBranch`
- Cross-project source repositories: none.
- `loftfull/BlockNoteAI`: explicitly excluded; independent project.

The source archive was repaired only by restoring the missing Android Keystore bridge required by its own tests. Before import, `npm test` passed 39/39 in the verification environment.
"@
  Set-Content -LiteralPath (Join-Path $RepoRoot 'docs/IMPORT_PROVENANCE.md') -Value $Provenance -Encoding UTF8

  Write-Host "`nRunning NOTE2 source verification tests before commit...`n"
  npm test
  if ($LASTEXITCODE -ne 0) { Fail 'npm test failed; import branch will not be pushed.' }

  git add --all
  git commit -m 'import: verified NoteAI v3.7 source snapshot'
  git push --set-upstream origin $ImportBranch

  Write-Host "`nVerified NoteAI import complete."
  Write-Host "Branch: $ImportBranch"
  Write-Host "No other GitHub repository or branch was modified."
}
finally {
  if (Test-Path -LiteralPath $Temp) { Remove-Item -LiteralPath $Temp -Recurse -Force }
}
