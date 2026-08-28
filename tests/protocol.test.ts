import { describe, expect, it } from "vitest";
import { PRIORITIZED_COMMANDS } from "../src/protocol/commands";
import { encodeFrame, FrameDecoder } from "../src/protocol/frameDecoder";
import { encodeWire, VersionedProtobufDecoder } from "../src/protocol/protobufDecoder";
import { sanitizeEvent } from "../src/protocol/sanitizer";
import { StreamReassembler, type TcpSegment } from "../src/protocol/streamReassembler";

const commands = new Set(Object.keys(PRIORITIZED_COMMANDS).map(Number));
const frame = (payload = Uint8Array.from([1, 2, 3])) => encodeFrame(502, payload);
const segment = (sequence: number, payload: Uint8Array, timestampMs = 0): TcpSegment => ({ streamId: "1", direction: "server-to-client", sequence, payload, timestampMs });

describe("application framing", () => {
  it("decodes split headers and split payloads", () => { const decoder = new FrameDecoder({ commands }); const data = frame(); expect(decoder.push(data.slice(0, 4))).toEqual([]); expect(decoder.push(data.slice(4, 9))).toEqual([]); expect(decoder.push(data.slice(9))).toHaveLength(1); });
  it("decodes multiple frames from one chunk", () => { const decoder = new FrameDecoder({ commands }); const one = frame(), both = new Uint8Array(one.byteLength * 2); both.set(one); both.set(one, one.byteLength); expect(decoder.push(both)).toHaveLength(2); });
  it("rejects invalid headers and resynchronizes", () => { const decoder = new FrameDecoder({ commands }); const input = new Uint8Array(3 + frame().byteLength); input.set([0xff, 0, 7]); input.set(frame(), 3); expect(decoder.push(input)).toHaveLength(1); expect(decoder.discardedBytes).toBe(3); });
  it("bounds malformed input memory", () => { const decoder = new FrameDecoder({ maxFrameLength: 16, maxResyncBytes: 8, commands }); expect(() => decoder.push(new Uint8Array(30).fill(255))).toThrow(/memory limit/); });
  it("supports direction-specific outbound header counters with known commands", () => { const outbound = encodeFrame(507, Uint8Array.from([1]), 5); const decoder = new FrameDecoder({ commands, allowedPadding: value => value <= 0xffff }); expect(decoder.push(outbound)).toMatchObject([{ command: 507, padding: 5 }]); });
});

describe("TCP stream reassembly", () => {
  it("drops retransmissions", () => { const r = new StreamReassembler(); expect(r.push(segment(100, Uint8Array.from([1, 2])))[0]!.payload).toEqual(Uint8Array.from([1, 2])); expect(r.push(segment(100, Uint8Array.from([1, 2]))).length).toBe(0); });
  it("trims overlap", () => { const r = new StreamReassembler(); r.push(segment(100, Uint8Array.from([1, 2, 3]))); expect(r.push(segment(102, Uint8Array.from([3, 4])))[0]!.payload).toEqual(Uint8Array.from([4])); });
  it("orders future segments once a gap arrives", () => { const r = new StreamReassembler(); r.push(segment(100, Uint8Array.from([1, 2]))); expect(r.push(segment(104, Uint8Array.from([5, 6])))).toEqual([]); expect(r.push(segment(102, Uint8Array.from([3, 4])))[0]!.payload).toEqual(Uint8Array.from([3, 4, 5, 6])); });
  it("handles sequence wrap", () => { const r = new StreamReassembler(); r.push(segment(0xffff_fffe, Uint8Array.from([1, 2]))); expect(r.push(segment(0, Uint8Array.from([3])))[0]!.payload).toEqual(Uint8Array.from([3])); });
  it("limits out-of-order memory", () => { const r = new StreamReassembler({ maxBufferedBytesPerFlow: 2 }); r.push(segment(100, Uint8Array.from([1]))); expect(() => r.push(segment(110, Uint8Array.from([1, 2, 3])))).toThrow(/memory limit/); });
});

describe("versioned protobuf and sanitization", () => {
  it("round trips a prioritized synthetic message", () => { const payload = encodeWire([{ fieldNumber: 1, wireType: 0, value: 42n }, { fieldNumber: 2, wireType: 2, value: "74657374" }]); const event = new VersionedProtobufDecoder().decode(502, payload); expect(event.kind).toBe("decoded-message"); expect(event.fields).toEqual([{ fieldNumber: 1, wireType: 0, value: 42n }, { fieldNumber: 2, wireType: 2, value: "74657374" }]); });
  it("bounds unknown command previews", () => { const event = new VersionedProtobufDecoder({ unknownPreviewBytes: 2 }).decode(9999, Uint8Array.from([1, 2, 3])); expect(event).toMatchObject({ kind: "unknown-command", hexPreview: "0102" }); });
  it("removes sensitive data and aliases unique IDs", () => { const clean = sanitizeEvent({ schemaVersion: "v1", command: 1, messageType: "test", direction: "in", relativeTimestampMs: 0, data: { accountId: "secret", characterName: "name", itemUniqueId: "99", canonicalId: "design-1", ipAddress: "1.2.3.4" } }); expect(clean.data).toEqual({ itemUniqueId: "item-001", canonicalId: "design-1" }); });
});
