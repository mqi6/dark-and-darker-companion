import { describe, expect, it } from "vitest";
import type { CanonicalId, MarketCandidate } from "../src/domain/models";
import { evaluateCandidate, filterCandidates, type RollRule } from "../src/domain/search";

const strength = "id.attribute.strength" as CanonicalId;
const moveSpeed = "id.attribute.move_speed" as CanonicalId;
const maxHealth = "id.attribute.max_health" as CanonicalId;
const physicalPower = "id.attribute.physical_power" as CanonicalId;

const rules: RollRule[] = [
  { id: "strength", attributeId: strength, enabled: true, minimum: 2, maximum: 5 },
  { id: "speed", attributeId: moveSpeed, enabled: true, minimum: 3, maximum: 5 },
  { id: "health", attributeId: maxHealth, enabled: true, minimum: 4, maximum: 8 },
  { id: "power", attributeId: physicalPower, enabled: true, minimum: 2, maximum: 6 }
];

function candidate(id: string, rolls: MarketCandidate["item"]["rolls"], possible?: CanonicalId[]): MarketCandidate {
  return {
    listingId: id,
    item: {
      instanceKey: `instance-${id}`,
      itemId: `id.item.${id}`,
      name: { id: `id.item.${id}`, en: id, zhStatus: "english-fallback" },
      quantity: 1,
      rolls,
      ...(possible ? { possibleSecondaryAttributeIds: possible } : {})
    },
    price: 100,
    createdAt: "2026-08-27T00:00:00Z"
  };
}

describe("K-of-N filtering", () => {
  it("passes a candidate with exactly K matching rolls", () => {
    const result = evaluateCandidate(
      candidate("plate", [
        { attributeId: strength, value: 3 },
        { attributeId: maxHealth, value: 5 }
      ]),
      rules,
      2
    );
    expect(result.passed).toBe(true);
    expect(result.matchCount).toBe(2);
  });

  it("treats a naturally impossible roll as false but allows other rules to satisfy K", () => {
    const result = evaluateCandidate(
      candidate(
        "multi-gear",
        [
          { attributeId: strength, value: 3 },
          { attributeId: maxHealth, value: 6 }
        ],
        [strength, maxHealth]
      ),
      rules,
      2
    );
    expect(result.passed).toBe(true);
    expect(result.evaluations.find((entry) => entry.ruleId === "speed")?.reason).toBe(
      "naturally-impossible"
    );
  });

  it("reports matching/evaluated and incomplete retrieved/reported counts", () => {
    const first = candidate("one", [
      { attributeId: strength, value: 3 },
      { attributeId: maxHealth, value: 5 }
    ]);
    const second = candidate("two", [{ attributeId: strength, value: 3 }]);
    const result = filterCandidates([first, second], rules, {
      requiredMatchCount: 2,
      reportedTotal: 10
    });
    expect(result.matches).toHaveLength(1);
    expect(result.evaluatedCount).toBe(2);
    expect(result.retrievedCount).toBe(2);
    expect(result.reportedTotal).toBe(10);
    expect(result.incomplete).toBe(true);
  });
});
