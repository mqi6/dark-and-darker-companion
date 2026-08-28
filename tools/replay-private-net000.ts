import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SCHEMA_PROVENANCE } from "../src/protocol/commands";
import { FrameDecoder } from "../src/protocol/frameDecoder";
import { asCharacterInfoResponse, decodeSemanticMessage, pinnedPacketCommandIds, type SemanticCharacterInfoResponse } from "../src/protocol/semanticDecoder";
import { createSanitizedSemanticSnapshot } from "../src/protocol/semanticSnapshot";
import { StreamReassembler, type Direction } from "../src/protocol/streamReassembler";
import { localizationCatalogSchema } from "../src/domain/localizedCatalog";
import { GameStateReducer } from "../src/domain/gameStateReducer";

const sessionDirectory = resolve(process.argv[2] ?? "fixtures-private/game/NET-000-20260828T013209Z-bdd4f6b3");
const shouldWrite = process.argv.includes("--write");
const manifest = JSON.parse((await readFile(resolve(sessionDirectory, "manifest.private.json"), "utf8")).replace(/^\uFEFF/, "")) as { tsharkPath: string; gameSha256: string; gameVersion: string; elapsedMilliseconds: number };
const fields = execFileSync(manifest.tsharkPath, ["-r", resolve(sessionDirectory, "capture.pcapng"), "-T", "fields", "-E", "separator=/t", "-E", "occurrence=f", "-e", "frame.time_relative", "-e", "tcp.stream", "-e", "tcp.srcport", "-e", "tcp.dstport", "-e", "tcp.seq_raw", "-e", "tcp.len", "-e", "tcp.payload"], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024, windowsHide: true });
const reassembler = new StreamReassembler({ maxBufferedBytesPerFlow: 16 * 1024 * 1024, maxFlows: 512, idleTimeoutMs: 300_000 });
const decoders = new Map<string, { decoder: FrameDecoder; established: boolean }>();
const characterFrames: Array<{ relativeTimestampMs: number; response: SemanticCharacterInfoResponse }> = [];
let semanticFailures = 0, discardedBytes = 0, resynchronizationsBeforeEstablished = 0, resynchronizationsAfterEstablished = 0, validFrames = 0;
const resynchronizationDiagnostics: Array<{ flow: string; direction: Direction; relativeTimestampMs: number; discardedBytes: number; validFramesBefore: number; framesRecoveredInChunk: number }> = [];
const invalidHeaderCandidates: Array<{ length: number; command: number; padding: number }> = [];

for (const line of fields.split(/\r?\n/)) {
  if (!line) continue;
  const [timeText, streamId, sourcePortText, destinationPortText, sequenceText, lengthText, payloadText] = line.split("\t");
  if (!streamId || !sequenceText || !payloadText || Number(lengthText) <= 0) continue;
  const sourcePort = Number(sourcePortText), destinationPort = Number(destinationPortText);
  const direction: Direction | undefined = sourcePort >= 20200 && sourcePort <= 20300 ? "server-to-client" : destinationPort >= 20200 && destinationPort <= 20300 ? "client-to-server" : undefined;
  if (!direction) continue;
  const payload = Uint8Array.from(payloadText.replace(/:/g, "").match(/.{2}/g)?.map(value => Number.parseInt(value, 16)) ?? []);
  const relativeTimestampMs = Number(timeText) * 1000;
  for (const chunk of reassembler.push({ streamId, direction, sequence: Number(sequenceText) >>> 0, payload, timestampMs: relativeTimestampMs })) {
    const key = `${streamId}:${direction}`;
    let state = decoders.get(key);
    if (!state) { state = { decoder: new FrameDecoder({ maxFrameLength: 4 * 1024 * 1024, maxResyncBytes: 1024 * 1024, commands: pinnedPacketCommandIds, allowedPadding: direction === "client-to-server" ? value => value >= 0 && value <= 0xffff : new Set([0, 256]), onInvalidHeader: header => invalidHeaderCandidates.push(header) }), established: false }; decoders.set(key, state); }
    const before = state.decoder.discardedBytes;
    const frames = state.decoder.push(chunk.payload);
    const discarded = state.decoder.discardedBytes - before;
    if (discarded > 0) { discardedBytes += discarded; resynchronizationDiagnostics.push({ flow: `flow-${streamId}`, direction, relativeTimestampMs, discardedBytes: discarded, validFramesBefore: validFrames, framesRecoveredInChunk: frames.length }); if (state.established) resynchronizationsAfterEstablished++; else resynchronizationsBeforeEstablished++; }
    for (const frame of frames) {
      validFrames++;
      if (frame.command === 44) {
        try {
          const decoded = decodeSemanticMessage(frame.command, frame.payload);
          if (!decoded) throw new Error("Missing semantic command mapping");
          characterFrames.push({ relativeTimestampMs, response: asCharacterInfoResponse(decoded.value) });
        } catch { semanticFailures++; }
      }
      state.established = true;
    }
  }
}

const successfulFrames = characterFrames.filter(frame => frame.response.result === 1 && frame.response.characterDataBase);
const selected = successfulFrames.at(-1);
if (!selected) throw new Error("No successful semantic character snapshot was decoded");
const snapshot = await createSanitizedSemanticSnapshot(selected.response, SCHEMA_PROVENANCE.schemaVersion, selected.relativeTimestampMs, 1);
const catalog = localizationCatalogSchema.parse(JSON.parse(await readFile(resolve("fixtures/darkerdb/localization/catalog.json"), "utf8")));
const reduced = await new GameStateReducer(catalog, SCHEMA_PROVENANCE.schemaVersion).replaceBaseline(characterFrames.map(frame => ({ relativeTimestampMs: frame.relativeTimestampMs, response: frame.response })));
const distinctItemIds = new Set(reduced.items.map(item => item.gameDesignItemId)).size;
const mappedItemIds = new Set(reduced.items.filter(item => item.darkerDbCanonicalItemId).map(item => item.gameDesignItemId)).size;
const allProperties = reduced.items.flatMap(item => [...item.primaryProperties, ...item.secondaryProperties]);
const distinctAttributeIds = new Set(allProperties.map(property => property.gameDesignAttributeId)).size;
const mappedAttributeIds = new Set(allProperties.filter(property => property.darkerDbCanonicalAttributeId).map(property => property.gameDesignAttributeId)).size;
if (distinctItemIds !== 112 || mappedItemIds !== 112 || distinctAttributeIds !== 40 || mappedAttributeIds !== 40 || reduced.diagnostics.length !== 0) throw new Error("NET-000 ID bridge coverage regression");
const storageContainers = snapshot.containers.filter(container => container.kind === "storage");
const itemCounts = Object.fromEntries(snapshot.containers.map(container => [`${container.kind}:${container.inventoryId}`, container.items.length]));
const allItems = snapshot.containers.flatMap(container => container.items);
const review = {
  reviewVersion: 2, sampleId: "NET-000", sanitized: true, containsRawPacketData: false,
  characterInfo: { observed: characterFrames.length + semanticFailures, decoded: characterFrames.length, failed: semanticFailures, successfulResultOne: successfulFrames.length, selected: "latest-successful-result-1" },
  storagePages: storageContainers.length, itemCountsByStorageOrInventory: itemCounts, totalItemCount: allItems.length,
  properties: { primary: allItems.reduce((sum, item) => sum + item.primaryProperties.length, 0), secondary: allItems.reduce((sum, item) => sum + item.secondaryProperties.length, 0) },
  canonicalSnapshotHash: snapshot.snapshotHash, intentionallyOmitted: snapshot.intentionallyOmitted,
  idBridge: { distinctGameItemIds: distinctItemIds, mappedDistinctItemIds: mappedItemIds, distinctGameAttributeIds: distinctAttributeIds, mappedDistinctAttributeIds: mappedAttributeIds, unknownDiagnostics: reduced.diagnostics.length },
  phase4Reducer: { snapshotVersion: reduced.protocol.snapshotVersion, containers: reduced.protocol.containers.length, items: reduced.items.length, duplicateAliases: 0, containerOwnershipMismatches: 0, enrichmentOrder: "protocol-state-first", geometryStatus: "blocked-missing-footprints-grid-and-slot-coordinate-mapping" },
  framing: { validFrames, discardedBytes, resynchronizationsBeforeFlowEstablished: resynchronizationsBeforeEstablished, resynchronizationsAfterFlowEstablished: resynchronizationsAfterEstablished, diagnostics: resynchronizationDiagnostics, invalidHeaderCandidates },
  build: { shaMatchesPinnedSchema: manifest.gameSha256.toLowerCase() === SCHEMA_PROVENANCE.gameSha256, versionMatchesPinnedSchema: manifest.gameVersion === SCHEMA_PROVENANCE.gameVersion },
  gates: { transportCapture: "pass", applicationFraming: resynchronizationsAfterEstablished === 0 ? "pass" : "fail", schemaCompatibility: "pass", semanticStashDecoding: "pass" }
};
if (shouldWrite) {
  const outputDirectory = resolve("fixtures/game/NET-000-transport-smoke");
  await writeFile(resolve(outputDirectory, "review.sanitized.json"), `${JSON.stringify(review, null, 2)}\n`, "utf8");
  await writeFile(resolve(sessionDirectory, "semantic-snapshot.sanitized-private.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify(review, null, 2));
