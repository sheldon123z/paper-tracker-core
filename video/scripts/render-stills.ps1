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

if ($Video -eq "innovation") {
  $assetFolder = "innovation-explainer"
  $composition = "PaperTrackerInnovationExplainer"
  $timelinePath = Join-Path $projectRoot "src\videos\innovation-explainer\data\timeline.json"
} else {
  $assetFolder = "workflow-explainer"
  $composition = "PaperTrackerWorkflowExplainer"
  $timelinePath = Join-Path $projectRoot "src\videos\workflow-explainer\data\timeline.json"
}

$outputDir = Join-Path $assetRoot "$assetFolder\qa\stills"
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
  & node scripts/verify-assets.mjs --video $Video
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
      --scale=0.5 `
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
