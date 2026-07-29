param(
  [ValidateRange(1, 49)]
  [int]$Only = 0,

  [switch]$Force,

  [string]$Target
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = [System.IO.Path]::GetFullPath(
  (Join-Path $projectRoot "..\..\.runtime\node\node.exe")
)
$secret = $null
$secretPointer = [IntPtr]::Zero
$plainText = $null
$generatorArgs = @()
$blockedNodeEnvironmentNames = @(
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_DEBUG",
  "NODE_EXTRA_CA_CERTS",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "SSLKEYLOGFILE",
  "OPENSSL_CONF"
)
$savedNodeEnvironment = @{}

if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
  throw "Pinned portable Node.js was not found. Run scripts/setup-node-env.ps1 first."
}

if ($Only -gt 0) {
  $generatorArgs += @("--only", [string]$Only)
}
if ($Force) {
  $generatorArgs += "--force"
}
if (-not [string]::IsNullOrWhiteSpace($Target)) {
  $generatorArgs += @("--target", $Target)
}

Push-Location $projectRoot
try {
  foreach ($name in $blockedNodeEnvironmentNames) {
    $existing = Get-ChildItem Env: |
      Where-Object { $_.Name -ieq $name } |
      Select-Object -First 1
    if ($null -ne $existing) {
      $savedNodeEnvironment[$existing.Name] = $existing.Value
    }
    Get-ChildItem Env: |
      Where-Object { $_.Name -ieq $name } |
      Remove-Item -ErrorAction SilentlyContinue
  }

  $secret = Read-Host "Volcengine TTS API key" -AsSecureString
  $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  $plainText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
  if ([string]::IsNullOrWhiteSpace($plainText)) {
    throw "Volcengine TTS API key must not be empty."
  }

  Get-ChildItem Env: |
    Where-Object { $_.Name -ieq "VOLCENGINE_TTS_API_KEY" } |
    Remove-Item -ErrorAction SilentlyContinue
  $env:VOLCENGINE_TTS_API_KEY = $plainText
  & $nodePath "scripts/generate-volcengine-narration.mjs" @generatorArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Volcengine narration generation failed with exit code $LASTEXITCODE."
  }
}
finally {
  Get-ChildItem Env: |
    Where-Object { $_.Name -ieq "VOLCENGINE_TTS_API_KEY" } |
    Remove-Item -ErrorAction SilentlyContinue
  $plainText = $null
  if ($secretPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
  }
  foreach ($entry in $savedNodeEnvironment.GetEnumerator()) {
    [Environment]::SetEnvironmentVariable(
      [string]$entry.Key,
      [string]$entry.Value,
      [EnvironmentVariableTarget]::Process
    )
  }
  $secret = $null
  Pop-Location
}
