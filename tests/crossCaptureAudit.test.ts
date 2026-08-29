import { describe, expect, it } from "vitest";
import {
  classifyCrossCaptureAudit,
  type CrossCaptureAuditFacts
} from "../src/domain/crossCaptureAudit";

const passing: CrossCaptureAuditFacts = {
  matchingMoveRequestCount: 1,
  buildCompatible: true,
  temporalOrderValid: true,
  preStateComplete: true,
  postStateComplete: true,
  preIdentityFound: true,
  postIdentityFound: true,
  preAtRequestedSource: true,
  postAtRequestedDestination: true,
  sameGameDesignItemId: true,
  sameQuantity: true,
  preSpatialReady: true,
  postSpatialReady: true
};

describe("cross-capture move audit", () => {
  it("reports consistency without promoting it to protocol confirmation", () => {
    expect(classifyCrossCaptureAudit(passing)).toEqual({
      status: "cross-capture-consistent",
      reason: "all-observable-checks-pass",
      detail: "The same private identity is consistent with the requested transition across the available captures.",
      protocolConfirmed: false
    });
  });

  it("keeps missing requests, states, identities, and unsafe geometry insufficient", () => {
    expect(classifyCrossCaptureAudit({ ...passing, matchingMoveRequestCount: 0 }))
      .toMatchObject({ status: "insufficient", reason: "request-count-mismatch" });
    expect(classifyCrossCaptureAudit({ ...passing, preStateComplete: false }))
      .toMatchObject({ status: "insufficient", reason: "complete-state-missing" });
    expect(classifyCrossCaptureAudit({ ...passing, postIdentityFound: false }))
      .toMatchObject({ status: "insufficient", reason: "identity-missing" });
    expect(classifyCrossCaptureAudit({ ...passing, postSpatialReady: false }))
      .toMatchObject({ status: "insufficient", reason: "spatial-validation-blocked" });
  });

  it("classifies observable location and item-property conflicts as inconsistent", () => {
    expect(classifyCrossCaptureAudit({ ...passing, preAtRequestedSource: false }))
      .toMatchObject({ status: "inconsistent", reason: "location-contradiction" });
    expect(classifyCrossCaptureAudit({ ...passing, sameQuantity: false }))
      .toMatchObject({ status: "inconsistent", reason: "item-property-contradiction" });
  });

  it("does not compare captures from incompatible builds or invalid wall-clock order", () => {
    expect(classifyCrossCaptureAudit({ ...passing, buildCompatible: false }))
      .toMatchObject({ status: "insufficient", reason: "build-incompatible" });
    expect(classifyCrossCaptureAudit({ ...passing, temporalOrderValid: false }))
      .toMatchObject({ status: "insufficient", reason: "temporal-order-unverified" });
  });
});
