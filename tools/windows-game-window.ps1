# Shared game-window discovery. Call Resolve-GameWindowHandle for every request;
# no HWND from operator startup is trusted as current.
Add-Type -TypeDefinition @'
using System; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class SharedGameWindowNative {
 public delegate bool Callback(IntPtr h, IntPtr p);
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback c, IntPtr p);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
 [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out RECT r);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int n);
 public static IntPtr[] Candidates() { var values=new List<IntPtr>(); EnumWindows((h,p)=>{values.Add(h);return true;},IntPtr.Zero);return values.ToArray(); }
 public static bool IsRoot(IntPtr h) { return GetAncestor(h,2)==h; }
 public static bool HasClient(IntPtr h) { RECT r; return GetClientRect(h,out r)&&r.Right>r.Left&&r.Bottom>r.Top; }
 public static bool IsRendered(IntPtr h) { return IsWindowVisible(h)&&!IsCloaked(h); }
 public static bool IsCloaked(IntPtr h) { int v=0; return DwmGetWindowAttribute(h,14,out v,4)==0&&v!=0; }
}
'@
function Resolve-GameWindowHandle([string]$ExpectedValue) {
  $operatorSession = (Get-Process -Id $PID).SessionId
  # Revalidate the last-known HWND first. This is not a cache: it is resolved
  # to a live PID and checked on every request; enumeration is the stale fallback.
  $expected = if ($ExpectedValue) { Convert-WindowHandle $ExpectedValue } else { [IntPtr]::Zero }
  if ($expected -ne [IntPtr]::Zero) {
    [uint32]$expectedPid = 0
    [void][SharedGameWindowNative]::GetWindowThreadProcessId($expected, [ref]$expectedPid)
    $expectedProcess = if ($expectedPid -ne 0) { Get-Process -Id $expectedPid -ErrorAction SilentlyContinue } else { $null }
    if ($expectedProcess -and $expectedProcess.SessionId -eq $operatorSession -and
        $expectedProcess.ProcessName -ieq 'DungeonCrawler' -and
        [SharedGameWindowNative]::IsRoot($expected) -and
        [SharedGameWindowNative]::HasClient($expected) -and
        [SharedGameWindowNative]::IsRendered($expected)) { return $expected }
  }
  $valid = @()
  foreach ($handle in [SharedGameWindowNative]::Candidates()) {
    [uint32]$candidatePid = 0
    [void][SharedGameWindowNative]::GetWindowThreadProcessId($handle, [ref]$candidatePid)
    if ($candidatePid -eq 0) { continue }
    $candidateProcess = Get-Process -Id $candidatePid -ErrorAction SilentlyContinue
    if (-not $candidateProcess -or $candidateProcess.SessionId -ne $operatorSession) { continue }
    $path = try { $candidateProcess.Path } catch { $null }
    $verifiedIdentity = $candidateProcess.ProcessName -ieq 'DungeonCrawler' -or
      ($path -and $path.EndsWith('\DungeonCrawler.exe', [StringComparison]::OrdinalIgnoreCase))
    if (-not $verifiedIdentity -or -not [SharedGameWindowNative]::IsRoot($handle) -or
        -not [SharedGameWindowNative]::HasClient($handle) -or -not [SharedGameWindowNative]::IsRendered($handle)) { continue }
    $valid += $handle
  }
  if ($valid.Count -eq 0) { throw 'No rendered DungeonCrawler window is available on the operator desktop.' }
  if ($valid.Count -ne 1) { throw 'Multiple rendered DungeonCrawler windows are available; refusing ambiguous binding.' }
  return [IntPtr]$valid[0]
}
