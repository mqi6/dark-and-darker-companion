import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PRIORITIZED_COMMANDS } from "../src/protocol/commands";
import { encodeFrame, FrameDecoder } from "../src/protocol/frameDecoder";
import { encodeWire, VersionedProtobufDecoder, type ProtobufField } from "../src/protocol/protobufDecoder";

const file = resolve(process.argv[2] ?? "fixtures/game/synthetic-protocol-v1/events.sanitized.json");
const events = JSON.parse(await readFile(file, "utf8")) as Array<{ command: number; messageType: string; fields: Array<Omit<ProtobufField, "value"> & { value: string | number }> }>;
const frameDecoder = new FrameDecoder({ commands: new Set(Object.keys(PRIORITIZED_COMMANDS).map(Number)) });
const protocolDecoder = new VersionedProtobufDecoder();
for (const event of events) {
  const payload = encodeWire(event.fields.map(field => ({ ...field, value: field.wireType === 0 || field.wireType === 1 || field.wireType === 5 ? BigInt(field.value) : String(field.value) })));
  const frames = frameDecoder.push(encodeFrame(event.command, payload));
  const decoded = protocolDecoder.decode(frames[0]!.command, frames[0]!.payload);
  if (decoded.kind !== "decoded-message" || decoded.messageType !== event.messageType) throw new Error(`Replay mismatch for command ${event.command}`);
}
console.log(`Replayed ${events.length} synthetic protocol events from ${file}`);
