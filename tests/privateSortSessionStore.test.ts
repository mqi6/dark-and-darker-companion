import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SORT_INPUT_TIMING_PRESETS } from "../src/domain/automationTiming";
import type { SpatialProjection } from "../src/domain/inventoryGeometry";
import { PrivateSortSessionStore } from "../tools/privateSortSessionStore";

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
      const store = new PrivateSortSessionStore(directory);
      const session = await store.create({
        initialProjection: projection,
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
        event: "prepared",
        detail: "offline",
        completedActionCount: 0,
        completedDragCount: 0
      });
      await store.savePostState({
        ...projection,
        sourceSnapshotHash: "after",
        sourceVersion: 2
      });

      expect((await store.load()).sessionId).toBe(session.sessionId);
      expect(JSON.parse(await readFile(store.postStatePath, "utf8")))
        .toMatchObject({ sourceSnapshotHash: "after", sourceVersion: 2 });
      expect(await readFile(store.journalPath, "utf8")).toContain('"event":"prepared"');
      expect(store.sessionPath.endsWith("session.private.json")).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
