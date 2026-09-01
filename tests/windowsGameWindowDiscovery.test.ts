import { describe, expect, it } from "vitest";
import { selectGameWindow, type GameWindowCandidate } from "../src/tasks/windowsGameWindowDiscovery";

const game = (values: Partial<GameWindowCandidate> = {}): GameWindowCandidate => ({
  hwnd: "0x200", pid: 20, processName: "DungeonCrawler", executablePath: "C:\\Game\\DungeonCrawler.exe",
  sessionId: 1, operatorSessionId: 1, clientWidth: 1920, clientHeight: 1080,
  rootHwnd: "0x200", ownerHwnd: "0x0", title: "", cloaked: false,
  visible: true,
  integrity: "medium", operatorIntegrity: "medium", ...values
});

describe("shared game window discovery policy", () => {
  it("selects an EnumWindows candidate when MainWindowHandle is zero", () => {
    expect(selectGameWindow([game()])).toMatchObject({ status: "selected", candidate: { hwnd: "0x200" } });
  });
  it("ignores a stale old handle and selects the new valid game window", () => {
    expect(selectGameWindow([game({ hwnd: "0x100", rootHwnd: "0x100", visible: false }), game()]))
      .toMatchObject({ status: "selected", candidate: { hwnd: "0x200" } });
  });
  it("does not require a nonempty title", () => {
    expect(selectGameWindow([game({ title: "" })]).status).toBe("selected");
  });
  it("rejects a launcher and selects the verified game executable", () => {
    expect(selectGameWindow([game({ processName: "steam", executablePath: "C:\\Steam\\steam.exe" }), game()]))
      .toMatchObject({ status: "selected", candidate: { processName: "DungeonCrawler" } });
  });
  it("refuses multiple valid rendered game windows", () => {
    expect(selectGameWindow([game(), game({ hwnd: "0x300", rootHwnd: "0x300", pid: 30 })]))
      .toEqual({ status: "blocked", diagnosticCode: "multiple-game-windows" });
  });
  it("reports a confirmed integrity-level mismatch", () => {
    expect(selectGameWindow([game({ integrity: "high", operatorIntegrity: "medium" })]))
      .toEqual({ status: "blocked", diagnosticCode: "integrity-level-mismatch" });
  });
});
