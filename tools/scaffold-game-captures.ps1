param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$gameFixturesRoot = Join-Path $projectRoot "fixtures/game"

$samples = @(
  [ordered]@{ Id = "CAP-001-empty-stash"; Title = "Empty stash baseline"; Artifacts = @("overview.png"); Setup = "Use the selected stash-test-page. Remove every item, then capture the final empty grid." },
  [ordered]@{ Id = "CAP-002-single-item"; Title = "Single 1x1 quantity-one item"; Artifacts = @("overview.png", "tooltip.png"); Setup = "Place one 1x1 stackable quantity-one item at top-left cell (0,0)." },
  [ordered]@{ Id = "CAP-003-stack-quantities"; Title = "Partial and full stacks"; Artifacts = @("overview.png", "tooltip-partial.png", "tooltip-full.png"); Setup = "Place the partial stack at (0,0) and the full stack of the same item at (2,0)." },
  [ordered]@{ Id = "CAP-004-multicell-no-roll"; Title = "Multi-cell gear without random rolls"; Artifacts = @("overview.png", "tooltip.png"); Setup = "Place one item larger than 1x1 with no random secondary rolls at top-left cell (0,0)." },
  [ordered]@{ Id = "CAP-005-rolled-gear"; Title = "Gear with random rolls"; Artifacts = @("overview.png", "tooltip.png"); Setup = "Place one gear item with at least two random secondary rolls at top-left cell (0,0)." },
  [ordered]@{ Id = "CAP-006-mixed-stash"; Title = "Mixed realistic stash"; Artifacts = @("overview.png", "tooltip-stack.png", "tooltip-no-roll.png", "tooltip-rolled.png"); Setup = "Stacks at (0,0)/(2,0), no-roll gear at (0,2), rolled gear at (4,2), then at least 16 more items from row 6 downward." },
  [ordered]@{ Id = "CAP-007-fragmented-stash"; Title = "Nearly full fragmented stash"; Artifacts = @("overview.png"); Setup = "Capture the final state with roughly 85 percent occupancy and at least three separated empty holes." },
  [ordered]@{ Id = "CAP-008-reserved-region"; Title = "Reserved 3x2 rectangle"; Artifacts = @("overview.png"); Setup = "Reserve x=0,y=0,width=3,height=2; place at least one item inside and two outside." },
  [ordered]@{ Id = "CAP-009-manual-drag"; Title = "One manual drag"; Artifacts = @("before.png", "manual-drag.mp4", "after.png"); Setup = "Manually drag one 1x1 item exactly once from (0,0) to empty cell (3,0)." },
  [ordered]@{ Id = "CAP-010-manual-auction"; Title = "One manual Auction listing"; Artifacts = @("before-submit.png", "after-success.png"); Setup = "Optional: manually list one cheap quantity-one no-roll item and capture before-submit and confirmed success." }
)

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
foreach ($sample in $samples) {
  $sampleRoot = Join-Path $gameFixturesRoot $sample.Id
  New-Item -ItemType Directory -Path $sampleRoot -Force | Out-Null
  $instructionPath = Join-Path $sampleRoot "CAPTURE.md"
  if ((Test-Path -LiteralPath $instructionPath) -and -not $Force) {
    Write-Output "Kept existing $instructionPath"
    continue
  }

  $artifactLines = ($sample.Artifacts | ForEach-Object { "- ``$_``" }) -join [Environment]::NewLine
  $text = @"
# $($sample.Id) — $($sample.Title)

$($sample.Setup)

Required artifact filenames:

$artifactLines

Use native-resolution PNG screenshots. Follow docs/human-checkpoint-003-windows-game-baseline.md for the exact sequence, sanitization rules, and manifest requirements.
"@
  [System.IO.File]::WriteAllText($instructionPath, $text, $utf8NoBom)
  Write-Output "Created $instructionPath"
}
