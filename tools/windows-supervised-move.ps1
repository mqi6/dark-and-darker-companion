[CmdletBinding(DefaultParameterSetName = 'Inspect')]
param(
    [Parameter(ParameterSetName = 'Inspect', Mandatory = $true)][switch]$Inspect,
    [Parameter(ParameterSetName = 'Cursor', Mandatory = $true)][switch]$Cursor,
    [Parameter(ParameterSetName = 'FocusGame', Mandatory = $true)][switch]$FocusGame,
    [Parameter(ParameterSetName = 'Drag', Mandatory = $true)][switch]$Drag,
    [Parameter(ParameterSetName = 'FocusGame', Mandatory = $true)]
    [Parameter(ParameterSetName = 'Drag', Mandatory = $true)]
    [string]$ExpectedWindowHandle,
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
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool altTab);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll", SetLastError=true)] public static extern bool AttachThreadInput(uint attach, uint attachTo, bool value);
  public const uint INPUT_MOUSE = 0;
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public const uint MOUSEEVENTF_MOVE = 0x0001;
  public const uint MOUSEEVENTF_VIRTUALDESK = 0x4000;
  public const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
  public const int SW_RESTORE = 9;
}
'@

function Convert-WindowHandle([string]$Value) {
    $text = $Value.Trim()
    if ($text.StartsWith('0x', [StringComparison]::OrdinalIgnoreCase)) {
        return [IntPtr]([Convert]::ToInt64($text.Substring(2), 16))
    }
    return [IntPtr]([Convert]::ToInt64($text, 10))
}

function Resolve-GameWindowHandle([string]$ExpectedValue) {
    $expected = Convert-WindowHandle $ExpectedValue
    if ($expected -ne [IntPtr]::Zero) {
        [uint32]$expectedProcessId = 0
        [void][ForegroundMoveNative]::GetWindowThreadProcessId($expected, [ref]$expectedProcessId)
        if ($expectedProcessId -ne 0) {
            $expectedProcess = Get-Process -Id $expectedProcessId -ErrorAction SilentlyContinue
            if ($expectedProcess -and
                $expectedProcess.ProcessName -ieq 'DungeonCrawler' -and
                $expectedProcess.MainWindowHandle -eq $expected) {
                return $expected
            }
        }
    }
    $candidates = @(Get-Process -Name DungeonCrawler -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
    if ($candidates.Count -eq 0) { throw 'No visible DungeonCrawler main window is available.' }
    if ($candidates.Count -ne 1) { throw 'Multiple DungeonCrawler main windows are available; refusing ambiguous binding.' }
    return [IntPtr]$candidates[0].MainWindowHandle
}

function Get-WindowInfo([IntPtr]$Handle) {
    if ($Handle -eq [IntPtr]::Zero) { throw 'No window is available.' }
    $rectangle = New-Object ForegroundMoveNative+RECT
    if (-not [ForegroundMoveNative]::GetWindowRect($Handle, [ref]$rectangle)) { throw 'GetWindowRect failed.' }
    [uint32]$processId = 0
    [void][ForegroundMoveNative]::GetWindowThreadProcessId($Handle, [ref]$processId)
    $process = Get-Process -Id $processId -ErrorAction Stop
    [ordered]@{
        windowHandle = ('0x{0:X}' -f $Handle.ToInt64())
        processId = [int]$processId
        processName = $process.ProcessName
        windowTitle = $process.MainWindowTitle
        isForeground = [ForegroundMoveNative]::GetForegroundWindow() -eq $Handle
        bounds = [ordered]@{
            left = $rectangle.Left
            top = $rectangle.Top
            width = $rectangle.Right - $rectangle.Left
            height = $rectangle.Bottom - $rectangle.Top
        }
        display = [ordered]@{
            virtualLeft = [ForegroundMoveNative]::GetSystemMetrics(76)
            virtualTop = [ForegroundMoveNative]::GetSystemMetrics(77)
            virtualWidth = [ForegroundMoveNative]::GetSystemMetrics(78)
            virtualHeight = [ForegroundMoveNative]::GetSystemMetrics(79)
        }
    }
}

function Get-ForegroundInfo {
    Get-WindowInfo ([ForegroundMoveNative]::GetForegroundWindow())
}

function Set-GameForeground([IntPtr]$TargetHandle) {
    if ($TargetHandle -eq [IntPtr]::Zero) { throw 'Expected game window is unavailable.' }
    if ([ForegroundMoveNative]::IsIconic($TargetHandle)) {
        [void][ForegroundMoveNative]::ShowWindowAsync($TargetHandle, [ForegroundMoveNative]::SW_RESTORE)
    }
    $currentHandle = [ForegroundMoveNative]::GetForegroundWindow()
    [uint32]$unusedProcessId = 0
    $currentThread = if ($currentHandle -eq [IntPtr]::Zero) { 0 } else {
        [ForegroundMoveNative]::GetWindowThreadProcessId($currentHandle, [ref]$unusedProcessId)
    }
    [uint32]$targetProcessId = 0
    $targetThread = [ForegroundMoveNative]::GetWindowThreadProcessId($TargetHandle, [ref]$targetProcessId)
    $callerThread = [ForegroundMoveNative]::GetCurrentThreadId()
    $attachedCurrent = $false
    $attachedTarget = $false
    try {
        if ($currentThread -ne 0 -and $currentThread -ne $callerThread) {
            $attachedCurrent = [ForegroundMoveNative]::AttachThreadInput($callerThread, $currentThread, $true)
        }
        if ($targetThread -ne 0 -and $targetThread -ne $callerThread) {
            $attachedTarget = [ForegroundMoveNative]::AttachThreadInput($callerThread, $targetThread, $true)
        }
        [void][ForegroundMoveNative]::BringWindowToTop($TargetHandle)
        [void][ForegroundMoveNative]::SetForegroundWindow($TargetHandle)
        if ([ForegroundMoveNative]::GetForegroundWindow() -ne $TargetHandle) {
            [ForegroundMoveNative]::SwitchToThisWindow($TargetHandle, $true)
        }
    } finally {
        if ($attachedTarget) { [void][ForegroundMoveNative]::AttachThreadInput($callerThread, $targetThread, $false) }
        if ($attachedCurrent) { [void][ForegroundMoveNative]::AttachThreadInput($callerThread, $currentThread, $false) }
    }
    if ([ForegroundMoveNative]::GetForegroundWindow() -ne $TargetHandle) {
        $shell = New-Object -ComObject WScript.Shell
        try {
            [void]$shell.AppActivate([int]$targetProcessId)
        } finally {
            [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)
        }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(3)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ([ForegroundMoveNative]::GetForegroundWindow() -eq $TargetHandle) { return }
        Start-Sleep -Milliseconds 50
    }
    throw 'Windows did not grant foreground activation to the game window.'
}

function Send-MouseInput([int]$Dx, [int]$Dy, [uint32]$Flag) {
    $mouse = New-Object ForegroundMoveNative+MOUSEINPUT
    $mouse.dx = $Dx; $mouse.dy = $Dy; $mouse.dwFlags = $Flag
    $union = New-Object ForegroundMoveNative+INPUTUNION
    $union.mi = $mouse
    $input = New-Object ForegroundMoveNative+INPUT
    $input.type = [ForegroundMoveNative]::INPUT_MOUSE
    $input.union = $union
    $sent = [ForegroundMoveNative]::SendInput(
        1,
        @($input),
        [Runtime.InteropServices.Marshal]::SizeOf([type][ForegroundMoveNative+INPUT])
    )
    if ($sent -ne 1) { throw 'SendInput rejected the foreground mouse event.' }
}

function Send-LeftButton([uint32]$Flag) {
    Send-MouseInput 0 0 $Flag
}

function Move-Absolute([int]$X, [int]$Y) {
    $left = [ForegroundMoveNative]::GetSystemMetrics(76)
    $top = [ForegroundMoveNative]::GetSystemMetrics(77)
    $width = [ForegroundMoveNative]::GetSystemMetrics(78)
    $height = [ForegroundMoveNative]::GetSystemMetrics(79)
    if ($X -lt $left -or $Y -lt $top -or $X -ge ($left + $width) -or $Y -ge ($top + $height)) {
        throw 'Drag point is outside the virtual desktop.'
    }
    $absoluteX = [int][Math]::Round(($X - $left) * 65535 / [Math]::Max(1, $width - 1))
    $absoluteY = [int][Math]::Round(($Y - $top) * 65535 / [Math]::Max(1, $height - 1))
    $flags = [ForegroundMoveNative]::MOUSEEVENTF_MOVE -bor
        [ForegroundMoveNative]::MOUSEEVENTF_ABSOLUTE -bor
        [ForegroundMoveNative]::MOUSEEVENTF_VIRTUALDESK
    Send-MouseInput $absoluteX $absoluteY $flags
}

if ($Inspect) {
    Get-ForegroundInfo | ConvertTo-Json -Depth 5 -Compress
    return
}

if ($Cursor) {
    $info = Get-ForegroundInfo
    $point = New-Object ForegroundMoveNative+POINT
    if (-not [ForegroundMoveNative]::GetCursorPos([ref]$point)) { throw 'GetCursorPos failed.' }
    $info.cursor = [ordered]@{ x = $point.X; y = $point.Y }
    $info | ConvertTo-Json -Depth 5 -Compress
    return
}

$targetHandle = Resolve-GameWindowHandle $ExpectedWindowHandle
$resolvedExpectedWindowHandle = '0x{0:X}' -f $targetHandle.ToInt64()
if ($FocusGame) {
    Set-GameForeground $targetHandle
    Get-WindowInfo $targetHandle | ConvertTo-Json -Depth 5 -Compress
    return
}

$inputDispatched = $false
try {
    Set-GameForeground $targetHandle
    $foreground = Get-ForegroundInfo
    $expected = [ordered]@{
        left = $ExpectedLeft; top = $ExpectedTop
        width = $ExpectedWidth; height = $ExpectedHeight
    }
    if ($foreground.windowHandle -ne $resolvedExpectedWindowHandle) { throw 'Foreground window identity changed.' }
    if ($foreground.bounds.left -ne $expected.left -or $foreground.bounds.top -ne $expected.top -or
        $foreground.bounds.width -ne $expected.width -or $foreground.bounds.height -ne $expected.height) {
        throw 'Foreground window bounds changed.'
    }
    Move-Absolute $SourceX $SourceY
    Start-Sleep -Milliseconds 50
    $sourceCursorPoint = New-Object ForegroundMoveNative+POINT
    if (-not [ForegroundMoveNative]::GetCursorPos([ref]$sourceCursorPoint) -or
        [Math]::Abs($sourceCursorPoint.X - $SourceX) -gt 2 -or [Math]::Abs($sourceCursorPoint.Y - $SourceY) -gt 2) {
        throw 'Source cursor verification failed.'
    }
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
    [ordered]@{
        status = 'dispatched'
        inputMayHaveBeenDispatched = $true
        mouseButtonEvents = 2
        foregroundRestored = $true
        coordinateSpace = 'virtual-desktop'
    } | ConvertTo-Json -Compress
} catch {
    if ($inputDispatched) {
        try { Send-LeftButton ([ForegroundMoveNative]::MOUSEEVENTF_LEFTUP) } catch {}
    }
    [ordered]@{
        status = 'failed'
        diagnosticCode = 'ordinary-foreground-input-failed'
        detail = $_.Exception.Message
        inputMayHaveBeenDispatched = $inputDispatched
    } | ConvertTo-Json -Compress
    exit 2
}
