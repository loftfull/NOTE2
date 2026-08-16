$ErrorActionPreference = 'Stop'

$Source = 'https://github.com/loftfull/BlockNoteAI.git'
$Target = 'https://github.com/loftfull/NOTE2.git'
$WorkDir = Join-Path $env:TEMP ("note2-mirror-" + [guid]::NewGuid().ToString('N'))

Write-Host "`nNOTE2 full Git migration"
Write-Host "Source: $Source"
Write-Host "Target: $Target`n"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git is required. Install Git for Windows first.'
}

try {
  git clone --mirror $Source (Join-Path $WorkDir 'BlockNoteAI.git')
  Set-Location (Join-Path $WorkDir 'BlockNoteAI.git')

  # NOTE2 contains a temporary bootstrap commit. --mirror intentionally replaces
  # refs so branches/tags/history become an exact copy of the source repository.
  git remote set-url --push origin $Target
  git push --mirror origin

  Write-Host "`nMirror complete. NOTE2 now contains the source branches, tags and commit history."
  Write-Host "After that, set the desired default branch in GitHub."
}
finally {
  Set-Location $env:TEMP
  if (Test-Path $WorkDir) { Remove-Item -Recurse -Force $WorkDir }
}
