param(
  [ValidateRange(1, 64)]
  [int]$Concurrency = 2
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

$outputDir = Join-Path $projectRoot "output"
$target = Join-Path $outputDir "paper-tracker-innovation-explainer-silent-review.mp4"
$taggedTarget = Join-Path $outputDir "paper-tracker-innovation-explainer-silent-review.bt709.tmp.mp4"
$reviewProps = Join-Path $projectRoot "render-props\innovation-review.json"
$timelinePath = Join-Path $projectRoot "src\videos\innovation-explainer\data\timeline.json"
$timeline = Get-Content -Raw -Encoding UTF8 -LiteralPath $timelinePath | ConvertFrom-Json
$expectedDurationSeconds = [double]$timeline.durationInFrames / [double]$timeline.fps
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

Push-Location $projectRoot
try {
  & node scripts/verify-assets.mjs --video innovation --review
  if ($LASTEXITCODE -ne 0) {
    throw "Silent-review asset validation failed."
  }

  & npx.cmd remotion render `
    src/index.ts `
    PaperTrackerInnovationExplainer `
    $target `
    --scale=1.3333333333333333 `
    --codec=h264 `
    --muted `
    --crf=16 `
    --pixel-format=yuv420p `
    --color-space=bt709 `
    --props=$reviewProps `
    --concurrency=$Concurrency
  if ($LASTEXITCODE -ne 0) {
    throw "Silent-review render failed."
  }

  # Remotion writes the BT.709 matrix but may omit the matching H.264 VUI
  # primaries and transfer tags. Add all three tags by stream copy so the
  # review master is explicit without introducing another lossy encode.
  & npx.cmd remotion ffmpeg `
    -v error `
    -y `
    -i $target `
    -map 0:v:0 `
    -c:v copy `
    -bsf:v "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1" `
    -an `
    -movflags +faststart `
    $taggedTarget
  if ($LASTEXITCODE -ne 0) {
    throw "Silent-review BT.709 metadata tagging failed."
  }

  $resolvedOutputDir = [System.IO.Path]::GetFullPath($outputDir).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar
  ) + [System.IO.Path]::DirectorySeparatorChar
  $resolvedTarget = [System.IO.Path]::GetFullPath($target)
  $resolvedTaggedTarget = [System.IO.Path]::GetFullPath($taggedTarget)
  if (
    -not $resolvedTarget.StartsWith(
      $resolvedOutputDir,
      [System.StringComparison]::OrdinalIgnoreCase
    ) -or
    -not $resolvedTaggedTarget.StartsWith(
      $resolvedOutputDir,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw "Refusing to replace a silent-review file outside the output directory."
  }
  Move-Item -LiteralPath $resolvedTaggedTarget -Destination $resolvedTarget -Force

  $audioStreams = (& npx.cmd remotion ffprobe `
    -v error `
    -select_streams a `
    -show_entries stream=index `
    -of csv=p=0 `
    $target | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Silent-review audio-stream validation failed."
  }
  if (-not [string]::IsNullOrWhiteSpace($audioStreams)) {
    throw "Silent-review output unexpectedly contains an audio stream."
  }

  $duration = (& npx.cmd remotion ffprobe `
    -v error `
    -show_entries format=duration `
    -of default=noprint_wrappers=1:nokey=1 `
    $target | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Silent-review duration validation failed."
  }
  $durationSeconds = [double]::Parse(
    $duration,
    [System.Globalization.CultureInfo]::InvariantCulture
  )
  if ([Math]::Abs($durationSeconds - $expectedDurationSeconds) -gt 0.05) {
    throw "Silent-review duration must be $expectedDurationSeconds seconds; received $durationSeconds."
  }

  $videoStreamJson = (& npx.cmd remotion ffprobe `
    -v error `
    -select_streams v:0 `
    -show_entries stream=codec_name,width,height,r_frame_rate,color_space,color_transfer,color_primaries `
    -of json `
    $target | Out-String)
  if ($LASTEXITCODE -ne 0) {
    throw "Silent-review video-stream validation failed."
  }
  $videoStream = ($videoStreamJson | ConvertFrom-Json).streams[0]
  if (
    $videoStream.codec_name -ne "h264" -or
    [int]$videoStream.width -ne 2560 -or
    [int]$videoStream.height -ne 1440 -or
    $videoStream.r_frame_rate -ne "30/1" -or
    $videoStream.color_space -ne "bt709" -or
    $videoStream.color_transfer -ne "bt709" -or
    $videoStream.color_primaries -ne "bt709"
  ) {
    throw "Silent-review stream metadata is not 2560x1440/30fps H.264 BT.709."
  }

  & npx.cmd remotion ffmpeg `
    -v error `
    -i $target `
    -map 0:v:0 `
    -c:v rawvideo `
    -f null `
    NUL
  if ($LASTEXITCODE -ne 0) {
    throw "Silent-review full decode validation failed."
  }
}
finally {
  Pop-Location
}

Get-Item -LiteralPath $target | Select-Object FullName, Length, LastWriteTime
