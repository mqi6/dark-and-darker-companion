$ErrorActionPreference = 'Stop'
$toolsRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Split-Path -Parent $toolsRoot
. (Join-Path $toolsRoot 'windows-tshark.ps1')

$filesToParse = @(
    (Join-Path $toolsRoot 'windows-tshark.ps1'),
    (Join-Path $toolsRoot 'record-game-traffic.ps1'),
    $PSCommandPath
)
foreach ($file in $filesToParse) {
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$parseErrors) | Out-Null
    if ($parseErrors.Count -ne 0) { throw "PowerShell syntax errors in $file`: $($parseErrors -join '; ')" }
}

$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ("tshark-resolution-test-{0}" -f [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
$originalProcessPath = $env:PATH
try {
    $explicitExecutable = Join-Path $temporaryDirectory 'explicit-tshark.exe'
    $pathExecutable = Join-Path $temporaryDirectory 'tshark.exe'
    [IO.File]::WriteAllBytes($explicitExecutable, [byte[]]@(0))
    [IO.File]::WriteAllBytes($pathExecutable, [byte[]]@(0))

    $env:PATH = "$temporaryDirectory;$originalProcessPath"
    $explicitResult = Resolve-TsharkPath -ExplicitPath $explicitExecutable
    if ($explicitResult -ne (Resolve-Path -LiteralPath $explicitExecutable).Path) { throw 'Explicit tshark path did not take precedence.' }

    $commandResult = Resolve-TsharkPath
    if ($commandResult -ne (Resolve-Path -LiteralPath $pathExecutable).Path) { throw 'Get-Command tshark.exe resolution failed.' }

    $missingPath = Join-Path $temporaryDirectory 'missing.exe'
    try { Resolve-TsharkPath -ExplicitPath $missingPath | Out-Null; throw 'Missing explicit tshark path was accepted.' }
    catch { if ($_.Exception.Message -eq 'Missing explicit tshark path was accepted.') { throw } }
}
finally {
    $env:PATH = $originalProcessPath
    Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
}

function Invoke-RecorderLifecycleTest {
    param(
        [Parameter(Mandatory = $true)][string]$SampleId,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$InputText,
        [Parameter(Mandatory = $true)][int]$DurationSeconds,
        [Parameter(Mandatory = $true)][string]$ExpectedReason,
        [Parameter(Mandatory = $true)][double]$MinimumElapsedSeconds,
        [Parameter(Mandatory = $true)][string]$FakeTsharkPath
    )
    $inputPath = Join-Path ([IO.Path]::GetTempPath()) ("recorder-input-{0}.txt" -f [guid]::NewGuid().ToString('N'))
    $outputPath = Join-Path ([IO.Path]::GetTempPath()) ("recorder-output-{0}.txt" -f [guid]::NewGuid().ToString('N'))
    [IO.File]::WriteAllText($inputPath, $InputText)
    $recorder = Join-Path $toolsRoot 'record-game-traffic.ps1'
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $recorder), '-Interface', 'test', '-GameVersion', 'test', '-GameSha256', ('0' * 64), '-SampleId', $SampleId, '-DurationSeconds', $DurationSeconds, '-TsharkPath', ('"{0}"' -f $FakeTsharkPath))
    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    $child = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -PassThru -Wait -RedirectStandardInput $inputPath -RedirectStandardOutput $outputPath
    $stopwatch.Stop()
    try {
        if ($child.ExitCode -ne 0) { throw "Recorder lifecycle child failed with code $($child.ExitCode): $(Get-Content -Raw $outputPath)" }
        if ($stopwatch.Elapsed.TotalSeconds -lt $MinimumElapsedSeconds) { throw "Recorder exited too soon after $($stopwatch.Elapsed.TotalSeconds) seconds." }
        $session = Get-ChildItem -LiteralPath (Join-Path $repositoryRoot 'fixtures-private\game') -Directory -Filter "$SampleId-*" | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
        if (-not $session) { throw "No private test session found for $SampleId." }
        $manifest = Get-Content -Raw -LiteralPath (Join-Path $session.FullName 'manifest.private.json') | ConvertFrom-Json
        if ($manifest.stopReason -ne $ExpectedReason) { throw "Expected stop reason $ExpectedReason, got $($manifest.stopReason)." }
        if ($ExpectedReason -eq 'duration-expired' -and $manifest.elapsedMilliseconds -lt ($DurationSeconds * 900)) { throw 'Duration expiry was calculated too early.' }
        $timeline = @(Get-Content -LiteralPath (Join-Path $session.FullName 'operator-timeline.ndjson') | ForEach-Object { $_ | ConvertFrom-Json })
        if ($InputText -match 'READY' -and 'READY' -notin $timeline.marker) { throw "READY marker was not written. Timeline: $($timeline | ConvertTo-Json -Compress) Output: $(Get-Content -Raw $outputPath)" }
        if ($ExpectedReason -eq 'explicit-stop' -and 'STOP' -notin $timeline.marker) { throw 'STOP marker was not written.' }
    }
    finally {
        if ($session -and $session.FullName.StartsWith((Join-Path $repositoryRoot 'fixtures-private\game'), [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $session.FullName -Recurse -Force }
        Remove-Item -LiteralPath $inputPath, $outputPath -Force -ErrorAction SilentlyContinue
    }
}

$lifecycleDirectory = Join-Path ([IO.Path]::GetTempPath()) ("recorder-lifecycle-test-{0}" -f [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $lifecycleDirectory | Out-Null
try {
    $fakeTshark = Join-Path $lifecycleDirectory 'fake-tshark.exe'
    $fakeSource = 'using System; using System.Threading; public static class FakeTshark { public static int Main(string[] args) { Thread.Sleep(60000); return 0; } }'
    Add-Type -TypeDefinition $fakeSource -OutputAssembly $fakeTshark -OutputType ConsoleApplication
    Invoke-RecorderLifecycleTest -SampleId 'EOF-000' -InputText '' -DurationSeconds 2 -ExpectedReason 'duration-expired' -MinimumElapsedSeconds 1.8 -FakeTsharkPath $fakeTshark
    Invoke-RecorderLifecycleTest -SampleId 'RDY-000' -InputText "READY`r`n" -DurationSeconds 1 -ExpectedReason 'duration-expired' -MinimumElapsedSeconds 0.8 -FakeTsharkPath $fakeTshark
    Invoke-RecorderLifecycleTest -SampleId 'STP-000' -InputText "STOP`r`n" -DurationSeconds 30 -ExpectedReason 'explicit-stop' -MinimumElapsedSeconds 0 -FakeTsharkPath $fakeTshark
    $directSession = $null
    try {
        & (Join-Path $toolsRoot 'record-game-traffic.ps1') -Interface 'test' -GameVersion 'test' -GameSha256 ('0' * 64) -SampleId 'DIR-000' -DurationSeconds 1 -TsharkPath $fakeTshark
        $directSession = Get-ChildItem -LiteralPath (Join-Path $repositoryRoot 'fixtures-private\game') -Directory -Filter 'DIR-000-*' | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
        $directManifest = Get-Content -Raw -LiteralPath (Join-Path $directSession.FullName 'manifest.private.json') | ConvertFrom-Json
        if ($directManifest.stopReason -ne 'duration-expired' -or $directManifest.elapsedMilliseconds -lt 900) { throw 'Direct PowerShell invocation did not remain active until duration expiry.' }
    }
    finally {
        if ($directSession -and $directSession.FullName.StartsWith((Join-Path $repositoryRoot 'fixtures-private\game'), [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $directSession.FullName -Recurse -Force }
    }
}
finally {
    Remove-Item -LiteralPath $lifecycleDirectory -Recurse -Force
}

Write-Host 'record-game-traffic PowerShell tests passed.'
