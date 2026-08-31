import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const helper = readFileSync(resolve(process.cwd(), "tools/windows-navigation.ps1"), "utf8");

describe("Windows navigation input contract", () => {
  it("matches the reviewed DnDTools click sequence with configurable timing", () => {
    expect(helper).toContain("Move-MouseLikeDnDTools $X $Y");
    expect(helper).toContain("[NavNative]::MOVE-bor[NavNative]::ABSOLUTE-bor[NavNative]::VIRTUALDESK");
    expect(helper).toContain("[int]$PointerSettleMilliseconds=50");
    expect(helper).toContain("[int]$ClickHoldMilliseconds=30");
    expect(helper).toContain("[int]$PostClickMilliseconds=150");
    expect(helper).toContain("Move-MouseLikeDnDTools $X $Y $PointerSettleMilliseconds");
    expect(helper).toContain("Start-Sleep -Milliseconds $ClickHoldMilliseconds");
    expect(helper).toContain("Start-Sleep -Milliseconds $PostClickMilliseconds");
    expect(helper).toContain("inputMethod='dndtools-sendinput'");
  });

  it("does not retain the ineffective SetCursorPos path", () => {
    expect(helper).not.toContain("SetCursorPos");
  });

  it("restores the game foreground and supports the complete virtual desktop", () => {
    expect(helper).toContain("function Set-GameForeground");
    expect(helper).toContain("SetForegroundWindow");
    expect(helper).toContain("SwitchToThisWindow($target,$true)");
    expect(helper).toContain("$shell.AppActivate([int]$targetPid)");
    expect(helper).toContain("function Resolve-GameWindowHandle");
    expect(helper).toContain("return [IntPtr]$candidates[0].MainWindowHandle");
    expect(helper).not.toContain("return[IntPtr]");
    expect(helper).toContain("Multiple DungeonCrawler main windows are available; refusing ambiguous binding.");
    expect(helper).toContain("$state.windowHandle-ne$resolvedExpectedWindowHandle");
    expect(helper).not.toContain("SW_MINIMIZE");
    expect(helper).not.toContain("Send-AltActivationPulse");
    expect(helper).toContain("AttachThreadInput");
    expect(helper).toMatch(/DllImport\("kernel32\.dll"\).*GetCurrentThreadId/);
    expect(helper).not.toMatch(/DllImport\("user32\.dll"\).*GetCurrentThreadId/);
    expect(helper).toContain("GetSystemMetrics(76)");
    expect(helper).toContain("VIRTUALDESK=0x4000");
    expect(helper).not.toContain("target inside the primary display");
  });

  it("verifies the foreground target and cursor before button down", () => {
    expect(helper).toContain("Foreground window identity or client bounds changed.");
    expect(helper).toContain("SendInput cursor verification failed.");
    expect(helper.indexOf("Move-MouseLikeDnDTools $X $Y"))
      .toBeLessThan(helper.indexOf("Send-MouseInput 0 0 ([NavNative]::DOWN)"));
  });

  it("extracts versioned stable-UI features without requiring foreground input", () => {
    expect(helper).toContain("function Get-StableUiFeature");
    expect(helper).toContain("if($AnalyzeImage)");
    expect(helper).toContain("featureVersion=2");
    expect(helper.indexOf("if($AnalyzeImage)")).toBeLessThan(helper.indexOf("$state=Get-State"));
  });
});
