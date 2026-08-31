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

  constructor(readonly directory: string) {
    this.sessionPath = resolve(directory, "session.private.json");
    this.journalPath = resolve(directory, "journal.private.jsonl");
    this.postStatePath = resolve(directory, "post-state.private.json");
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
  }

  async savePostState(projection: SpatialProjection, reconciliation: unknown): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await atomicJsonWrite(this.postStatePath, { finalProjection: projection, reconciliation });
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
