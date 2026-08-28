import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PRIORITIZED_COMMANDS, SCHEMA_PROVENANCE } from "../src/protocol/commands";
import { FrameDecoder } from "../src/protocol/frameDecoder";
import { decodeSemanticMessage, pinnedPacketCommandIds, type SemanticItem } from "../src/protocol/semanticDecoder";
import { StreamReassembler, type Direction } from "../src/protocol/streamReassembler";

const directory = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Usage: npm exec tsx tools/analyze-private-act001.ts <private-session-directory>");
const manifest = JSON.parse((await readFile(resolve(directory, "manifest.private.json"), "utf8")).replace(/^\uFEFF/, "")) as { tsharkPath: string; gameVersion: string; gameSha256: string; elapsedMilliseconds: number; startUtc: string };
const timeline = (await readFile(resolve(directory, "operator-timeline.ndjson"), "utf8")).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as { marker: string; monotonicMilliseconds: number });
const marker = (name: string) => timeline.find(value => value.marker === name)?.monotonicMilliseconds;
const actionStart = marker("ACTION_START") ?? Number.POSITIVE_INFINITY;
const fields = execFileSync(manifest.tsharkPath, ["-r", resolve(directory, "capture.pcapng"), "-T", "fields", "-E", "separator=/t", "-E", "occurrence=f", "-e", "frame.time_epoch", "-e", "tcp.stream", "-e", "tcp.srcport", "-e", "tcp.dstport", "-e", "tcp.seq_raw", "-e", "tcp.len", "-e", "tcp.payload"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
const reassembler = new StreamReassembler({ maxBufferedBytesPerFlow: 16 * 1024 * 1024, maxFlows: 128, idleTimeoutMs: 300_000 });
const decoders = new Map<string, FrameDecoder>();
const commands = new Map<number, number>();
const messages: Array<{ at: number; direction: Direction; command: number; value: Record<string, any> }> = [];
let packets = 0, payloadSegments = 0, clientToServer = 0, serverToClient = 0, frames = 0, discardedBytes = 0;
for (const line of fields.split(/\r?\n/)) {
  if (!line) continue;
  packets++;
  const [epoch, stream, sourceText, destinationText, sequence, length, payloadText] = line.split("\t");
  if (!payloadText || Number(length) <= 0) continue;
  payloadSegments++;
  const source = Number(sourceText), destination = Number(destinationText);
  const direction: Direction | undefined = source >= 20200 && source <= 20300 ? "server-to-client" : destination >= 20200 && destination <= 20300 ? "client-to-server" : undefined;
  if (!direction) continue;
  direction === "client-to-server" ? clientToServer++ : serverToClient++;
  const payload = Uint8Array.from(payloadText.replace(/:/g, "").match(/.{2}/g)?.map(value => Number.parseInt(value, 16)) ?? []);
  const at = Number(epoch) * 1000 - Date.parse(manifest.startUtc);
  for (const chunk of reassembler.push({ streamId: stream, direction, sequence: Number(sequence) >>> 0, payload, timestampMs: at })) {
    const key = `${stream}:${direction}`;
    let decoder = decoders.get(key);
    if (!decoder) { decoder = new FrameDecoder({ maxFrameLength: 4 * 1024 * 1024, maxResyncBytes: 1024 * 1024, commands: pinnedPacketCommandIds, allowedPadding: direction === "client-to-server" ? value => value >= 0 && value <= 0xffff : new Set([0, 256]) }); decoders.set(key, decoder); }
    const before = decoder.discardedBytes;
    for (const frame of decoder.push(chunk.payload)) {
      frames++; commands.set(frame.command, (commands.get(frame.command) ?? 0) + 1);
      const decoded = decodeSemanticMessage(frame.command, frame.payload);
      if (decoded) messages.push({ at, direction, command: frame.command, value: decoded.value });
    }
    discardedBytes += decoder.discardedBytes - before;
  }
}

const moveRequests = messages.filter(value => value.command === 507);
const moveResponses = messages.filter(value => value.command === 508 && value.at >= actionStart);
const updates = messages.filter(value => [44, 502, 504, 506, 552].includes(value.command));
const aliases = new Map<string, string>();
const alias = (id: unknown) => { const key = String(id); if (!aliases.has(key)) aliases.set(key, `item-${String(aliases.size + 1).padStart(3, "0")}`); return aliases.get(key)!; };
const itemsFrom = (message: typeof messages[number]): SemanticItem[] => {
  if (message.command === 44) {
    const character = message.value.characterDataBase;
    return [...(character?.CharacterItemList ?? []), ...(character?.CharacterStorageInfos ?? []).flatMap((storage: any) => storage.CharacterStorageItemList ?? [])];
  }
  if (message.command === 552) return message.value.storageItems ?? [];
  if (message.command === 502 || message.command === 504) return message.value.inventoryItems ?? [];
  if (message.command === 506) return message.value.newItem ?? [];
  return [];
};
const request = moveRequests[0]?.value;
const uniqueId = request?.srcInfo?.uniqueId;
const intendedAlias = uniqueId === undefined ? undefined : alias(uniqueId);
const preCandidates = updates.filter(value => value.at < actionStart && itemsFrom(value).some(item => String(item.itemUniqueId) === String(uniqueId)));
const requestAt = moveRequests[0]?.at;\nconst postCandidates = requestAt === undefined ? [] : updates.filter(value => value.at > requestAt);
const pre = preCandidates.at(-1), post = postCandidates.find(value => itemsFrom(value).some(item => String(item.itemUniqueId) === String(uniqueId)));
const preItem = pre && itemsFrom(pre).find(item => String(item.itemUniqueId) === String(uniqueId));
const postItem = post && itemsFrom(post).find(item => String(item.itemUniqueId) === String(uniqueId));
const review = {
  reviewVersion: 1, sampleId: "ACT-001", sanitized: true, containsRawPacketData: false,
  build: { versionMatchesPinned: manifest.gameVersion === SCHEMA_PROVENANCE.gameVersion, shaMatchesPinned: manifest.gameSha256.toLowerCase() === SCHEMA_PROVENANCE.gameSha256 },
  capture: { durationMilliseconds: manifest.elapsedMilliseconds, packets, tcpPayloadSegments: payloadSegments, clientToServer, serverToClient, validFrames: frames, discardedBytes },
  commands: Object.fromEntries([...commands].sort(([a], [b]) => a - b).map(([id, count]) => [PRIORITIZED_COMMANDS[id as keyof typeof PRIORITIZED_COMMANDS] ?? `command-${id}`, count])),
  action: {
    matchingMoveRequests: moveRequests.length, moveResponses: moveResponses.length, requestAtMilliseconds: moveRequests[0]?.at, alias: intendedAlias,
    request: request ? { sourceInventoryId: Number(request.srcInfo?.inventoryId), sourceSlotId: Number(request.srcInfo?.slotId), destinationInventoryId: Number(request.dstInventoryId), destinationSlotId: Number(request.dstSlotId) } : undefined,
    preState: preItem ? { atMilliseconds: pre!.at, alias: alias(preItem.itemUniqueId), inventoryId: preItem.inventoryId, slotId: preItem.slotId, quantity: preItem.itemCount, gameDesignItemId: preItem.itemId } : undefined,
    postState: postItem ? { atMilliseconds: post!.at, alias: alias(postItem.itemUniqueId), inventoryId: postItem.inventoryId, slotId: postItem.slotId, quantity: postItem.itemCount, gameDesignItemId: postItem.itemId } : undefined,
    newerPostStateObserved: Boolean(post && pre && post.at > pre.at)
  },
  intentionallyOmitted: ["rawPacketPayloads", "networkAddresses", "rawItemUniqueIds", "accountAndCharacterIdentifiers", "completeStashLayouts"]
};
await writeFile(resolve(directory, "review.sanitized-private.json"), `${JSON.stringify(review, null, 2)}\n`, "utf8");
console.log(`Wrote sanitized private ACT-001 review under ${directory}`);
