export interface GameWindowCandidate {
  hwnd: string;
  pid: number;
  processName: string;
  executablePath?: string;
  sessionId: number;
  operatorSessionId: number;
  clientWidth: number;
  clientHeight: number;
  rootHwnd: string;
  ownerHwnd?: string;
  title: string;
  visible: boolean;
  cloaked: boolean;
  integrity: "low" | "medium" | "high" | "system" | "unknown";
  operatorIntegrity: "low" | "medium" | "high" | "system" | "unknown";
}

export type GameWindowSelection =
  | { status: "selected"; candidate: GameWindowCandidate }
  | { status: "blocked"; diagnosticCode: "game-window-unavailable" | "multiple-game-windows" | "integrity-level-mismatch" };

/** Pure policy shared with the Windows adapter's EnumWindows implementation. */
export function selectGameWindow(candidates: readonly GameWindowCandidate[]): GameWindowSelection {
  const valid = candidates.filter(candidate =>
    isVerifiedGameIdentity(candidate) &&
    candidate.sessionId === candidate.operatorSessionId &&
    candidate.clientWidth > 0 && candidate.clientHeight > 0 &&
    candidate.rootHwnd.toLowerCase() === candidate.hwnd.toLowerCase() &&
    candidate.visible && !candidate.cloaked
  );
  if (valid.length === 0) return { status: "blocked", diagnosticCode: "game-window-unavailable" };
  const accessible = valid.filter(candidate => !integrityMismatch(candidate));
  if (accessible.length === 0) return { status: "blocked", diagnosticCode: "integrity-level-mismatch" };
  if (accessible.length !== 1) return { status: "blocked", diagnosticCode: "multiple-game-windows" };
  return { status: "selected", candidate: accessible[0]! };
}

function isVerifiedGameIdentity(candidate: GameWindowCandidate): boolean {
  const process = candidate.processName.toLowerCase().replace(/\.exe$/, "");
  const executable = candidate.executablePath?.replace(/\//g, "\\").toLowerCase();
  return process === "dungeoncrawler" || executable?.endsWith("\\dungeoncrawler.exe") === true;
}

function integrityMismatch(candidate: GameWindowCandidate): boolean {
  const rank = { unknown: -1, low: 0, medium: 1, high: 2, system: 3 } as const;
  return rank[candidate.integrity] >= 0 && rank[candidate.operatorIntegrity] >= 0 &&
    rank[candidate.integrity] > rank[candidate.operatorIntegrity];
}
