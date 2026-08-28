function Resolve-TsharkPath {
    [CmdletBinding()]
    param([AllowNull()][AllowEmptyString()][string]$ExplicitPath)

    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
        if (-not (Test-Path -LiteralPath $ExplicitPath -PathType Leaf)) {
            throw "The explicit tshark path does not exist or is not a file: $ExplicitPath"
        }
        return (Resolve-Path -LiteralPath $ExplicitPath).Path
    }

    $command = Get-Command 'tshark.exe' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) {
        $commandPath = if ($command.Path) { $command.Path } else { $command.Source }
        if ($commandPath -and (Test-Path -LiteralPath $commandPath -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $commandPath).Path
        }
    }

    $installedCandidates = @(
        'C:\Program Files\Wireshark\tshark.exe',
        'C:\Program Files (x86)\Wireshark\tshark.exe'
    )
    foreach ($candidate in $installedCandidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw 'tshark.exe was not found. Pass -TsharkPath or install Wireshark in its standard Windows location.'
}
