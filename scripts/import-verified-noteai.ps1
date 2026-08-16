$ErrorActionPreference = 'Stop'

param(
  [Parameter(Mandatory = $true)]
  [string]$ZipPath
)

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

$LockPath = Join-Path $RepoRoot 'note2-source.lock.json'
if (-not (Test-Path -LiteralPath $LockPath -PathType Leaf)) { Fail 'Missing note2-source.lock.json; provenance cannot be verified.' }
$Lock = Get-Content -Raw -LiteralPath $LockPath | ConvertFrom-Json
if ($Lock.schemaVersion -ne 1) { Fail "Unsupported source-lock schema version '$($Lock.schemaVersion)'." }
if (-not $Lock.rules.requireExactArtifactHash -or -not $Lock.rules.requireDedicatedImportBranch) { Fail 'Source-lock safety rules are unexpectedly disabled.' }
if ($Lock.rules.allowMirrorPush -or $Lock.rules.allowCrossRepositoryForcePush) { Fail 'Source-lock permits destructive cross-repository operations; refusing import.' }

$ExpectedRepo = [string]$Lock.project.repository
$ExpectedHash = ([string]$Lock.verifiedSource.sha256).ToLowerInvariant()
$ExpectedPackage = [string]$Lock.verifiedSource.packageName
$ExpectedTests = [int]$Lock.verifiedSource.expectedRegressionTests
$Required = @($Lock.verifiedSource.requiredFiles | ForEach-Object { [string]$_ })

if ($ExpectedRepo -ne 'loftfull/NOTE2') { Fail "Unexpected locked repository '$ExpectedRepo'." }
if ($ExpectedHash -notmatch '^[a-f0-9]{64}$') { Fail 'Invalid locked SHA-256.' }
if ($Required.Count -lt 1) { Fail 'Source lock has no required-file fingerprint.' }

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

  foreach ($Relative in $Required) {
    if (-not (Test-Path -LiteralPath (Join-Path $Temp $Relative) -PathType Leaf)) {
      Fail "Verified archive is incomplete: missing $Relative"
    }
  }

  $Package = Get-Content -Raw -LiteralPath (Join-Path $Temp 'package.json') | ConvertFrom-Json
  if ($Package.name -ne $ExpectedPackage) { Fail "Unexpected package identity '$($Package.name)', expected '$ExpectedPackage'." }
  if ($Package.type -ne 'module') { Fail "Unexpected package type '$($Package.type)'." }

  git switch -c $ImportBranch main

  # Keep NOTE2 canonical root documentation. Preserve the imported source README as evidence/history.
  $HistoryDir = Join-Path $RepoRoot 'docs/history'
  New-Item -ItemType Directory -Force -Path $HistoryDir | Out-Null
  Copy-Item -LiteralPath (Join-Path $Temp 'README.md') -Destination (Join-Path $HistoryDir 'NOTEAI-v3.7-README.md') -Force
  Remove-Item -LiteralPath (Join-Path $Temp 'README.md') -Force

  # Copy only the exact verified NoteAI artifact into NOTE2. No other repository is read or written.
  Get-ChildItem -LiteralPath $Temp -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $RepoRoot -Recurse -Force
  }

  $Provenance = @"
# NOTE2 verified source import

- Source artifact: `$($Lock.verifiedSource.file)`
- Source ZIP SHA-256: `$ExpectedHash`
- Package identity at import: `$($Package.name)`
- Package version at import: `$($Package.version)`
- Expected regression tests from lock: `$ExpectedTests`
- Imported branch: `$ImportBranch`
- Cross-project source repositories: none.

`loftfull/BlockNoteAI` is explicitly excluded by `note2-source.lock.json` and is an independent project.
"@
  Set-Content -LiteralPath (Join-Path $RepoRoot 'docs/IMPORT_PROVENANCE.md') -Value $Provenance -Encoding UTF8

  Write-Host "`nRunning NOTE2 source verification tests before commit...`n"
  $TestOutput = npm test 2>&1
  $TestExit = $LASTEXITCODE
  $TestOutput | Write-Host
  if ($TestExit -ne 0) { Fail 'npm test failed; import branch will not be pushed.' }
  $PassMatches = [regex]::Matches(($TestOutput -join "`n"), '# pass\s+(\d+)')
  if ($PassMatches.Count -gt 0) {
    $Passed = [int]$PassMatches[$PassMatches.Count - 1].Groups[1].Value
    if ($Passed -ne $ExpectedTests) { Fail "Regression count mismatch: passed $Passed; source lock expects $ExpectedTests." }
  }

  git add --all
  git commit -m 'import: verified NoteAI source snapshot'
  git push --set-upstream origin $ImportBranch

  Write-Host "`nVerified NoteAI import complete."
  Write-Host "Branch: $ImportBranch"
  Write-Host "No other GitHub repository or branch was modified."
}
finally {
  if (Test-Path -LiteralPath $Temp) { Remove-Item -LiteralPath $Temp -Recurse -Force }
}
