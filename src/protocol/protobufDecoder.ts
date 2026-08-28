import { PRIORITIZED_COMMANDS, SCHEMA_PROVENANCE } from "./commands";

export type ProtobufScalar = bigint | number | string;
export interface ProtobufField { fieldNumber: number; wireType: number; value: ProtobufScalar }
export interface DecodedProtocolEvent {
  kind: "decoded-message" | "unknown-command" | "decode-error";
  command: number; messageType?: string; schemaVersion: string; fields?: ProtobufField[]; hexPreview?: string; error?: string;
}
export interface ProtocolDecoderOptions { maxMessageBytes?: number; maxFields?: number; unknownPreviewBytes?: number }

export class VersionedProtobufDecoder {
  private readonly maxBytes: number; private readonly maxFields: number; private readonly preview: number;
  constructor(options: ProtocolDecoderOptions = {}) { this.maxBytes = options.maxMessageBytes ?? 4 * 1024 * 1024; this.maxFields = options.maxFields ?? 100_000; this.preview = options.unknownPreviewBytes ?? 64; }
  decode(command: number, payload: Uint8Array): DecodedProtocolEvent {
    const messageType = (PRIORITIZED_COMMANDS as Record<number, string>)[command];
    if (!messageType) return { kind: "unknown-command", command, schemaVersion: SCHEMA_PROVENANCE.schemaVersion, hexPreview: hex(payload.slice(0, this.preview)) };
    try {
      return { kind: "decoded-message", command, messageType, schemaVersion: SCHEMA_PROVENANCE.schemaVersion, fields: decodeWire(payload, this.maxBytes, this.maxFields) };
    } catch (error) {
      return { kind: "decode-error", command, messageType, schemaVersion: SCHEMA_PROVENANCE.schemaVersion, error: error instanceof Error ? error.message : "invalid protobuf" };
    }
  }
}

export function decodeWire(payload: Uint8Array, maxBytes: number, maxFields: number): ProtobufField[] {
  if (payload.byteLength > maxBytes) throw new Error("protobuf message memory limit exceeded");
  const fields: ProtobufField[] = []; let offset = 0;
  while (offset < payload.byteLength) {
    if (fields.length >= maxFields) throw new Error("protobuf field limit exceeded");
    const key = readVarint(payload, offset); offset = key.next;
    const fieldNumber = Number(key.value >> 3n), wireType = Number(key.value & 7n);
    if (fieldNumber < 1 || wireType === 3 || wireType === 4 || wireType > 5) throw new Error("invalid protobuf field key");
    if (wireType === 0) { const item = readVarint(payload, offset); offset = item.next; fields.push({ fieldNumber, wireType, value: item.value }); }
    else if (wireType === 1) { requireBytes(payload, offset, 8); fields.push({ fieldNumber, wireType, value: readFixed(payload, offset, 8) }); offset += 8; }
    else if (wireType === 2) { const size = readVarint(payload, offset); offset = size.next; if (size.value > BigInt(maxBytes)) throw new Error("protobuf field memory limit exceeded"); const length = Number(size.value); requireBytes(payload, offset, length); fields.push({ fieldNumber, wireType, value: hex(payload.slice(offset, offset + length)) }); offset += length; }
    else { requireBytes(payload, offset, 4); fields.push({ fieldNumber, wireType, value: Number(readFixed(payload, offset, 4)) }); offset += 4; }
  }
  return fields;
}

export function encodeWire(fields: ProtobufField[]): Uint8Array {
  const bytes: number[] = [];
  for (const field of fields) {
    if (field.fieldNumber < 1 || ![0, 1, 2, 5].includes(field.wireType)) throw new Error("invalid protobuf field");
    writeVarint(bytes, BigInt(field.fieldNumber * 8 + field.wireType));
    if (field.wireType === 0) writeVarint(bytes, BigInt(field.value));
    else if (field.wireType === 1 || field.wireType === 5) {
      let value = BigInt(field.value), count = field.wireType === 1 ? 8 : 4;
      while (count--) { bytes.push(Number(value & 255n)); value >>= 8n; }
    } else {
      if (typeof field.value !== "string" || !/^(?:[a-fA-F0-9]{2})*$/.test(field.value)) throw new Error("length-delimited value must be hex");
      const data = Uint8Array.from(field.value.match(/.{2}/g)?.map(item => Number.parseInt(item, 16)) ?? []); writeVarint(bytes, BigInt(data.byteLength)); bytes.push(...data);
    }
  }
  return Uint8Array.from(bytes);
}

function readVarint(data: Uint8Array, start: number): { value: bigint; next: number } { let value = 0n; for (let i = 0; i < 10; i++) { const at = start + i; requireBytes(data, at, 1); const byte = data[at]!; value |= BigInt(byte & 0x7f) << BigInt(i * 7); if (!(byte & 0x80)) return { value, next: at + 1 }; } throw new Error("invalid protobuf varint"); }
function writeVarint(target: number[], input: bigint): void { if (input < 0n) throw new Error("negative varint unsupported"); let value = input; do { let byte = Number(value & 0x7fn); value >>= 7n; if (value) byte |= 0x80; target.push(byte); } while (value); }
function readFixed(data: Uint8Array, offset: number, size: number): bigint { let value = 0n; for (let i = 0; i < size; i++) value |= BigInt(data[offset + i]!) << BigInt(i * 8); return value; }
function requireBytes(data: Uint8Array, offset: number, count: number): void { if (offset < 0 || count < 0 || offset + count > data.byteLength) throw new Error("truncated protobuf field"); }
const hex = (data: Uint8Array) => Array.from(data, byte => byte.toString(16).padStart(2, "0")).join("");
