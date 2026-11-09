# Downloads the shared HQ vault into a local folder of read-only .md files,
# so your Claude can read it. This uses a read-only token: nothing here can
# change the vault. Local edits to these files get overwritten on the next pull.
#
#   powershell -ExecutionPolicy Bypass -File tools\pull-vault.ps1
#
# The token goes in %USERPROFILE%\.briveon\vault-token.txt (see README.md).
param(
  [string]$Out = (Join-Path $HOME 'BriveonVault'),
  [string]$TokenFile = (Join-Path $HOME '.briveon\vault-token.txt'),
  [string]$Url = 'https://ezgnevjnmgddbfvfinku.supabase.co',
  [string]$Key = 'sb_publishable_gB3ym11EjP0PrsC5_yPXbQ_VHPz31s1'
)

$ErrorActionPreference = 'Stop'
$ManifestName = '.vault-manifest.json'
$Utf8 = New-Object System.Text.UTF8Encoding($false)

$token = $env:BRIVEON_VAULT_TOKEN
if (-not $token) {
  if (-not (Test-Path -LiteralPath $TokenFile)) {
    throw "No vault token found. Save yours to $TokenFile (see README.md)."
  }
  $token = (Get-Content -LiteralPath $TokenFile -Raw).Trim()
}

$outFull = [IO.Path]::GetFullPath($Out).TrimEnd('\')
$manifestPath = Join-Path $outFull $ManifestName

# Never pull over a folder this script didn't create, like your original Obsidian vault.
if ((Test-Path -LiteralPath $outFull) -and -not (Test-Path -LiteralPath $manifestPath)) {
  if (@(Get-ChildItem -LiteralPath $outFull -Force).Count -gt 0) {
    throw "$outFull already has files that didn't come from this script. Pick an empty folder with -Out."
  }
}
New-Item -ItemType Directory -Force -Path $outFull | Out-Null

function Get-SafeTarget([string]$relative) {
  $segments = $relative -split '/'
  foreach ($segment in $segments) {
    if (-not $segment -or $segment -match '^[. ]' -or $segment -match '[. ]$' -or $segment -match '[\\<>:"|?*\x00-\x1f]') { return $null }
    if ($segment -match '^(?i)(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)') { return $null }
  }
  if ($relative -notmatch '(?i)\.md$') { return $null }
  $full = [IO.Path]::GetFullPath((Join-Path $outFull ($relative -replace '/', '\')))
  if (-not $full.StartsWith($outFull + '\', [StringComparison]::OrdinalIgnoreCase)) { return $null }
  return $full
}

$old = @()
if (Test-Path -LiteralPath $manifestPath) {
  $parsed = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
  foreach ($item in $parsed) { $old += [string]$item }
}

$current = New-Object System.Collections.ArrayList
$written = 0
$skipped = 0
$after = ''

while ($true) {
  $body = @{ p_token = $token; p_after = $after; p_limit = 200 } | ConvertTo-Json -Compress
  $response = Invoke-RestMethod -Method Post -Uri "$Url/rest/v1/rpc/vault_read" `
    -Headers @{ apikey = $Key } -ContentType 'application/json; charset=utf-8' `
    -Body $Utf8.GetBytes($body)

  $count = 0
  foreach ($note in $response) {
    $count += 1
    $after = [string]$note.path
    $target = Get-SafeTarget $after
    if (-not $target) {
      Write-Warning "Skipped a note with an unsafe path: $after"
      $skipped += 1
      continue
    }
    [void]$current.Add($after)

    $content = [string]$note.content
    $same = $false
    if (Test-Path -LiteralPath $target) {
      $same = ([IO.File]::ReadAllText($target, $Utf8) -ceq $content)
    }
    if ($same) { continue }

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    if (Test-Path -LiteralPath $target) { [IO.File]::SetAttributes($target, [IO.FileAttributes]::Normal) }
    [IO.File]::WriteAllText($target, $content, $Utf8)
    [IO.File]::SetAttributes($target, [IO.FileAttributes]::ReadOnly)
    $written += 1
  }
  if ($count -lt 200) { break }
}

# Remove only files an earlier pull created, for notes that no longer exist.
$removed = 0
foreach ($relative in $old) {
  if ($current -contains $relative) { continue }
  $target = Get-SafeTarget $relative
  if (-not $target -or -not (Test-Path -LiteralPath $target)) { continue }
  [IO.File]::SetAttributes($target, [IO.FileAttributes]::Normal)
  Remove-Item -LiteralPath $target -Force
  $removed += 1
  $dir = Split-Path -Parent $target
  while ($dir.Length -gt $outFull.Length -and @(Get-ChildItem -LiteralPath $dir -Force).Count -eq 0) {
    Remove-Item -LiteralPath $dir -Force
    $dir = Split-Path -Parent $dir
  }
}

$json = ConvertTo-Json -InputObject @($current.ToArray()) -Compress
[IO.File]::WriteAllText($manifestPath, $json, $Utf8)

Write-Host "Vault pulled to $outFull : $($current.Count) notes, $written updated, $removed removed, $skipped skipped."
