[CmdletBinding(DefaultParameterSetName = 'Inspect')]
param(
    [Parameter(ParameterSetName = 'Inspect', Mandatory = $true)][switch]$Inspect,
    [Parameter(ParameterSetName = 'Cursor', Mandatory = $true)][switch]$Cursor,
    [Parameter(ParameterSetName = 'Drag', Mandatory = $true)][switch]$Drag,
    [Parameter(ParameterSetName = 'Drag', Mandatory = $true)][string]$ExpectedWindowHandle,
    [Parameter(ParameterSetName = 'Drag', Mandatory = $true)][int]$ExpectedLeft,
    [Parameter(ParameterSetName = 'Drag', Mandatory = $true)][int]$ExpectedTop,
    [Parameter(ParameterSetName = 'Drag', Mandatory = $true)][int]$ExpectedWidth,
    [Parameter(ParameterSetName = 'Drag', Mandatory = $true)][int]$ExpectedHeight,
    [Parameter(ParameterSetName = 'Drag', Mandatory = $true)][int]$SourceX,
    [Parameter(ParameterSetName = 'Drag', Mandatory = $true)][int]$SourceY,
    [Parameter(ParameterSetName = 'Drag', Mandatory = $true)][int]$DestinationX,
    [Parameter(ParameterSetName = 'Drag', Mandatory = $true)][int]$DestinationY,
    [Parameter(ParameterSetName = 'Drag')][ValidateRange(100, 2000)][int]$DurationMilliseconds = 350
)

$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ForegroundMoveNative {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public UIntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION union; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", SetLastError=true)] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  public const uint INPUT_MOUSE = 0;
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public const uint MOUSEEVENTF_MOVE = 0x0001;
  public const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
}
'@

function Get-ForegroundInfo {
    $handle = [ForegroundMoveNative]::GetForegroundWindow()
    if ($handle -eq [IntPtr]::Zero) { throw 'No foreground window is available.' }
    $rectangle = New-Object ForegroundMoveNative+RECT
    if (-not [ForegroundMoveNative]::GetWindowRect($handle, [ref]$rectangle)) { throw 'GetWindowRect failed.' }
    [uint32]$foregroundProcessId = 0
    [void][ForegroundMoveNative]::GetWindowThreadProcessId($handle, [ref]$foregroundProcessId)
    $process = Get-Process -Id $foregroundProcessId -ErrorAction Stop
    [ordered]@{
        windowHandle = ('0x{0:X}' -f $handle.ToInt64())
        processId = [int]$foregroundProcessId
        processName = $process.ProcessName
        windowTitle = $process.MainWindowTitle
        bounds = [ordered]@{ left=$rectangle.Left; top=$rectangle.Top; width=$rectangle.Right-$rectangle.Left; height=$rectangle.Bottom-$rectangle.Top }
        display = [ordered]@{
            virtualLeft = [ForegroundMoveNative]::GetSystemMetrics(76)
            virtualTop = [ForegroundMoveNative]::GetSystemMetrics(77)
            virtualWidth = [ForegroundMoveNative]::GetSystemMetrics(78)
            virtualHeight = [ForegroundMoveNative]::GetSystemMetrics(79)
        }
    }
}

function Send-LeftButton([uint32]$Flag) {
    Send-MouseInput 0 0 $Flag
}

function Send-MouseInput([int]$Dx, [int]$Dy, [uint32]$Flag) {
    $mouse = New-Object ForegroundMoveNative+MOUSEINPUT
    $mouse.dx = $Dx; $mouse.dy = $Dy; $mouse.dwFlags = $Flag
    $union = New-Object ForegroundMoveNative+INPUTUNION
    $union.mi = $mouse
    $input = New-Object ForegroundMoveNative+INPUT
    $input.type = [ForegroundMoveNative]::INPUT_MOUSE
    $input.union = $union
    $sent = [ForegroundMoveNative]::SendInput(1, @($input), [Runtime.InteropServices.Marshal]::SizeOf([type][ForegroundMoveNative+INPUT]))
    if ($sent -ne 1) { throw 'SendInput rejected the foreground mouse-button event.' }
}

function Move-Absolute([int]$X, [int]$Y) {
    $width = [ForegroundMoveNative]::GetSystemMetrics(0); $height = [ForegroundMoveNative]::GetSystemMetrics(1)
    if ($X -lt 0 -or $Y -lt 0 -or $X -ge $width -or $Y -ge $height) { throw 'Drag point is outside the primary display.' }
    $absoluteX = [int][Math]::Round($X * 65535 / [Math]::Max(1, $width - 1))
    $absoluteY = [int][Math]::Round($Y * 65535 / [Math]::Max(1, $height - 1))
    Send-MouseInput $absoluteX $absoluteY ([ForegroundMoveNative]::MOUSEEVENTF_MOVE -bor [ForegroundMoveNative]::MOUSEEVENTF_ABSOLUTE)
}

if ($Inspect) {
    Get-ForegroundInfo | ConvertTo-Json -Depth 5 -Compress
    return
}

if ($Cursor) {
    $info = Get-ForegroundInfo
    $point = New-Object ForegroundMoveNative+POINT
    if (-not [ForegroundMoveNative]::GetCursorPos([ref]$point)) { throw 'GetCursorPos failed.' }
    $info.cursor = [ordered]@{ x=$point.X; y=$point.Y }
    $info | ConvertTo-Json -Depth 5 -Compress
    return
}

$inputDispatched = $false
try {
    $foreground = Get-ForegroundInfo
    $expected = [ordered]@{ left=$ExpectedLeft; top=$ExpectedTop; width=$ExpectedWidth; height=$ExpectedHeight }
    if ($foreground.windowHandle -ne $ExpectedWindowHandle) { throw 'Foreground window identity changed.' }
    if ($foreground.bounds.left -ne $expected.left -or $foreground.bounds.top -ne $expected.top -or $foreground.bounds.width -ne $expected.width -or $foreground.bounds.height -ne $expected.height) { throw 'Foreground window bounds changed.' }
    Move-Absolute $SourceX $SourceY
    Start-Sleep -Milliseconds 50
    $cursor = New-Object ForegroundMoveNative+POINT
    if (-not [ForegroundMoveNative]::GetCursorPos([ref]$cursor) -or [Math]::Abs($cursor.X-$SourceX)-gt 2 -or [Math]::Abs($cursor.Y-$SourceY)-gt 2) { throw 'Source cursor verification failed.' }
    Send-LeftButton ([ForegroundMoveNative]::MOUSEEVENTF_LEFTDOWN)
    $inputDispatched = $true
    $steps = [Math]::Max(2, [Math]::Ceiling($DurationMilliseconds / 16))
    for ($index = 1; $index -le $steps; $index++) {
        $ratio = $index / $steps
        $x = [Math]::Round($SourceX + ($DestinationX - $SourceX) * $ratio)
        $y = [Math]::Round($SourceY + ($DestinationY - $SourceY) * $ratio)
        Move-Absolute $x $y
        Start-Sleep -Milliseconds ([Math]::Max(1, [Math]::Floor($DurationMilliseconds / $steps)))
    }
    Send-LeftButton ([ForegroundMoveNative]::MOUSEEVENTF_LEFTUP)
    Start-Sleep -Milliseconds 150
    [ordered]@{ status='dispatched'; inputMayHaveBeenDispatched=$true; mouseButtonEvents=2 } | ConvertTo-Json -Compress
} catch {
    if ($inputDispatched) {
        try { Send-LeftButton ([ForegroundMoveNative]::MOUSEEVENTF_LEFTUP) } catch {}
    }
    [ordered]@{ status='failed'; diagnosticCode='ordinary-foreground-input-failed'; inputMayHaveBeenDispatched=$inputDispatched } | ConvertTo-Json -Compress
    exit 2
}
