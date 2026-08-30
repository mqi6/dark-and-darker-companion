import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("tools/windows-supervised-move.ps1", "utf8");

describe("Windows supervised drag input contract", () => {
  it("uses virtual-desktop absolute SendInput with a correctly aligned native union", () => {
    expect(source).toContain("LayoutKind.Explicit");
    expect(source).toContain("MOUSEEVENTF_ABSOLUTE");
    expect(source).toContain("MOUSEEVENTF_VIRTUALDESK");
    expect(source).toContain("GetSystemMetrics(76)");
    expect(source).toContain("SendInput");
    expect(source).not.toContain("SetCursorPos");
    expect(source).not.toContain("outside the primary display");
  });

  it("restores and verifies the expected game foreground before input", () => {
    expect(source).toContain("function Set-GameForeground");
    expect(source).toContain("SetForegroundWindow");
    expect(source).toContain("SwitchToThisWindow($TargetHandle, $true)");
    expect(source).toContain("$shell.AppActivate([int]$targetProcessId)");
    expect(source).toContain("function Resolve-GameWindowHandle");
    expect(source).toContain("Multiple DungeonCrawler main windows are available; refusing ambiguous binding.");
    expect(source).toContain("$targetHandle = Resolve-GameWindowHandle $ExpectedWindowHandle");
    expect(source).toContain("$resolvedExpectedWindowHandle = '0x{0:X}' -f $targetHandle.ToInt64()");
    expect(source).toContain("$foreground.windowHandle -ne $resolvedExpectedWindowHandle");
    expect(source).not.toContain("SW_MINIMIZE");
    expect(source).not.toContain("Send-AltActivationPulse");
    expect(source).toContain("AttachThreadInput");
    expect(source).toMatch(/DllImport\("kernel32\.dll"\).*GetCurrentThreadId/);
    expect(source).not.toMatch(/DllImport\("user32\.dll"\).*GetCurrentThreadId/);
    expect(source).toContain("Windows did not grant foreground activation");
    expect(source.indexOf("Set-GameForeground $targetHandle"))
      .toBeLessThan(source.indexOf("Move-Absolute $SourceX $SourceY"));
    expect(source.indexOf("SwitchToThisWindow($TargetHandle, $true)"))
      .toBeLessThan(source.indexOf("Windows did not grant foreground activation"));
    expect(source.indexOf("$shell.AppActivate([int]$targetProcessId)"))
      .toBeLessThan(source.indexOf("Windows did not grant foreground activation"));
  });

  it("verifies source hover and performs one down/up sequence without retry", () => {
    expect(source).toContain("Start-Sleep -Milliseconds 50");
    expect(source).toContain("Start-Sleep -Milliseconds 150");
    expect(source.match(/Send-LeftButton \(\[ForegroundMoveNative\]::MOUSEEVENTF_LEFTDOWN\)/g))
      .toHaveLength(1);
    expect(source).toContain("if ($inputDispatched)");
    expect(source).toContain("$sourceCursorPoint = New-Object ForegroundMoveNative+POINT");
    expect(source).not.toMatch(/\$cursor\s*=/i);
    expect(source).not.toMatch(/retry/i);
  });
});
