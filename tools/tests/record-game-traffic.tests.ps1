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

Write-Host 'record-game-traffic PowerShell tests passed.'
