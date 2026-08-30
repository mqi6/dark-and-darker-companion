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
 [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx,dy; public uint mouseData,dwFlags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; }
 [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION union; }
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
 [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
 [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint n, INPUT[] p, int size);
 public const uint MOVE=0x0001, DOWN=0x0002, UP=0x0004, ABSOLUTE=0x8000;
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
function Send-MouseInput([int]$dx,[int]$dy,[uint32]$flags){
 $mouse=New-Object NavNative+MOUSEINPUT;$mouse.dx=$dx;$mouse.dy=$dy;$mouse.dwFlags=$flags
 $union=New-Object NavNative+INPUTUNION;$union.mi=$mouse
 $input=New-Object NavNative+INPUT;$input.type=0;$input.union=$union
 $sent=[NavNative]::SendInput(1,@($input),[Runtime.InteropServices.Marshal]::SizeOf([type][NavNative+INPUT]))
 if($sent-ne 1){$errorCode=[Runtime.InteropServices.Marshal]::GetLastWin32Error();throw "SendInput rejected mouse event (Win32 $errorCode)."}
}
function Move-MouseLikeDnDTools([int]$targetX,[int]$targetY){
 $screenWidth=[NavNative]::GetSystemMetrics(0);$screenHeight=[NavNative]::GetSystemMetrics(1)
 if($targetX-lt 0-or$targetY-lt 0-or$targetX-ge$screenWidth-or$targetY-ge$screenHeight){throw 'DnDTools-compatible input requires the target inside the primary display.'}
 $absoluteX=[int][Math]::Round($targetX*65535/[Math]::Max(1,$screenWidth-1))
 $absoluteY=[int][Math]::Round($targetY*65535/[Math]::Max(1,$screenHeight-1))
 Send-MouseInput $absoluteX $absoluteY ([NavNative]::MOVE-bor[NavNative]::ABSOLUTE)
 Start-Sleep -Milliseconds 50
 $cursor=New-Object NavNative+POINT;if(-not[NavNative]::GetCursorPos([ref]$cursor)){throw 'GetCursorPos failed after SendInput movement.'}
 if([Math]::Abs($cursor.X-$targetX)-gt 2-or[Math]::Abs($cursor.Y-$targetY)-gt 2){throw 'SendInput cursor verification failed.'}
}
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
$buttonHeld=$false
try{
 Move-MouseLikeDnDTools $X $Y
 Send-MouseInput 0 0 ([NavNative]::DOWN);$buttonHeld=$true
 Start-Sleep -Milliseconds 30
 Send-MouseInput 0 0 ([NavNative]::UP);$buttonHeld=$false
 Start-Sleep -Milliseconds 150
 [ordered]@{status='clicked';inputMethod='dndtools-sendinput';mouseMoveEvents=1;mouseButtonEvents=2}|ConvertTo-Json -Compress
}catch{
 if($buttonHeld){try{Send-MouseInput 0 0 ([NavNative]::UP)}catch{}}
 [ordered]@{status='rejected';diagnosticCode='dndtools-send-input-rejected';detail=$_.Exception.Message}|ConvertTo-Json -Compress
 exit 2
}
