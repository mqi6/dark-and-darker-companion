[CmdletBinding(DefaultParameterSetName='Inspect')]
param(
  [Parameter(ParameterSetName='Inspect',Mandatory=$true)][switch]$Inspect,
  [Parameter(ParameterSetName='Capture',Mandatory=$true)][switch]$Capture,
  [Parameter(ParameterSetName='Capture',Mandatory=$true)][string]$OutputPath,
  [Parameter(ParameterSetName='Click',Mandatory=$true)][switch]$Click,
  [Parameter(ParameterSetName='Click',Mandatory=$true)][string]$ExpectedWindowHandle,
  [Parameter(ParameterSetName='Click',Mandatory=$true)][int]$ExpectedLeft,
  [Parameter(ParameterSetName='Click',Mandatory=$true)][int]$ExpectedTop,
  [Parameter(ParameterSetName='Click',Mandatory=$true)][int]$ExpectedWidth,
  [Parameter(ParameterSetName='Click',Mandatory=$true)][int]$ExpectedHeight,
  [Parameter(ParameterSetName='Click',Mandatory=$true)][int]$X,
  [Parameter(ParameterSetName='Click',Mandatory=$true)][int]$Y
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NavNative {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X,Y; }
 [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public MOUSEINPUT mi; }
 [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx,dy; public uint mouseData,dwFlags,time; public UIntPtr extra; }
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
 [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] p, int size);
 public const uint DOWN=0x0002, UP=0x0004;
}
'@
function Get-State {
 $h=[NavNative]::GetForegroundWindow(); if($h-eq[IntPtr]::Zero){throw 'No foreground window.'}
 [uint32]$foregroundPid=0; [void][NavNative]::GetWindowThreadProcessId($h,[ref]$foregroundPid)
 $p=Get-Process -Id $foregroundPid -ErrorAction Stop
 $r=New-Object NavNative+RECT; if(-not[NavNative]::GetClientRect($h,[ref]$r)){throw 'GetClientRect failed.'}
 $origin=New-Object NavNative+POINT; $origin.X=0;$origin.Y=0;if(-not[NavNative]::ClientToScreen($h,[ref]$origin)){throw 'ClientToScreen failed.'}
 [ordered]@{windowHandle=('0x{0:X}'-f$h.ToInt64());processName=$p.ProcessName;clientBounds=[ordered]@{left=$origin.X;top=$origin.Y;width=$r.Right-$r.Left;height=$r.Bottom-$r.Top};display=[ordered]@{left=[NavNative]::GetSystemMetrics(76);top=[NavNative]::GetSystemMetrics(77);width=[NavNative]::GetSystemMetrics(78);height=[NavNative]::GetSystemMetrics(79)}}
}
function Send-Button([uint32]$flag){$i=New-Object NavNative+INPUT;$i.type=0;$i.mi.dwFlags=$flag;if([NavNative]::SendInput(1,@($i),[Runtime.InteropServices.Marshal]::SizeOf([type][NavNative+INPUT]))-ne 1){throw 'SendInput rejected the foreground click.'}}
$state=Get-State
if($state.processName-ne'DungeonCrawler'){throw 'DungeonCrawler is not the foreground process.'}
if($Inspect){$state|ConvertTo-Json -Depth 5 -Compress;return}
if($Capture){
 $b=$state.clientBounds;$bitmap=New-Object Drawing.Bitmap($b.width,$b.height);$graphics=[Drawing.Graphics]::FromImage($bitmap)
 try{$graphics.CopyFromScreen($b.left,$b.top,0,0,$bitmap.Size);$directory=Split-Path -Parent $OutputPath;if($directory){New-Item -ItemType Directory -Path $directory -Force|Out-Null};$bitmap.Save($OutputPath,[Drawing.Imaging.ImageFormat]::Png)
  $feature=@();for($gy=0;$gy-lt 8;$gy++){for($gx=0;$gx-lt 12;$gx++){$px=[Math]::Min($b.width-1,[Math]::Floor(($gx+0.5)*$b.width/12));$py=[Math]::Min($b.height-1,[Math]::Floor(($gy+0.5)*$b.height/8));$c=$bitmap.GetPixel($px,$py);$feature+=[Math]::Round(($c.R+$c.G+$c.B)/3)}}
  $state.feature=$feature;$state|ConvertTo-Json -Depth 6 -Compress
 }finally{$graphics.Dispose();$bitmap.Dispose()};return
}
if($state.windowHandle-ne$ExpectedWindowHandle-or$state.clientBounds.left-ne$ExpectedLeft-or$state.clientBounds.top-ne$ExpectedTop-or$state.clientBounds.width-ne$ExpectedWidth-or$state.clientBounds.height-ne$ExpectedHeight){throw 'Foreground window identity or client bounds changed.'}
if(-not[NavNative]::SetCursorPos($X,$Y)){throw 'SetCursorPos rejected the point.'}
try{Send-Button([NavNative]::DOWN);Send-Button([NavNative]::UP);[ordered]@{status='clicked';mouseButtonEvents=2}|ConvertTo-Json -Compress}catch{try{Send-Button([NavNative]::UP)}catch{};[ordered]@{status='rejected';diagnosticCode='send-input-rejected'}|ConvertTo-Json -Compress;exit 2}
