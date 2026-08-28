export interface MoveLocation { inventoryId: number; slotId: number }
export interface MoveItemState extends MoveLocation { alias: string }
export interface MoveIntent {
  alias: string;
  source: MoveLocation;
  destination: MoveLocation;
}
export interface MoveEvidence {
  intent: MoveIntent;
  matchingRequestCount: number;
  acknowledgementCount: number;
  explicitFailure?: string;
  beforeVersion: number;
  afterVersion?: number;
  beforeItems: readonly MoveItemState[];
  afterItems?: readonly MoveItemState[];
}
export interface MoveCorrelation {
  status: "confirmed" | "failed" | "ambiguous";
  reason:
    | "post-state-confirmed"
    | "explicit-failure"
    | "request-count-mismatch"
    | "post-state-missing"
    | "post-state-stale"
    | "identity-transition-mismatch";
  detail: string;
}

export function correlateMove(evidence: MoveEvidence): MoveCorrelation {
  if (evidence.explicitFailure) {
    return { status: "failed", reason: "explicit-failure", detail: evidence.explicitFailure };
  }
  if (evidence.matchingRequestCount !== 1) {
    return { status: "ambiguous", reason: "request-count-mismatch", detail: `Expected one request, observed ${evidence.matchingRequestCount}.` };
  }
  if (evidence.afterVersion === undefined || !evidence.afterItems) {
    return { status: "ambiguous", reason: "post-state-missing", detail: "An acknowledgement is not sufficient without a protocol post-state." };
  }
  if (evidence.afterVersion <= evidence.beforeVersion) {
    return { status: "ambiguous", reason: "post-state-stale", detail: "The observed post-state is not newer than the pre-state." };
  }
  const before = evidence.beforeItems.filter((item) => item.alias === evidence.intent.alias);
  const after = evidence.afterItems.filter((item) => item.alias === evidence.intent.alias);
  const sourceMatches = before.length === 1 && sameLocation(before[0], evidence.intent.source);
  const destinationMatches = after.length === 1 && sameLocation(after[0], evidence.intent.destination);
  const remainsAtSource = after.some((item) => sameLocation(item, evidence.intent.source));
  if (!sourceMatches || !destinationMatches || remainsAtSource) {
    return { status: "ambiguous", reason: "identity-transition-mismatch", detail: "The same item alias was not observed moving from the intended source to destination." };
  }
  return { status: "confirmed", reason: "post-state-confirmed", detail: `Confirmed with post-state; ${evidence.acknowledgementCount} acknowledgement(s) were informational only.` };
}

function sameLocation(item: MoveLocation | undefined, location: MoveLocation): boolean {
  return item !== undefined && item.inventoryId === location.inventoryId && item.slotId === location.slotId;
}
