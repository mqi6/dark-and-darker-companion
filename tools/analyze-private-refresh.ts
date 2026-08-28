import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FrameDecoder } from "../src/protocol/frameDecoder";
import { asCharacterInfoResponse, decodeSemanticMessage, pinnedPacketCommandIds, type SemanticItem } from "../src/protocol/semanticDecoder";
import { StreamReassembler, type Direction } from "../src/protocol/streamReassembler";
import localizationJson from "../fixtures/darkerdb/localization/catalog.json";
import gameplayJson from "../fixtures/darkerdb/gameplay/catalog.json";
import { localizationCatalogSchema } from "../src/domain/localizedCatalog";
import { gameplayCatalogSchema } from "../src/domain/gameplayCatalog";
import { GameStateReducer } from "../src/domain/gameStateReducer";
import { projectSpatialState } from "../src/domain/inventoryGeometry";
import { evaluateRefreshStateGate } from "../src/protocol/refreshStateReview";

const directory = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Pass a private REF session directory.");
const manifest = JSON.parse((await readFile(resolve(directory, "manifest.private.json"), "utf8")).replace(/^\uFEFF/, "")) as { tsharkPath: string; startUtc: string; gameVersion: string; gameSha256: string; elapsedMilliseconds: number };
const timeline = (await readFile(resolve(directory, "operator-timeline.ndjson"), "utf8")).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as { marker: string; monotonicMilliseconds: number });
const actionStart = timeline.find(value => value.marker === "ACTION_START")?.monotonicMilliseconds;
if (actionStart === undefined) throw new Error("ACTION_START marker is missing.");
const rows = execFileSync(manifest.tsharkPath, ["-r", resolve(directory, "capture.pcapng"), "-T", "fields", "-E", "separator=/t", "-E", "occurrence=f", "-e", "frame.time_epoch", "-e", "tcp.stream", "-e", "tcp.srcport", "-e", "tcp.dstport", "-e", "tcp.seq_raw", "-e", "tcp.len", "-e", "tcp.payload"], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024, windowsHide: true });
const reassembler = new StreamReassembler({ maxBufferedBytesPerFlow: 16 * 1024 * 1024, maxFlows: 128, idleTimeoutMs: 300_000 });
const decoders = new Map<string, FrameDecoder>();
const commandCounts = new Map<number, number>();
const states: Array<{ command: 44 | 552; at: number; result: number; containers: Array<{ inventoryId: number; itemCount: number }>; complete: boolean }> = [];
const characterCandidates: Array<{ relativeTimestampMs: number; response: ReturnType<typeof asCharacterInfoResponse> }> = [];
let frames = 0, discardedBytes = 0;
for (const row of rows.split(/\r?\n/)) {
  if (!row) continue;
  const [epoch, streamId, sourceText, destinationText, sequenceText, lengthText, payloadText] = row.split("\t");
  if (!payloadText || Number(lengthText) <= 0) continue;
  const source = Number(sourceText), destination = Number(destinationText);
  const direction: Direction | undefined = source >= 20200 && source <= 20300 ? "server-to-client" : destination >= 20200 && destination <= 20300 ? "client-to-server" : undefined;
  if (!direction) continue;
  const at = Number(epoch) * 1000 - Date.parse(manifest.startUtc);
  const payload = Uint8Array.from(payloadText.replace(/:/g, "").match(/.{2}/g)?.map(value => Number.parseInt(value, 16)) ?? []);
  for (const chunk of reassembler.push({ streamId, direction, sequence: Number(sequenceText) >>> 0, payload, timestampMs: at })) {
    const key = `${streamId}:${direction}`;
    let decoder = decoders.get(key);
    if (!decoder) { decoder = new FrameDecoder({ maxFrameLength: 4 * 1024 * 1024, maxResyncBytes: 1024 * 1024, commands: pinnedPacketCommandIds, allowedPadding: direction === "client-to-server" ? value => value >= 0 && value <= 0xffff : new Set([0, 256]) }); decoders.set(key, decoder); }
    const before = decoder.discardedBytes;
    for (const frame of decoder.push(chunk.payload)) {
      frames++; commandCounts.set(frame.command, (commandCounts.get(frame.command) ?? 0) + 1);
      if (frame.command !== 44 && frame.command !== 552) continue;
      const decoded = decodeSemanticMessage(frame.command, frame.payload);
      if (!decoded) continue;
      if (frame.command === 44) {
        const response = asCharacterInfoResponse(decoded.value), storage = response.characterDataBase?.characterStorageInfos ?? [];
        characterCandidates.push({ relativeTimestampMs: at, response });
        const containers = storage.map(value => ({ inventoryId: value.inventoryId, itemCount: value.characterStorageItemList.length }));
        const complete = response.result === 1 && Boolean(response.characterDataBase) && uniqueContainers(containers) && storage.every(value => value.characterStorageItemList.every(item => item.inventoryId === value.inventoryId)) && uniqueItems(storage.flatMap(value => value.characterStorageItemList));
        states.push({ command: 44, at, result: response.result, containers, complete });
      } else {
        const result = Number(decoded.value.result ?? 0), items = (decoded.value.storageItems ?? []) as SemanticItem[];
        const ids = [...new Set(items.map(item => Number(item.inventoryId)))];
        const containers = ids.map(inventoryId => ({ inventoryId, itemCount: items.filter(item => Number(item.inventoryId) === inventoryId).length }));
        states.push({ command: 552, at, result, containers, complete: result === 1 && ids.length === 1 && uniqueItems(items) });
      }
    }
    discardedBytes += decoder.discardedBytes - before;
  }
}
const after = states.filter(value => value.at > actionStart);
const successfulComplete = after.filter(value => value.result === 1 && value.complete);
const freshCharacterCandidates = characterCandidates.filter(value => value.relativeTimestampMs > actionStart && value.response.result === 1 && value.response.characterDataBase);
let spatialValidation: { ready: boolean; blockedContainerCount: number; diagnosticCounts: Record<string, number> } | undefined;
if (freshCharacterCandidates.length > 0) {
  const reduced = await new GameStateReducer(localizationCatalogSchema.parse(localizationJson), "refresh-001").replaceBaseline(freshCharacterCandidates);
  const spatial = projectSpatialState(reduced, gameplayCatalogSchema.parse(gameplayJson));
  const diagnostics = spatial.containers.flatMap(container => container.diagnostics);
  spatialValidation = { ready: spatial.ready, blockedContainerCount: spatial.containers.filter(container => container.status === "blocked").length, diagnosticCounts: Object.fromEntries([...new Set(diagnostics.map(value => value.code))].sort().map(code => [code, diagnostics.filter(value => value.code === code).length])) };
}
const review = {
  reviewVersion: 1, sampleId: directory.match(/REF-\d{3}/)?.[0] ?? "REF-UNKNOWN", sanitized: true,
  build: { gameVersion: manifest.gameVersion, gameSha256MatchesPinned: manifest.gameSha256.toLowerCase() === "7ef0cbe431ec49f5724b213b629d73aad9f524d7cdc5a43bae1d6307647cfb87" },
  capture: { elapsedMilliseconds: Math.round(manifest.elapsedMilliseconds), validFrames: frames, discardedBytes },
  actionStartMilliseconds: Math.round(actionStart), commandCounts: Object.fromEntries([...commandCounts].sort(([a], [b]) => a - b)),
  stateMessagesAfterAction: after.map(value => ({ command: value.command, relativeTimestampMilliseconds: Math.round(value.at), result: value.result, containers: value.containers, complete: value.complete })),
  successfulCompleteFreshStateCount: successfulComplete.length,
  spatialValidation,
  visibleTenTabInventoryIdSet: successfulComplete.at(-1)?.containers.map(value => value.inventoryId).sort((a, b) => a - b),
  gate: evaluateRefreshStateGate(actionStart, states.map(value => ({ command: value.command, relativeTimestampMilliseconds: value.at, result: value.result, complete: value.complete })), spatialValidation?.ready ?? false),
  intentionallyOmitted: ["packetPayloads", "rawItemUniqueIds", "accountAndCharacterIdentifiers", "networkAddresses", "completeStashLayouts"]
};
await writeFile(resolve(directory, "refresh-review.sanitized-private.json"), `${JSON.stringify(review, null, 2)}\n`, "utf8");
console.log(`Wrote private sanitized refresh review; gate=${review.gate}; completeFreshStates=${successfulComplete.length}.`);

function uniqueContainers(values: Array<{ inventoryId: number }>): boolean { return new Set(values.map(value => value.inventoryId)).size === values.length; }
function uniqueItems(values: SemanticItem[]): boolean { const ids = values.map(value => String(value.itemUniqueId)); return ids.every(Boolean) && new Set(ids).size === ids.length; }
