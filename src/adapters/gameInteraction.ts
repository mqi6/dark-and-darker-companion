export interface GameActionContext {
  taskId: string;
  planId: string;
  snapshotId: string;
  calibrationProfileId: string;
}

export interface MoveIntent {
  actionId: string;
  itemInstanceKey: string;
  source: { x: number; y: number };
  destination: { x: number; y: number };
}

export interface ListingIntent {
  actionId: string;
  itemInstanceKey: string;
  finalPrice: number;
}

export type GameActionResult =
  | { status: "confirmed"; evidenceId: string }
  | { status: "failed"; diagnosticCode: string }
  | { status: "ambiguous"; diagnosticCode: string }
  | { status: "dry-run"; intendedAction: MoveIntent | ListingIntent };

export interface GameInteractionAdapter {
  moveItem(context: GameActionContext, intent: MoveIntent): Promise<GameActionResult>;
  submitListing(context: GameActionContext, intent: ListingIntent): Promise<GameActionResult>;
}

export class DryRunGameInteractionAdapter implements GameInteractionAdapter {
  readonly actions: Array<{ context: GameActionContext; intent: MoveIntent | ListingIntent }> = [];

  async moveItem(context: GameActionContext, intent: MoveIntent): Promise<GameActionResult> {
    this.actions.push({ context, intent });
    return { status: "dry-run", intendedAction: intent };
  }

  async submitListing(
    context: GameActionContext,
    intent: ListingIntent
  ): Promise<GameActionResult> {
    this.actions.push({ context, intent });
    return { status: "dry-run", intendedAction: intent };
  }
}
