export interface CrossCaptureAuditFacts {
  matchingMoveRequestCount: number;
  buildCompatible: boolean;
  temporalOrderValid: boolean;
  preStateComplete: boolean;
  postStateComplete: boolean;
  preIdentityFound: boolean;
  postIdentityFound: boolean;
  preAtRequestedSource: boolean;
  postAtRequestedDestination: boolean;
  sameGameDesignItemId: boolean;
  sameQuantity: boolean;
  preSpatialReady: boolean;
  postSpatialReady: boolean;
}

export interface CrossCaptureAuditResult {
  status: "cross-capture-consistent" | "inconsistent" | "insufficient";
  reason:
    | "all-observable-checks-pass"
    | "request-count-mismatch"
    | "build-incompatible"
    | "temporal-order-unverified"
    | "complete-state-missing"
    | "identity-missing"
    | "location-contradiction"
    | "item-property-contradiction"
    | "spatial-validation-blocked";
  detail: string;
  protocolConfirmed: false;
}

export function classifyCrossCaptureAudit(
  facts: CrossCaptureAuditFacts
): CrossCaptureAuditResult {
  if (facts.matchingMoveRequestCount !== 1) {
    return {
      status: "insufficient",
      reason: "request-count-mismatch",
      detail: `Expected exactly one ACT move request; observed ${facts.matchingMoveRequestCount}.`,
      protocolConfirmed: false
    };
  }
  if (!facts.buildCompatible) {
    return {
      status: "insufficient",
      reason: "build-incompatible",
      detail: "The three captures do not all match the pinned build.",
      protocolConfirmed: false
    };
  }
  if (!facts.temporalOrderValid) {
    return {
      status: "insufficient",
      reason: "temporal-order-unverified",
      detail: "The pre-state, move request, and post-state wall-clock order is not valid.",
      protocolConfirmed: false
    };
  }
  if (!facts.preStateComplete || !facts.postStateComplete) {
    return {
      status: "insufficient",
      reason: "complete-state-missing",
      detail: "A complete cross-capture pre-state or post-state is unavailable.",
      protocolConfirmed: false
    };
  }
  if (!facts.preIdentityFound || !facts.postIdentityFound) {
    return {
      status: "insufficient",
      reason: "identity-missing",
      detail: "The ACT request identity was not found in both comparison states.",
      protocolConfirmed: false
    };
  }
  if (!facts.preAtRequestedSource || !facts.postAtRequestedDestination) {
    return {
      status: "inconsistent",
      reason: "location-contradiction",
      detail: "The request identity contradicts the requested source-to-destination transition.",
      protocolConfirmed: false
    };
  }
  if (!facts.sameGameDesignItemId || !facts.sameQuantity) {
    return {
      status: "inconsistent",
      reason: "item-property-contradiction",
      detail: "The request identity has conflicting design or quantity evidence across captures.",
      protocolConfirmed: false
    };
  }
  if (!facts.preSpatialReady || !facts.postSpatialReady) {
    return {
      status: "insufficient",
      reason: "spatial-validation-blocked",
      detail: "One of the comparison states does not pass complete spatial validation.",
      protocolConfirmed: false
    };
  }
  return {
    status: "cross-capture-consistent",
    reason: "all-observable-checks-pass",
    detail: "The same private identity is consistent with the requested transition across the available captures.",
    protocolConfirmed: false
  };
}
