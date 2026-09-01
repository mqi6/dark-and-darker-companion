import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SORT_INPUT_TIMING_PRESETS } from "../src/domain/automationTiming";
import { STASH_ITEM_CATEGORIES } from "../src/domain/stashRouting";
import type { SpatialProjection } from "../src/domain/inventoryGeometry";
import { PrivateSortOperatorLog, PrivateSortSessionStore } from "../tools/privateSortSessionStore";

const projection: SpatialProjection = {
  sourceSnapshotHash: "hash",
  sourceVersion: 1,
  containers: [],
  ready: true
};

describe("private sort session store", () => {
  it("atomically saves the initial session, journal, and final state in private files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "companion-sort-session-"));
    try {
      const latestDiagnosticPath = join(directory, "latest-sort.sanitized.jsonl");
      const store = new PrivateSortSessionStore(directory, latestDiagnosticPath);
      const session = await store.create({
        initialProjection: projection,
        policies: [{ inventoryId: 4, enabled: true, allowedCategories: STASH_ITEM_CATEGORIES }],
        packingMode: "compact-top-left",
        plan: {
          status: "blocked",
          mode: "compact-top-left",
          reason: "visible-page-not-ready",
          diagnostics: []
        },
        schedule: {
          status: "blocked",
          diagnosticCode: "sort-plan-not-ready",
          detail: "blocked fixture",
          actions: []
        },
        screenActions: [],
        timing: SORT_INPUT_TIMING_PRESETS.fast
      });
      await store.append({
        at: "2026-08-31T00:00:00.000Z",
        actionIndex: 0,
        actionKind: "select-stash-tab",
        status: "start",
        completedActionCount: 0,
        completedDragCount: 0,
        selectedTab: 1,
        observedTab: 1,
        observedScreen: "stash"
      });
      await store.appendResult({
        status: "blocked",
        diagnosticCode: "test-stop",
        actionCount: 1,
        dragCount: 0
      });
      await store.savePostState({
        ...projection,
        sourceSnapshotHash: "after",
        sourceVersion: 2
      }, { status: "confirmed" });

      expect((await store.load()).sessionId).toBe(session.sessionId);
      expect(JSON.parse(await readFile(store.postStatePath, "utf8")))
        .toMatchObject({
          finalProjection: { sourceSnapshotHash: "after", sourceVersion: 2 },
          reconciliation: { status: "confirmed" }
        });
      expect(await readFile(store.journalPath, "utf8"))
        .toContain('"actionKind":"select-stash-tab"');
      expect(store.sessionPath.endsWith("session.private.json")).toBe(true);
      const diagnostic = await readFile(latestDiagnosticPath, "utf8");
      expect(diagnostic).toContain('"event":"session-start"');
      expect(diagnostic).toContain('"expectedTab":1');
      expect(diagnostic).toContain('"observedTab":1');
      expect(diagnostic).toContain('"diagnosticCode":"test-stop"');
      expect(diagnostic).not.toContain('"itemAlias"');
      const operator = new PrivateSortOperatorLog(directory);
      await operator.append({ at: "2026-08-31T00:00:00.000Z", event: "preview-blocked", phase: "blocked", diagnosticCode: "game-window-unavailable", adapterError: "private adapter detail" });
      expect(await readFile(operator.path, "utf8")).toContain('"diagnosticCode":"game-window-unavailable"');
      expect(await readFile(operator.path, "utf8")).toContain('"adapterError":"private adapter detail"');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
