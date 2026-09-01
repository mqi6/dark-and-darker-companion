[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class TopLevelWindowDiagnosticNative {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr parameter);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd, uint command);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder value, int maximum);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder value, int maximum);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attribute, out int value, int size);
  public static IntPtr[] Enumerate() { var values = new List<IntPtr>(); EnumWindows((h,p) => { values.Add(h); return true; }, IntPtr.Zero); return values.ToArray(); }
}
'@

function Format-Handle([IntPtr]$Value) { '0x{0:X}' -f $Value.ToInt64() }
function Get-Integrity([int]$ProcessId) {
  try {
    $command = "(Get-Process -Id $ProcessId).Path"
    $path = [string](Invoke-Expression $command)
    $null = $path
    # Access to an elevated process path is denied from a lower-integrity operator.
    return 'accessible'
  } catch { return 'access-denied' }
}

$windows = foreach ($hwnd in [TopLevelWindowDiagnosticNative]::Enumerate()) {
  [uint32]$processId = 0
  [void][TopLevelWindowDiagnosticNative]::GetWindowThreadProcessId($hwnd, [ref]$processId)
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  $class = [Text.StringBuilder]::new(512); [void][TopLevelWindowDiagnosticNative]::GetClassName($hwnd, $class, $class.Capacity)
  $title = [Text.StringBuilder]::new(2048); [void][TopLevelWindowDiagnosticNative]::GetWindowText($hwnd, $title, $title.Capacity)
  $windowRect = New-Object TopLevelWindowDiagnosticNative+RECT
  $clientRect = New-Object TopLevelWindowDiagnosticNative+RECT
  $origin = New-Object TopLevelWindowDiagnosticNative+POINT
  $windowReady = [TopLevelWindowDiagnosticNative]::GetWindowRect($hwnd, [ref]$windowRect)
  $clientReady = [TopLevelWindowDiagnosticNative]::GetClientRect($hwnd, [ref]$clientRect)
  $originReady = [TopLevelWindowDiagnosticNative]::ClientToScreen($hwnd, [ref]$origin)
  $cloaked = 0; $dwmResult = [TopLevelWindowDiagnosticNative]::DwmGetWindowAttribute($hwnd, 14, [ref]$cloaked, 4)
  $executablePath = try { $process.Path } catch { $null }
  [ordered]@{
    hwnd = Format-Handle $hwnd
    pid = [int]$processId
    processName = $process.ProcessName
    executablePath = $executablePath
    sessionId = $process.SessionId
    integrityAccess = Get-Integrity ([int]$processId)
    windowClass = $class.ToString()
    title = $title.ToString()
    isVisible = [TopLevelWindowDiagnosticNative]::IsWindowVisible($hwnd)
    isIconic = [TopLevelWindowDiagnosticNative]::IsIconic($hwnd)
    isCloaked = if ($dwmResult -eq 0) { $cloaked -ne 0 } else { $null }
    rootHwnd = Format-Handle ([TopLevelWindowDiagnosticNative]::GetAncestor($hwnd, 2))
    ownerHwnd = Format-Handle ([TopLevelWindowDiagnosticNative]::GetWindow($hwnd, 4))
    windowBounds = if ($windowReady) { [ordered]@{ left=$windowRect.Left; top=$windowRect.Top; width=$windowRect.Right-$windowRect.Left; height=$windowRect.Bottom-$windowRect.Top } } else { $null }
    clientBounds = if ($clientReady -and $originReady) { [ordered]@{ left=$origin.X; top=$origin.Y; width=$clientRect.Right-$clientRect.Left; height=$clientRect.Bottom-$clientRect.Top } } else { $null }
  }
}
$document = [ordered]@{ schemaVersion=1; capturedAt=(Get-Date).ToUniversalTime().ToString('o'); operatorSessionId=(Get-Process -Id $PID).SessionId; windows=@($windows) }
$directory = Split-Path -Parent $OutputPath
if ($directory) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
$document | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding utf8
[ordered]@{ status='written'; windowCount=@($windows).Count } | ConvertTo-Json -Compress
