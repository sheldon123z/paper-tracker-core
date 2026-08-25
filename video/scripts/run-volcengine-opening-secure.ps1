param(
  [string]$WorkDir = "output\innovation-opening-tts",

  [switch]$Force,

  [switch]$GuiPrompt
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot "output"))
$resolvedWorkDir = if ([System.IO.Path]::IsPathRooted($WorkDir)) {
  [System.IO.Path]::GetFullPath($WorkDir)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $projectRoot $WorkDir))
}
$outputBoundary = $outputRoot.TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
) + [System.IO.Path]::DirectorySeparatorChar
if (-not $resolvedWorkDir.StartsWith(
    $outputBoundary,
    [System.StringComparison]::OrdinalIgnoreCase
  )) {
  throw "Opening narration work directory must be a strict child of video/output."
}

$forbiddenWorkDirs = @(
  [System.IO.Path]::GetFullPath((Join-Path $outputRoot "innovation-volcengine-tts")),
  [System.IO.Path]::GetFullPath((Join-Path $outputRoot "innovation-section05-tts-v3"))
)
foreach ($forbiddenWorkDir in $forbiddenWorkDirs) {
  $forbiddenBoundary = $forbiddenWorkDir.TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  ) + [System.IO.Path]::DirectorySeparatorChar
  if (
    $resolvedWorkDir.Equals(
      $forbiddenWorkDir,
      [System.StringComparison]::OrdinalIgnoreCase
    ) -or
    $resolvedWorkDir.StartsWith(
      $forbiddenBoundary,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw "Refusing to modify the canonical or accepted-v3 narration bundle."
  }
}

function Assert-RealDirectoryChain {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,

    [Parameter(Mandatory = $true)]
    [string]$Target
  )

  $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $targetPath = [System.IO.Path]::GetFullPath($Target)
  $rootBoundary = $rootPath + [System.IO.Path]::DirectorySeparatorChar
  if (-not $targetPath.StartsWith(
      $rootBoundary,
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
    throw "Opening narration work directory escaped video/output."
  }

  $current = $rootPath
  $relative = $targetPath.Substring($rootBoundary.Length)
  $segments = $relative.Split(
    @(
      [System.IO.Path]::DirectorySeparatorChar,
      [System.IO.Path]::AltDirectorySeparatorChar
    ),
    [System.StringSplitOptions]::RemoveEmptyEntries
  )
  foreach ($segment in @(".") + $segments) {
    if ($segment -ne ".") {
      $current = Join-Path $current $segment
    }
    if (-not (Test-Path -LiteralPath $current)) {
      break
    }
    $item = Get-Item -LiteralPath $current -Force
    if (-not $item.PSIsContainer) {
      throw "Opening narration directory chain contains a non-directory: $current"
    }
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Opening narration directory chain contains a junction or symbolic link: $current"
    }
  }
}

Assert-RealDirectoryChain -Root $outputRoot -Target $resolvedWorkDir
New-Item -ItemType Directory -Force -Path $resolvedWorkDir | Out-Null
Assert-RealDirectoryChain -Root $outputRoot -Target $resolvedWorkDir
$segmentsDir = Join-Path $resolvedWorkDir "segments"
Assert-RealDirectoryChain -Root $outputRoot -Target $segmentsDir
New-Item -ItemType Directory -Force -Path $segmentsDir | Out-Null
Assert-RealDirectoryChain -Root $outputRoot -Target $segmentsDir

$nodePath = [System.IO.Path]::GetFullPath(
  (Join-Path $projectRoot "..\..\.runtime\node\node.exe")
)
if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
  throw "Pinned portable Node.js was not found. Run scripts/setup-node-env.ps1 first."
}

$secret = $null
$secretPointer = [IntPtr]::Zero
$plainText = $null
$generatorArgs = @(
  "scripts/generate-volcengine-narration.mjs",
  "--from",
  "1",
  "--to",
  "5",
  "--work-dir",
  $resolvedWorkDir
)
if ($Force) {
  $generatorArgs += "--force"
}

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

function Read-VolcengineApiKeyFromDialog {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $form = New-Object System.Windows.Forms.Form
  $form.Text = "Paper Tracker · 火山 TTS 安全输入"
  $form.ClientSize = New-Object System.Drawing.Size(560, 220)
  $form.StartPosition = "CenterScreen"
  $form.FormBorderStyle = "FixedDialog"
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $form.ShowInTaskbar = $true
  $form.TopMost = $true

  $label = New-Object System.Windows.Forms.Label
  $label.AutoSize = $false
  $label.Location = New-Object System.Drawing.Point(28, 24)
  $label.Size = New-Object System.Drawing.Size(504, 48)
  $label.Text = "请输入火山 TTS API Key。密钥仅注入本次 cue 1–5 生成进程，不写入磁盘或日志。"
  $label.Font = [System.Drawing.Font]::new("Microsoft YaHei UI", 10)

  $textBox = New-Object System.Windows.Forms.TextBox
  $textBox.Location = New-Object System.Drawing.Point(28, 86)
  $textBox.Size = New-Object System.Drawing.Size(504, 30)
  $textBox.UseSystemPasswordChar = $true
  $textBox.Font = [System.Drawing.Font]::new("Segoe UI", 11)

  $okButton = New-Object System.Windows.Forms.Button
  $okButton.Location = New-Object System.Drawing.Point(332, 148)
  $okButton.Size = New-Object System.Drawing.Size(96, 36)
  $okButton.Text = "开始生成"
  $okButton.DialogResult = [System.Windows.Forms.DialogResult]::OK

  $cancelButton = New-Object System.Windows.Forms.Button
  $cancelButton.Location = New-Object System.Drawing.Point(436, 148)
  $cancelButton.Size = New-Object System.Drawing.Size(96, 36)
  $cancelButton.Text = "取消"
  $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel

  $form.Controls.AddRange(@($label, $textBox, $okButton, $cancelButton))
  $form.AcceptButton = $okButton
  $form.CancelButton = $cancelButton
  $form.Add_Shown({ $textBox.Focus() })

  $dialogText = $null
  try {
    $result = $form.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
      throw "Volcengine TTS API key entry was cancelled."
    }
    $dialogText = $textBox.Text
    if ([string]::IsNullOrWhiteSpace($dialogText)) {
      throw "Volcengine TTS API key must not be empty."
    }
    return ConvertTo-SecureString $dialogText -AsPlainText -Force
  }
  finally {
    $textBox.Clear()
    $dialogText = $null
    $form.Dispose()
  }
}

Push-Location $projectRoot
try {
  foreach ($name in $blockedNodeEnvironmentNames) {
    $savedNodeEnvironment[$name] = [Environment]::GetEnvironmentVariable(
      $name,
      [EnvironmentVariableTarget]::Process
    )
    [Environment]::SetEnvironmentVariable(
      $name,
      $null,
      [EnvironmentVariableTarget]::Process
    )
  }

  $secret = if ($GuiPrompt) {
    Read-VolcengineApiKeyFromDialog
  } else {
    Read-Host "Volcengine TTS API key" -AsSecureString
  }
  $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  $plainText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
  if ([string]::IsNullOrWhiteSpace($plainText)) {
    throw "Volcengine TTS API key must not be empty."
  }

  [Environment]::SetEnvironmentVariable(
    "VOLCENGINE_TTS_API_KEY",
    $null,
    [EnvironmentVariableTarget]::Process
  )
  [Environment]::SetEnvironmentVariable(
    "VOLCENGINE_TTS_API_KEY",
    $plainText,
    [EnvironmentVariableTarget]::Process
  )
  & $nodePath @generatorArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Opening narration generation failed with exit code $LASTEXITCODE."
  }
}
finally {
  $cleanupFailures = New-Object System.Collections.Generic.List[string]

  try {
    [Environment]::SetEnvironmentVariable(
      "VOLCENGINE_TTS_API_KEY",
      $null,
      [EnvironmentVariableTarget]::Process
    )
  }
  catch {
    $cleanupFailures.Add(
      "API key environment removal failed: $($_.Exception.Message)"
    )
  }

  $plainText = $null
  try {
    if ($secretPointer -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    }
  }
  catch {
    $cleanupFailures.Add(
      "Secure string buffer release failed: $($_.Exception.Message)"
    )
  }
  finally {
    $secretPointer = [IntPtr]::Zero
  }

  foreach ($name in $blockedNodeEnvironmentNames) {
    if (-not $savedNodeEnvironment.ContainsKey($name)) {
      continue
    }
    try {
      [Environment]::SetEnvironmentVariable(
        $name,
        $savedNodeEnvironment[$name],
        [EnvironmentVariableTarget]::Process
      )
    }
    catch {
      $cleanupFailures.Add(
        "Environment restore failed for ${name}: $($_.Exception.Message)"
      )
    }
  }

  $secret = $null
  try {
    Pop-Location
  }
  catch {
    $cleanupFailures.Add(
      "Location restore failed: $($_.Exception.Message)"
    )
  }

  if ($cleanupFailures.Count -gt 0) {
    throw "Secure cleanup failed: $($cleanupFailures -join '; ')"
  }
}
