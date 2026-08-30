import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { ScreenPoint, ScreenRectangle } from "../src/domain/stashScreenCalibration";
import type { PreparedSupervisedMove } from "../src/domain/supervisedMove";
import type {
  LiveMoveEnvironment,
  MoveDispatchResult,
  MoveVerificationResult,
  SupervisedMoveRuntime
} from "../src/tasks/supervisedMoveRunner";

const execFileAsync = promisify(execFile);

export interface WindowsDisplayGeometry {
  virtualLeft: number;
  virtualTop: number;
  virtualWidth: number;
  virtualHeight: number;
}

export interface ForegroundWindowInspection {
  windowHandle: string;
  processId: number;
  processName: string;
  windowTitle: string;
  bounds: ScreenRectangle;
  display: WindowsDisplayGeometry;
}

export interface CursorInspection extends ForegroundWindowInspection {
  cursor: ScreenPoint;
}

export interface WindowsUiBridge {
  focusExpectedWindow(expectedWindowHandle: string): Promise<ForegroundWindowInspection>;
  inspectForegroundWindow(): Promise<ForegroundWindowInspection>;
  inspectCursor(): Promise<CursorInspection>;
  dispatchLeftDrag(parameters: {
    expectedWindowHandle: string;
    expectedBounds: ScreenRectangle;
    source: ScreenPoint;
    destination: ScreenPoint;
    durationMilliseconds: number;
  }): Promise<MoveDispatchResult>;
}

export interface MoveRuntimeStateProvider {
  inspectState(): Promise<Omit<LiveMoveEnvironment, "windowBounds" | "isForeground" | "inputMethod">>;
  verifyMove(
    plan: PreparedSupervisedMove,
    timeoutMilliseconds: number,
    signal?: AbortSignal
  ): Promise<MoveVerificationResult>;
}

export interface ExpectedWindowsEnvironment {
  windowHandle: string;
  processName: string;
  display: WindowsDisplayGeometry;
  windowBounds: ScreenRectangle;
}

export class WindowsSupervisedMoveRuntime implements SupervisedMoveRuntime {
  constructor(
    private readonly ui: WindowsUiBridge,
    private readonly state: MoveRuntimeStateProvider,
    private readonly expected: ExpectedWindowsEnvironment,
    private readonly dryRun = true,
    private readonly countdownObserver?: (remainingMilliseconds: number) => void
  ) {}

  async inspectEnvironment(): Promise<LiveMoveEnvironment> {
    await this.ui.focusExpectedWindow(this.expected.windowHandle);
    const [window, state] = await Promise.all([
      this.ui.inspectForegroundWindow(),
      this.state.inspectState()
    ]);
    return {
      ...state,
      inputMethod: WINDOWS_SUPERVISED_INPUT_METHOD,
      windowBounds: window.bounds,
      isForeground:
        window.windowHandle === this.expected.windowHandle &&
        window.processName.toLowerCase() === this.expected.processName.toLowerCase() &&
        sameDisplay(window.display, this.expected.display)
    };
  }

  async runCountdown(milliseconds: number, signal?: AbortSignal): Promise<"completed" | "cancelled"> {
    const started = performance.now();
    while (performance.now() - started < milliseconds) {
      if (signal?.aborted) return "cancelled";
      const remaining = Math.max(0, milliseconds - (performance.now() - started));
      this.countdownObserver?.(Math.ceil(remaining));
      await cancellableDelay(Math.min(100, remaining), signal);
    }
    return signal?.aborted ? "cancelled" : "completed";
  }

  async dispatchLeftDrag(command: {
    source: ScreenPoint;
    destination: ScreenPoint;
    durationMilliseconds: number;
  }): Promise<MoveDispatchResult> {
    if (this.dryRun) {
      return { status: "failed", diagnosticCode: "dry-run-input-disabled" };
    }
    const window = await this.ui.inspectForegroundWindow();
    if (
      window.windowHandle !== this.expected.windowHandle ||
      window.processName.toLowerCase() !== this.expected.processName.toLowerCase() ||
      !sameDisplay(window.display, this.expected.display) ||
      !sameRectangle(window.bounds, this.expected.windowBounds)
    ) {
      return { status: "failed", diagnosticCode: "foreground-window-changed" };
    }
    return this.ui.dispatchLeftDrag({
      expectedWindowHandle: this.expected.windowHandle,
      expectedBounds: this.expected.windowBounds,
      ...command
    });
  }

  verifyMove(plan: PreparedSupervisedMove, timeoutMilliseconds: number, signal?: AbortSignal) {
    return this.state.verifyMove(plan, timeoutMilliseconds, signal);
  }
}

export class PowerShellWindowsUiBridge implements WindowsUiBridge {
  constructor(private readonly helperPath: string) {}

  async focusExpectedWindow(expectedWindowHandle: string): Promise<ForegroundWindowInspection> {
    const result = await runPowerShell(this.helperPath, [
      "-FocusGame", "-ExpectedWindowHandle", expectedWindowHandle
    ]);
    return JSON.parse(result.stdout) as ForegroundWindowInspection;
  }

  async inspectForegroundWindow(): Promise<ForegroundWindowInspection> {
    const result = await runPowerShell(this.helperPath, ["-Inspect"]);
    return JSON.parse(result.stdout) as ForegroundWindowInspection;
  }

  async inspectCursor(): Promise<CursorInspection> {
    const result = await runPowerShell(this.helperPath, ["-Cursor"]);
    return JSON.parse(result.stdout) as CursorInspection;
  }

  async dispatchLeftDrag(parameters: {
    expectedWindowHandle: string;
    expectedBounds: ScreenRectangle;
    source: ScreenPoint;
    destination: ScreenPoint;
    durationMilliseconds: number;
  }): Promise<MoveDispatchResult> {
    const args = [
      "-Drag",
      "-ExpectedWindowHandle", parameters.expectedWindowHandle,
      "-ExpectedLeft", String(Math.round(parameters.expectedBounds.left)),
      "-ExpectedTop", String(Math.round(parameters.expectedBounds.top)),
      "-ExpectedWidth", String(Math.round(parameters.expectedBounds.width)),
      "-ExpectedHeight", String(Math.round(parameters.expectedBounds.height)),
      "-SourceX", String(Math.round(parameters.source.x)),
      "-SourceY", String(Math.round(parameters.source.y)),
      "-DestinationX", String(Math.round(parameters.destination.x)),
      "-DestinationY", String(Math.round(parameters.destination.y)),
      "-DurationMilliseconds", String(Math.round(parameters.durationMilliseconds))
    ];
    try {
      const result = await runPowerShell(this.helperPath, args);
      return JSON.parse(result.stdout) as MoveDispatchResult;
    } catch (error) {
      const stdout = typeof error === "object" && error && "stdout" in error ? String(error.stdout) : "";
      try {
        return JSON.parse(stdout) as MoveDispatchResult;
      } catch {
        return { status: "failed", diagnosticCode: "ordinary-foreground-input-failed" };
      }
    }
  }
}

export class PrivateJsonMoveStateProvider implements MoveRuntimeStateProvider {
  constructor(
    private readonly environmentPath: string,
    private readonly verificationPath: string
  ) {}

  async inspectState(): Promise<Omit<LiveMoveEnvironment, "windowBounds" | "isForeground" | "inputMethod">> {
    const value = JSON.parse(await readFile(this.environmentPath, "utf8")) as
      Omit<LiveMoveEnvironment, "windowBounds" | "isForeground" | "inputMethod" | "snapshotAgeMilliseconds"> &
      { snapshotObservedAtUnixMilliseconds: number };
    const { snapshotObservedAtUnixMilliseconds, ...environment } = value;
    return {
      ...environment,
      snapshotAgeMilliseconds: Date.now() - snapshotObservedAtUnixMilliseconds
    };
  }

  async verifyMove(
    plan: PreparedSupervisedMove,
    timeoutMilliseconds: number,
    signal?: AbortSignal
  ): Promise<MoveVerificationResult> {
    const deadline = Date.now() + timeoutMilliseconds;
    while (Date.now() < deadline) {
      if (signal?.aborted) return { status: "ambiguous", diagnosticCode: "verification-cancelled" };
      try {
        const value = JSON.parse(await readFile(this.verificationPath, "utf8")) as MoveVerificationResult & { planFingerprint?: string };
        if (value.planFingerprint === plan.planFingerprint) return value;
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      await cancellableDelay(250, signal);
    }
    return { status: "ambiguous", diagnosticCode: "complete-post-state-timeout" };
  }
}

async function runPowerShell(helperPath: string, args: string[]) {
  return execFileAsync("powershell.exe", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", helperPath, ...args
  ], { encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024 });
}

function sameDisplay(left: WindowsDisplayGeometry, right: WindowsDisplayGeometry): boolean {
  return left.virtualLeft === right.virtualLeft && left.virtualTop === right.virtualTop &&
    left.virtualWidth === right.virtualWidth && left.virtualHeight === right.virtualHeight;
}

function sameRectangle(left: ScreenRectangle, right: ScreenRectangle): boolean {
  return left.left === right.left && left.top === right.top &&
    left.width === right.width && left.height === right.height;
}

async function cancellableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0 || signal?.aborted) return;
  await new Promise<void>(resolve => {
    const timer = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}
export const WINDOWS_SUPERVISED_INPUT_METHOD = "dndtools-virtual-desktop-drag-v2";
