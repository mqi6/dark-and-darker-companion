import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CompleteStashSortPlan } from "../src/domain/completeStashSort";
import type { ScheduledStashSortScreenAction } from "../src/domain/completeStashScreenPlan";
import type { SpatialProjection } from "../src/domain/inventoryGeometry";
import type { ScheduledStashSort } from "../src/domain/stashMoveScheduler";
import type { SortInputTiming } from "../src/domain/automationTiming";
import type { StashPackingMode } from "../src/domain/stashPacking";
import type { StashTabItemPolicy } from "../src/domain/stashRouting";

export interface PrivateSortSession {
  schemaVersion: 1;
  sessionId: string;
  createdAt: string;
  initialProjection: SpatialProjection;
  policies: readonly StashTabItemPolicy[];
  packingMode: StashPackingMode;
  plan: CompleteStashSortPlan;
  schedule: ScheduledStashSort;
  screenActions: readonly ScheduledStashSortScreenAction[];
  timing: SortInputTiming;
}

export interface PrivateSortJournalEvent {
  at: string;
  actionIndex: number;
  actionKind: string;
  itemAlias?: string;
  selectedTab?: number;
  observedTab?: number;
  observedScreen?: string;
  status: string;
  completedActionCount: number;
  completedDragCount: number;
  diagnosticCode?: string;
  adapterError?: string;
}

export interface PrivateSortOperatorEvent {
  at: string;
  event: "preview-start" | "preview-ready" | "preview-blocked" | "run-start" | "run-result" | "stop-requested";
  phase: string;
  diagnosticCode?: string;
  adapterError?: string;
  moveCount?: number;
  actionCount?: number;
  dragCount?: number;
}

export class PrivateSortOperatorLog {
  readonly path: string;
  constructor(directory: string) {
    this.path = resolve(directory, "operator.private.jsonl");
  }
  async append(event: PrivateSortOperatorEvent): Promise<void> {
    await mkdir(resolve(this.path, ".."), { recursive: true });
    await appendFile(this.path, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
  }
}

export class PrivateSortSessionStore {
  readonly sessionPath: string;
  readonly journalPath: string;
  readonly postStatePath: string;
  readonly diagnosticPath: string;

  constructor(
    readonly directory: string,
    private readonly latestDiagnosticPath?: string
  ) {
    this.sessionPath = resolve(directory, "session.private.json");
    this.journalPath = resolve(directory, "journal.private.jsonl");
    this.postStatePath = resolve(directory, "post-state.private.json");
    this.diagnosticPath = resolve(directory, "sort-diagnostic.sanitized.jsonl");
  }

  async create(parameters: Omit<PrivateSortSession, "schemaVersion" | "sessionId" | "createdAt">):
  Promise<PrivateSortSession> {
    const session: PrivateSortSession = {
      schemaVersion: 1,
      sessionId: randomUUID(),
      createdAt: new Date().toISOString(),
      ...parameters
    };
    await mkdir(this.directory, { recursive: true });
    await atomicJsonWrite(this.sessionPath, session);
    await this.startDiagnostic(session);
    return session;
  }

  async load(): Promise<PrivateSortSession> {
    return JSON.parse(await readFile(this.sessionPath, "utf8")) as PrivateSortSession;
  }

  async append(event: PrivateSortJournalEvent): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await appendFile(this.journalPath, `${JSON.stringify(event)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    await this.appendDiagnostic({
      event: "action",
      at: event.at,
      actionIndex: event.actionIndex,
      actionKind: event.actionKind,
      ...(event.selectedTab === undefined ? {} : { expectedTab: event.selectedTab }),
      ...(event.observedTab === undefined ? {} : { observedTab: event.observedTab }),
      ...(event.observedScreen === undefined ? {} : { observedScreen: event.observedScreen }),
      status: event.status,
      completedActionCount: event.completedActionCount,
      completedDragCount: event.completedDragCount,
      ...(event.diagnosticCode ? { diagnosticCode: event.diagnosticCode } : {}),
      ...(event.adapterError ? { adapterError: event.adapterError.slice(0, 500) } : {})
    });
  }

  async appendResult(result: {
    status: string;
    actionCount?: number;
    dragCount?: number;
    diagnosticCode?: string;
  }): Promise<void> {
    await this.appendDiagnostic({
      event: "run-result",
      at: new Date().toISOString(),
      status: result.status,
      ...(result.actionCount === undefined ? {} : { actionCount: result.actionCount }),
      ...(result.dragCount === undefined ? {} : { dragCount: result.dragCount }),
      ...(result.diagnosticCode ? { diagnosticCode: result.diagnosticCode } : {})
    });
  }

  async savePostState(projection: SpatialProjection, reconciliation: unknown): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await atomicJsonWrite(this.postStatePath, { finalProjection: projection, reconciliation });
  }

  private async startDiagnostic(session: PrivateSortSession): Promise<void> {
    const screenActions = session.screenActions.map((action, actionIndex) =>
      action.kind === "select-stash-tab"
        ? {
            actionIndex,
            actionKind: action.kind,
            expectedTab: action.tabIndex,
            click: roundPoint(action.point)
          }
        : {
            actionIndex,
            actionKind: action.kind,
            source: roundPoint(action.source),
            destination: roundPoint(action.destination)
          });
    const plan = session.plan.status === "ready"
      ? {
          status: session.plan.status,
          moveCount: session.plan.moves.length,
          skippedCount: session.plan.skippedAliases.length,
          diagnosticCodes: session.plan.diagnostics.map((value) => value.code)
        }
      : {
          status: session.plan.status,
          diagnosticCodes: session.plan.diagnostics.map((value) => value.code)
        };
    const schedule = session.schedule.status === "ready"
      ? {
          status: session.schedule.status,
          actionCount: session.schedule.actions.length,
          dragCount: session.schedule.dragCount,
          temporaryBufferCount: session.schedule.temporaryBufferCount
        }
      : {
          status: session.schedule.status,
          diagnosticCode: session.schedule.diagnosticCode
        };
    const first = JSON.stringify({
      schemaVersion: "sort-diagnostic-v1",
      event: "session-start",
      at: session.createdAt,
      packingMode: session.packingMode,
      timing: session.timing,
      plan,
      schedule,
      screenActions
    }) + "\n";
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.diagnosticPath, first, { encoding: "utf8", mode: 0o600 });
    if (this.latestDiagnosticPath) {
      await mkdir(resolve(this.latestDiagnosticPath, ".."), { recursive: true });
      await writeFile(this.latestDiagnosticPath, first, { encoding: "utf8", mode: 0o600 });
    }
  }

  private async appendDiagnostic(value: unknown): Promise<void> {
    const line = `${JSON.stringify(value)}\n`;
    await appendFile(this.diagnosticPath, line, { encoding: "utf8", mode: 0o600 });
    if (this.latestDiagnosticPath) {
      await appendFile(this.latestDiagnosticPath, line, { encoding: "utf8", mode: 0o600 });
    }
  }
}

async function atomicJsonWrite(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  await rename(temporaryPath, path);
}


function roundPoint(point: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 };
}
