import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("tools/windows-supervised-move.ps1", "utf8");

describe("Windows supervised drag input contract", () => {
  it("uses absolute SendInput movement with a correctly aligned native union", () => {
    expect(source).toContain("LayoutKind.Explicit");
    expect(source).toContain("MOUSEEVENTF_ABSOLUTE");
    expect(source).toContain("SendInput");
    expect(source).not.toContain("SetCursorPos");
  });

  it("verifies source hover and performs one down/up sequence without retry", () => {
    expect(source).toContain("Start-Sleep -Milliseconds 50");
    expect(source).toContain("Start-Sleep -Milliseconds 150");
    expect(source.match(/MOUSEEVENTF_LEFTDOWN/g)).toHaveLength(2); // declaration and one use
    expect(source.match(/Send-LeftButton \(\[ForegroundMoveNative\]::MOUSEEVENTF_LEFTDOWN\)/g)).toHaveLength(1);
    expect(source).toContain("if ($inputDispatched)"); // cleanup may release, but never starts another drag
    expect(source).not.toMatch(/retry/i);
  });
});
