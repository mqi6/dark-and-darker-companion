import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import gameplayJson from "../fixtures/darkerdb/gameplay/catalog.json";
import { canonicalItemIdForGameDesignId, asGameDesignItemId } from "../src/domain/gameIdBridge";
import type { ReducedGameState } from "../src/domain/gameStateReducer";
import { gameplayCatalogSchema } from "../src/domain/gameplayCatalog";
import { projectSpatialState } from "../src/domain/inventoryGeometry";
import { selectMove003Candidate } from "../src/domain/move003CandidateSelector";
import { evaluateStashSortEligibility } from "../src/domain/stashSortEligibility";
import { stashTabMappingSchema } from "../src/domain/stashTabMapping";
import { prepareSupervisedMove, type PreparedSupervisedMove } from "../src/domain/supervisedMove";
import type { StashGridCalibration } from "../src/domain/stashScreenCalibration";
import type { SanitizedSemanticSnapshotV1 } from "../src/protocol/semanticSnapshot";

const args = Object.fromEntries(process.argv.slice(2).reduce<string[][]>((all, value, index, values) => index % 2 === 0 ? [...all, [value.replace(/^--/, ""), values[index + 1] ?? ""]] : all, []));
const session = resolve(required("session")), runtimeDirectory = resolve(required("runtime-directory"));
const snapshot = JSON.parse(await readFile(resolve(session, "semantic-snapshot.sanitized-private.json"), "utf8")) as SanitizedSemanticSnapshotV1;
const manifest = JSON.parse((await readFile(resolve(session, "manifest.private.json"), "utf8")).replace(/^\uFEFF/, "")) as { startUtc: string; gameVersion: string; gameSha256: string };
const mapping = stashTabMappingSchema.parse(JSON.parse(await readFile(resolve(runtimeDirectory, "mapping.private.json"), "utf8")));
const calibrationProfile = JSON.parse(await readFile(resolve(runtimeDirectory, "calibration.private.json"), "utf8")) as { calibration: StashGridCalibration; display: unknown };
const refreshPlan = JSON.parse(await readFile(resolve("fixtures-private/runtime/move-003-refresh/plan.private.json"), "utf8")) as { window: { windowHandle: string; clientBounds: StashGridCalibration["windowBounds"] }; gameBuildFingerprint: string };
const items = snapshot.containers.flatMap(container => container.items.map(item => { const gameDesignItemId = asGameDesignItemId(item.gameDesignItemId); const canonical = canonicalItemIdForGameDesignId(gameDesignItemId); return { alias: item.alias, gameDesignItemId, ...(canonical ? { darkerDbCanonicalItemId: canonical } : {}), inventoryId: item.inventoryId, slotId: item.slotId, stackQuantity: item.stackQuantity, ammoCount: item.ammoCount, contentsCount: item.contentsCount, primaryProperties: [], secondaryProperties: [], tradable: item.tradable, permittedAreas: item.permittedAreas }; }));
const state = { protocol: snapshot, items, diagnostics: [] } as ReducedGameState;
const projection = projectSpatialState(state, gameplayCatalogSchema.parse(gameplayJson));
const eligibility = evaluateStashSortEligibility(projection);
const candidate = selectMove003Candidate({ projection, eligibility, mapping });
if (!candidate) throw new Error("No safe mapped enabled quantity-one 1x1 same-tab candidate is available.");
const plan = prepareSupervisedMove({ request: { taskId: "MOVE-003", planId: `MOVE-003-plan-${Math.round(snapshot.relativeTimestampMs)}`, actionId: "MOVE-003-action-001", itemAlias: candidate.itemAlias, inventoryId: candidate.inventoryId, tabIndex: candidate.tabIndex, destination: candidate.destination, expectedSnapshotHash: snapshot.snapshotHash, expectedSnapshotVersion: snapshot.snapshotVersion, expectedSnapshotTimestampMilliseconds: snapshot.relativeTimestampMs, expectedWindowIdentity: refreshPlan.window.windowHandle, expectedInputMethod: "dndtools-absolute-drag-v1" }, projection, mapping, calibration: calibrationProfile.calibration, runtime: { runtimeProfileKey: mapping.runtimeProfileKey, availableInventoryIds: mapping.availableInventoryIds, selectedTabIndex: candidate.tabIndex, gameBuildFingerprint: refreshPlan.gameBuildFingerprint, windowBounds: refreshPlan.window.clientBounds, isForeground: true }, pageEnabled: true, reservedRegions: [] });
if (plan.status !== "ready") throw new Error(`MOVE-003 plan blocked: ${plan.reason}`);
await mkdir(runtimeDirectory, { recursive: true });
await writeFile(resolve(runtimeDirectory, "plan.private.json"), `${JSON.stringify(plan, null, 2)}\n`);
await writeFile(resolve(runtimeDirectory, "live-environment.private.json"), `${JSON.stringify({ sourceSnapshotHash: plan.sourceSnapshotHash, sourceSnapshotVersion: plan.sourceSnapshotVersion, snapshotObservedAtUnixMilliseconds: Date.parse(manifest.startUtc) + snapshot.relativeTimestampMs, calibrationProfileId: plan.calibrationProfileId, gameBuildFingerprint: plan.gameBuildFingerprint, selectedTabIndex: plan.tabIndex, inventoryId: plan.inventoryId }, null, 2)}\n`);
await writeFile(resolve(runtimeDirectory, "plan-preview.private.html"), preview(plan));
console.log(JSON.stringify({ itemAlias: plan.itemAlias, tabIndex: plan.tabIndex, inventoryId: plan.inventoryId, source: plan.source, destination: plan.destination, quantity: 1, footprint: "1x1", snapshotHashShort: plan.sourceSnapshotHash.slice(0, 12), snapshotVersion: plan.sourceSnapshotVersion, snapshotTimestampRelativeMilliseconds: plan.sourceSnapshotTimestampMilliseconds, calibrationProfileId: plan.calibrationProfileId, gameBuildFingerprint: plan.gameBuildFingerprint, planFingerprint: plan.planFingerprint, previewPath: resolve(runtimeDirectory, "plan-preview.private.html"), statement: "Exactly one left drag; no retry. No drag has been authorized or dispatched." }, null, 2));
function required(key: string) { const value = args[key]?.trim(); if (!value) throw new Error(`--${key} required`); return value; }
function preview(plan: PreparedSupervisedMove) { const b = plan.windowBounds; const marker = (label: string, point: { x: number; y: number }, color: string) => `<circle cx="${point.x - b.left}" cy="${point.y - b.top}" r="14" fill="${color}"/><text x="${point.x - b.left + 18}" y="${point.y - b.top}">${label}</text>`; return `<!doctype html><meta charset="utf-8"><style>body{background:#111;color:#eee}svg{background:#222}text{fill:#fff}</style><h1>MOVE-003 PRIVATE action preview</h1><p>Exactly one drag; no retry.</p><svg width="${b.width}" height="${b.height}">${marker("SOURCE", plan.source.screen, "#fc0")}${marker("DESTINATION", plan.destination.screen, "#0ef")}</svg>`; }
