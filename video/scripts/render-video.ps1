param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("innovation", "workflow")]
  [string]$Video
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

if (-not (Test-Path -LiteralPath $assetRoot -PathType Container)) {
  throw "Video asset root not found: $assetRoot"
}

if ($Video -eq "innovation") {
  $authorizationPath = Join-Path $projectRoot "render-props\innovation-tts-authorization.json"
  if (-not (Test-Path -LiteralPath $authorizationPath -PathType Leaf)) {
    throw "Formal innovation render is locked until explicit TTS approval is recorded. Use render-review.ps1 during review."
  }

  $authorization = Get-Content -Raw -Encoding UTF8 -LiteralPath $authorizationPath | ConvertFrom-Json
  if ($authorization.authorized -ne $true) {
    throw "Formal innovation render is locked: TTS authorization is not true."
  }

  $captionPath = Join-Path $projectRoot "src\videos\innovation-explainer\data\captions.json"
  $captionHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $captionPath).Hash
  $approvedHash = [string]$authorization.captionSha256
  if ([string]::IsNullOrWhiteSpace($approvedHash) -or $captionHash -ne $approvedHash.ToUpperInvariant()) {
    throw "Formal innovation render is locked: captions changed after approval."
  }
}

if ($Video -eq "innovation") {
  $assetFolder = "innovation-explainer"
  $composition = "PaperTrackerInnovationExplainer"
  $baseName = "paper-tracker-innovation-explainer-2k"
  $timelinePath = Join-Path $projectRoot "src\videos\innovation-explainer\data\timeline.json"
  $compositionProps = Join-Path $projectRoot "render-props\innovation-final.json"
} else {
  $assetFolder = "workflow-explainer"
  $composition = "PaperTrackerWorkflowExplainer"
  $baseName = "paper-tracker-workflow-explainer-2k"
  $timelinePath = Join-Path $projectRoot "src\videos\workflow-explainer\data\timeline.json"
  $compositionProps = Join-Path $projectRoot "render-props\workflow.json"
}

$timeline = Get-Content -Raw -Encoding UTF8 -LiteralPath $timelinePath | ConvertFrom-Json
$playbackRate = if ($null -eq $timeline.finalPlaybackRate) {
  1.0
} else {
  [double]$timeline.finalPlaybackRate
}
$fps = [int]$timeline.fps
if ($playbackRate -le 0 -or $playbackRate -gt 2) {
  throw "Invalid finalPlaybackRate in $timelinePath`: $playbackRate"
}
if ($fps -le 0) {
  throw "Invalid fps in $timelinePath`: $fps"
}

$outputDir = Join-Path $assetRoot "$assetFolder\renders"
$cleanMix = Join-Path $assetRoot "render-inputs\$assetFolder\audio\final-mix.wav"
$raw = Join-Path $outputDir "$baseName-raw.mp4"
$final = Join-Path $outputDir "$baseName.mp4"

if (-not (Test-Path -LiteralPath $cleanMix -PathType Leaf)) {
  throw "Clean PCM mix not found: $cleanMix"
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

Push-Location $projectRoot
try {
  & node scripts/verify-assets.mjs --video $Video
  if ($LASTEXITCODE -ne 0) {
    throw "Render asset validation failed."
  }

  & npx.cmd remotion render src/index.ts $composition $raw `
    --scale=1.3333333333333333 `
    --codec=h264 `
    --muted `
    --crf=14 `
    --pixel-format=yuv420p `
    --color-space=bt709 `
    --props=$compositionProps `
    --concurrency=2
  if ($LASTEXITCODE -ne 0) {
    throw "$composition raw render failed."
  }

  if ($playbackRate -eq 1.0) {
    & npx.cmd remotion ffmpeg -loglevel error -y `
      -i $raw `
      -i $cleanMix `
      -map 0:v:0 `
      -map 1:a:0 `
      -c:v copy `
      -bsf:v "h264_metadata=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1" `
      -c:a libfdk_aac `
      -b:a 320k `
      -ar 48000 `
      -af "volume=1.08" `
      -shortest `
      -movflags +faststart `
      $final
  } else {
    $culture = [System.Globalization.CultureInfo]::InvariantCulture
    $rate = $playbackRate.ToString("0.########", $culture)
    $timestampScale = (1.0 / $playbackRate).ToString("0.########", $culture)
    $audioFilter = "atempo=tempo=$rate,volume=volume=1.08"

    & npx.cmd remotion ffmpeg -loglevel error -y `
      -itsscale $timestampScale `
      -i $raw `
      -i $cleanMix `
      -map 0:v:0 `
      -map 1:a:0 `
      -filter:a $audioFilter `
      -c:v libx264 `
      -preset medium `
      -crf 14 `
      -pix_fmt yuv420p `
      -r $fps `
      -fps_mode cfr `
      -colorspace:v bt709 `
      -color_primaries:v bt709 `
      -color_trc:v bt709 `
      -color_range:v tv `
      -x264-params "colorprim=bt709:transfer=bt709:colormatrix=bt709" `
      -c:a libfdk_aac `
      -b:a 320k `
      -ar 48000 `
      -shortest `
      -movflags +faststart `
      $final
  }

  if ($LASTEXITCODE -ne 0) {
    throw "$composition final audio mux failed."
  }
}
finally {
  Pop-Location
}

Get-Item -LiteralPath $final | Select-Object FullName, Length, LastWriteTime
