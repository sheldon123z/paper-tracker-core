param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("innovation", "workflow")]
  [string]$Video,

  [string]$SceneId = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$assetSetting = if ([string]::IsNullOrWhiteSpace($env:VIDEO_ASSETS_DIR)) {
  "..\..\video-assets"
} else {
  $env:VIDEO_ASSETS_DIR
}
$assetRoot = if ([System.IO.Path]::IsPathRooted($assetSetting)) {
  [System.IO.Path]::GetFullPath($assetSetting)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $projectRoot $assetSetting))
}
$env:VIDEO_ASSETS_DIR = $assetRoot
$browserExecutable = @(
  (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
  (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
) | Where-Object {
  -not [string]::IsNullOrWhiteSpace($_) -and
  (Test-Path -LiteralPath $_ -PathType Leaf)
} | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($browserExecutable)) {
  throw "A local Google Chrome executable is required for deterministic still rendering."
}

if ($Video -eq "innovation") {
  $assetFolder = "innovation-explainer"
  $composition = "PaperTrackerInnovationExplainer"
  $timelinePath = Join-Path $projectRoot "src\videos\innovation-explainer\data\timeline.json"
  $compositionProps = Join-Path $projectRoot "render-props\innovation-review.json"
} else {
  $assetFolder = "workflow-explainer"
  $composition = "PaperTrackerWorkflowExplainer"
  $timelinePath = Join-Path $projectRoot "src\videos\workflow-explainer\data\timeline.json"
  $compositionProps = Join-Path $projectRoot "render-props\workflow.json"
}

$outputDir = if ($Video -eq "innovation") {
  Join-Path $projectRoot "output\review-stills\innovation"
} else {
  Join-Path $assetRoot "$assetFolder\qa\stills"
}
$renderScale = if ($Video -eq "innovation") {
  "1.3333333333333333"
} else {
  "0.5"
}
$timeline = Get-Content -Raw -Encoding UTF8 -LiteralPath $timelinePath | ConvertFrom-Json
$scenes = @($timeline.scenes)

if (-not [string]::IsNullOrWhiteSpace($SceneId)) {
  $scenes = @($scenes | Where-Object { $_.id -eq $SceneId })
  if ($scenes.Count -ne 1) {
    throw "Scene not found in $Video timeline: $SceneId"
  }
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

Push-Location $projectRoot
try {
  $verifyArguments = @("scripts/verify-assets.mjs", "--video", $Video)
  if ($Video -eq "innovation") {
    $verifyArguments += "--review"
  }
  & node @verifyArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Render asset validation failed."
  }

  foreach ($scene in $scenes) {
    $startFrame = if ($null -ne $scene.startFrame) {
      [int]$scene.startFrame
    } else {
      [int][Math]::Round([double]$scene.startSeconds * 30)
    }
    $durationInFrames = if ($null -ne $scene.durationInFrames) {
      [int]$scene.durationInFrames
    } else {
      [int][Math]::Round([double]$scene.durationSeconds * 30)
    }
    $frame = $startFrame + [int][Math]::Floor($durationInFrames * 0.55)
    $target = Join-Path $outputDir ($scene.id + ".png")

    & npx.cmd remotion still src/index.ts $composition $target `
      --frame=$frame `
      --scale=$renderScale `
      --props=$compositionProps `
      --browser-executable=$browserExecutable `
      --log=error
    if ($LASTEXITCODE -ne 0) {
      throw "$composition still render failed for $($scene.id)."
    }
  }
}
finally {
  Pop-Location
}

Get-ChildItem -LiteralPath $outputDir -Filter "*.png" |
  Select-Object Name, Length, LastWriteTime
