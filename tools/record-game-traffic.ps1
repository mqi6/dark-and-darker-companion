[CmdletBinding(DefaultParameterSetName = 'Record')]
param(
    [Parameter(ParameterSetName = 'List', Mandatory = $true)][switch]$ListInterfaces,
    [Parameter(ParameterSetName = 'Record', Mandatory = $true)][string]$Interface,
    [Parameter(ParameterSetName = 'Record', Mandatory = $true)][string]$GameVersion,
    [Parameter(ParameterSetName = 'Record', Mandatory = $true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$GameSha256,
    [Parameter(ParameterSetName = 'Record')][ValidatePattern('^[A-Z]+-[0-9]{3}$')][string]$SampleId = 'NET-000',
    [Parameter(ParameterSetName = 'Record')][ValidateRange(0, 86400)][int]$DurationSeconds = 0,
    [Parameter(ParameterSetName = 'Record')][string]$Notes = '',
    [string]$TsharkPath
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'windows-tshark.ps1')
$resolvedTsharkPath = Resolve-TsharkPath -ExplicitPath $TsharkPath
Write-Host "Resolved tshark: $resolvedTsharkPath"
if ($ListInterfaces) { & $resolvedTsharkPath -D; exit $LASTEXITCODE }

$repoRoot = Split-Path -Parent $PSScriptRoot
$sessionId = '{0}-{1}-{2}' -f $SampleId, (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
$sessionDir = Join-Path $repoRoot "fixtures-private\game\$sessionId"
New-Item -ItemType Directory -Path $sessionDir | Out-Null
$capturePath = Join-Path $sessionDir 'capture.pcapng'
$timelinePath = Join-Path $sessionDir 'operator-timeline.ndjson'
$logPath = Join-Path $sessionDir 'recorder.log'
$manifestPath = Join-Path $sessionDir 'manifest.private.json'
$startedUtc = (Get-Date).ToUniversalTime()
$clock = [System.Diagnostics.Stopwatch]::StartNew()
$localAddresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { -not $_.IPAddress.StartsWith('127.') } | Select-Object -ExpandProperty IPAddress
$addressHash = if ($localAddresses) { $joined = ($localAddresses | Sort-Object) -join ','; (Get-FileHash -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($joined))) -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null }
$manifest = [ordered]@{ recorderVersion='1.0.1'; sessionId=$sessionId; interface=$Interface; tsharkPath=$resolvedTsharkPath; captureFilter='tcp portrange 20200-20300'; directions=@('client-to-server','server-to-client'); gameVersion=$GameVersion; gameSha256=$GameSha256.ToLowerInvariant(); localIpHash=$addressHash; notes=$Notes; startUtc=$startedUtc.ToString('o'); endUtc=$null; tsharkPid=$null; exitCode=$null }
function Write-Marker([string]$Marker) {
    if ($Marker -notin @('READY','ACTION_START','ACTION_END','STOP')) { throw "Unknown marker: $Marker" }
    [ordered]@{ marker=$Marker; utc=(Get-Date).ToUniversalTime().ToString('o'); monotonicMilliseconds=$clock.Elapsed.TotalMilliseconds } | ConvertTo-Json -Compress | Add-Content -LiteralPath $timelinePath -Encoding utf8
}

$process = $null
$stopWritten = $false
try {
    $arguments = @('-i', $Interface, '-f', 'tcp portrange 20200-20300', '-w', $capturePath, '-q')
    $process = Start-Process -FilePath $resolvedTsharkPath -ArgumentList $arguments -PassThru -NoNewWindow -RedirectStandardError $logPath
    $manifest.tsharkPid = $process.Id
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8
    Write-Host "Private session: $sessionDir"
    Write-Host "Resolved tshark: $resolvedTsharkPath"
    Write-Host "tshark PID: $($process.Id). Enter READY, ACTION_START, ACTION_END, or STOP. Ctrl+C also stops safely."
    while (-not $process.HasExited) {
        if ($DurationSeconds -gt 0 -and $clock.Elapsed.TotalSeconds -ge $DurationSeconds) { Write-Marker 'STOP'; $stopWritten = $true; break }
        if ([Console]::KeyAvailable) { $marker = Read-Host 'marker'; if ($marker) { $marker = $marker.Trim().ToUpperInvariant(); Write-Marker $marker; if ($marker -eq 'STOP') { $stopWritten = $true; break } } }
        Start-Sleep -Milliseconds 100
        $process.Refresh()
    }
}
finally {
    if (-not $stopWritten) { Write-Marker 'STOP' }
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id; $process.WaitForExit(5000) | Out-Null }
    $clock.Stop(); $manifest.endUtc = (Get-Date).ToUniversalTime().ToString('o'); if ($process -and $process.HasExited) { $manifest.exitCode = $process.ExitCode }; $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8
    Write-Host "Recording stopped. Private output remains at: $sessionDir"
}
