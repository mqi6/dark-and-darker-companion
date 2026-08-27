import type { StorageSnapshot } from "../domain/snapshot";

export type CaptureHealth =
  | "stopped"
  | "starting"
  | "healthy"
  | "receiving-unknown"
  | "stale"
  | "failed";

export interface CaptureStatus {
  health: CaptureHealth;
  latestRawMessageAt?: string;
  latestDecodedMessageAt?: string;
  diagnosticCode?: string;
}

export interface CaptureAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<CaptureStatus>;
  latestSnapshot(characterId: string, storageId: string): Promise<StorageSnapshot | undefined>;
}

export class FixtureCaptureAdapter implements CaptureAdapter {
  private running = false;

  constructor(private readonly snapshots: readonly StorageSnapshot[]) {}

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async status(): Promise<CaptureStatus> {
    return this.running ? { health: "healthy" } : { health: "stopped" };
  }

  async latestSnapshot(
    characterId: string,
    storageId: string
  ): Promise<StorageSnapshot | undefined> {
    if (!this.running) {
      return undefined;
    }
    return [...this.snapshots]
      .filter(
        (snapshot) =>
          snapshot.characterId === characterId && snapshot.storageId === storageId
      )
      .sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt))[0];
  }
}
