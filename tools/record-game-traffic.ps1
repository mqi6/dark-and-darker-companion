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
if ($ListInterfaces) { & $resolvedTsharkPath -D; return }

$repoRoot = Split-Path -Parent $PSScriptRoot
$sessionId = '{0}-{1}-{2}' -f $SampleId, (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
$sessionDir = Join-Path $repoRoot "fixtures-private\game\$sessionId"
New-Item -ItemType Directory -Path $sessionDir | Out-Null
$capturePath = Join-Path $sessionDir 'capture.pcapng'
$timelinePath = Join-Path $sessionDir 'operator-timeline.ndjson'
$logPath = Join-Path $sessionDir 'recorder.log'
$stderrPath = Join-Path $sessionDir 'tshark.stderr.log'
$manifestPath = Join-Path $sessionDir 'manifest.private.json'
$captureFilter = 'tcp portrange 20200-20300'
$arguments = @('-i', $Interface, '-f', ('"{0}"' -f $captureFilter), '-w', ('"{0}"' -f $capturePath), '-q')
$commandDisplay = '"{0}" -i {1} -f "{2}" -w "{3}" -q' -f $resolvedTsharkPath, $Interface, $captureFilter, $capturePath
$localAddresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { -not $_.IPAddress.StartsWith('127.') } | Select-Object -ExpandProperty IPAddress
$addressHash = if ($localAddresses) { $joined = ($localAddresses | Sort-Object) -join ','; (Get-FileHash -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($joined))) -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null }
$startedUtc = (Get-Date).ToUniversalTime()
$clock = [System.Diagnostics.Stopwatch]::StartNew()
$manifest = [ordered]@{ recorderVersion='1.1.0'; sessionId=$sessionId; interface=$Interface; tsharkPath=$resolvedTsharkPath; tsharkCommand=$commandDisplay; captureFilter=$captureFilter; directions=@('client-to-server','server-to-client'); gameVersion=$GameVersion; gameSha256=$GameSha256.ToLowerInvariant(); localIpHash=$addressHash; notes=$Notes; startUtc=$startedUtc.ToString('o'); startMonotonicMilliseconds=0; endUtc=$null; elapsedMilliseconds=$null; stopReason=$null; tsharkPid=$null; tsharkExitCode=$null; tsharkStderrPreview=$null }

function Write-RecorderLog([string]$Event, [string]$Detail = '') {
    [ordered]@{ utc=(Get-Date).ToUniversalTime().ToString('o'); monotonicMilliseconds=[math]::Round($clock.Elapsed.TotalMilliseconds, 3); event=$Event; detail=$Detail } | ConvertTo-Json -Compress | Add-Content -LiteralPath $logPath -Encoding utf8
}
function Write-Marker([string]$Marker) {
    if ($Marker -notin @('READY','ACTION_START','ACTION_END','STOP')) { Write-Warning "Unknown marker ignored: $Marker"; Write-RecorderLog 'marker-ignored' $Marker; return }
    [ordered]@{ marker=$Marker; utc=(Get-Date).ToUniversalTime().ToString('o'); monotonicMilliseconds=$clock.Elapsed.TotalMilliseconds } | ConvertTo-Json -Compress | Add-Content -LiteralPath $timelinePath -Encoding utf8
    Write-RecorderLog 'marker' $Marker
}

$process = $null
$stopReason = 'ctrl-c'
$childFailureMessage = $null
$inputTask = $null
$inputReader = $null
$stdinEnded = $false
try {
    Write-RecorderLog 'start' "UTC=$($startedUtc.ToString('o')); monotonicMilliseconds=0"
    Write-RecorderLog 'tshark-command' $commandDisplay
    $process = Start-Process -FilePath $resolvedTsharkPath -ArgumentList $arguments -PassThru -NoNewWindow -RedirectStandardError $stderrPath
    $manifest.tsharkPid = $process.Id
    Write-RecorderLog 'tshark-pid' ([string]$process.Id)
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8
    Write-Host "Private session: $sessionDir"
    Write-Host "Resolved tshark: $resolvedTsharkPath"
    Write-Host "tshark command: $commandDisplay"
    Write-Host "tshark PID: $($process.Id). Enter READY, ACTION_START, ACTION_END, or STOP. Ctrl+C also stops safely."
    $inputReader = [IO.StreamReader]::new([Console]::OpenStandardInput())
    $inputTask = $inputReader.ReadLineAsync()
    while ($true) {
        $process.Refresh()
        if ($process.HasExited) { $stopReason = 'tshark-child-failure'; break }
        if ($DurationSeconds -gt 0 -and $clock.Elapsed.TotalSeconds -ge $DurationSeconds) { $stopReason = 'duration-expired'; Write-Marker 'STOP'; break }
        if (-not $stdinEnded -and $inputTask.IsCompleted) {
            $line = $inputTask.GetAwaiter().GetResult()
            if ($null -eq $line) { $stdinEnded = $true; Write-RecorderLog 'stdin-eof' 'Ignored; capture remains active.' }
            else {
                $marker = $line.Trim().ToUpperInvariant()
                if ($marker.Length -gt 0) { Write-Marker $marker; if ($marker -eq 'STOP') { $stopReason = 'explicit-stop'; break } }
                else { Write-RecorderLog 'stdin-empty' 'Ignored; capture remains active.' }
                $inputTask = $inputReader.ReadLineAsync()
            }
        }
        Start-Sleep -Milliseconds 50
    }
}
finally {
    if ($process -and -not $process.HasExited) {
        Write-RecorderLog 'cleanup-child' "Stopping exact PID $($process.Id)."
        Stop-Process -Id $process.Id
        $process.WaitForExit(5000) | Out-Null
        $process.Refresh()
    }
    if ($process -and $process.HasExited) { $manifest.tsharkExitCode = $process.ExitCode }
    if ($stopReason -eq 'tshark-child-failure') {
        $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -Raw -LiteralPath $stderrPath } else { '' }
        if ($stderr.Length -gt 4096) { $stderr = $stderr.Substring(0, 4096) }
        $manifest.tsharkStderrPreview = $stderr
        $childFailureMessage = "tshark exited unexpectedly with code $($manifest.tsharkExitCode). $stderr"
        Write-RecorderLog 'tshark-child-failure' $childFailureMessage
    }
    $clock.Stop()
    $manifest.endUtc = (Get-Date).ToUniversalTime().ToString('o')
    $manifest.elapsedMilliseconds = [math]::Round($clock.Elapsed.TotalMilliseconds, 3)
    $manifest.stopReason = $stopReason
    Write-RecorderLog 'stop' "reason=$stopReason; elapsedMilliseconds=$($manifest.elapsedMilliseconds); tsharkExitCode=$($manifest.tsharkExitCode)"
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding utf8
    Write-Host "Recording stopped: $stopReason after $([math]::Round($clock.Elapsed.TotalSeconds, 3)) seconds. Private output remains at: $sessionDir"
}
if ($childFailureMessage) { throw $childFailureMessage }
