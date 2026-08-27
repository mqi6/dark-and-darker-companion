param(
  [Parameter(Mandatory = $true)]
  [string]$GameExecutable,

  [Parameter(Mandatory = $true)]
  [string]$GameBuildLabel,

  [Parameter(Mandatory = $true)]
  [ValidateSet("windowed", "borderless", "fullscreen")]
  [string]$WindowMode,

  [Parameter(Mandatory = $true)]
  [ValidateRange(50, 500)]
  [int]$WindowsScalingPercent,

  [Parameter(Mandatory = $true)]
  [ValidateSet("en", "zh-Hans")]
  [string]$GameLanguage
)

$ErrorActionPreference = "Stop"
$resolvedExecutable = (Resolve-Path -LiteralPath $GameExecutable).Path
$executable = Get-Item -LiteralPath $resolvedExecutable
if ($executable.Extension -ne ".exe") {
  throw "GameExecutable must point to a Windows .exe file."
}

Add-Type -AssemblyName System.Windows.Forms
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$version = $executable.VersionInfo
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $projectRoot "fixtures/game/BUILD-001"
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

$baseline = [ordered]@{
  schemaVersion = 1
  sampleId = "BUILD-001"
  capturedAt = [DateTime]::UtcNow.ToString("o")
  gameBuildLabel = $GameBuildLabel
  gameExecutableName = $executable.Name
  gameExecutableSha256 = (Get-FileHash -LiteralPath $resolvedExecutable -Algorithm SHA256).Hash.ToLowerInvariant()
  gameExecutableSize = $executable.Length
  fileVersion = if ([string]::IsNullOrWhiteSpace($version.FileVersion)) { $null } else { $version.FileVersion }
  productVersion = if ([string]::IsNullOrWhiteSpace($version.ProductVersion)) { $null } else { $version.ProductVersion }
  windowsVersion = [Environment]::OSVersion.VersionString
  screen = [ordered]@{
    width = $bounds.Width
    height = $bounds.Height
    windowsScalingPercent = $WindowsScalingPercent
    windowMode = $WindowMode
  }
  gameLanguage = $GameLanguage
  sanitized = $true
}

$outputPath = Join-Path $outputRoot "build.json"
$json = $baseline | ConvertTo-Json -Depth 5
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outputPath, $json + [Environment]::NewLine, $utf8NoBom)
Write-Output "Saved sanitized build baseline to $outputPath"
