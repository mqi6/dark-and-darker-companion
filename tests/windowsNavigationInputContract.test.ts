import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const helper = readFileSync(resolve(process.cwd(), "tools/windows-navigation.ps1"), "utf8");

describe("Windows navigation input contract", () => {
  it("matches the reviewed DnDTools click sequence", () => {
    expect(helper).toContain("Move-MouseLikeDnDTools $X $Y");
    expect(helper).toContain("[NavNative]::MOVE-bor[NavNative]::ABSOLUTE");
    expect(helper).toContain("Start-Sleep -Milliseconds 50");
    expect(helper).toContain("Start-Sleep -Milliseconds 30");
    expect(helper).toContain("Start-Sleep -Milliseconds 150");
    expect(helper).toContain("inputMethod='dndtools-sendinput'");
  });

  it("does not retain the ineffective SetCursorPos path", () => {
    expect(helper).not.toContain("SetCursorPos");
  });

  it("verifies the foreground target and cursor before button down", () => {
    expect(helper).toContain("Foreground window identity or client bounds changed.");
    expect(helper).toContain("SendInput cursor verification failed.");
    expect(helper.indexOf("Move-MouseLikeDnDTools $X $Y"))
      .toBeLessThan(helper.indexOf("Send-MouseInput 0 0 ([NavNative]::DOWN)"));
  });
});
