export type Direction = "client-to-server" | "server-to-client";
export interface TcpSegment { streamId: string; direction: Direction; sequence: number; payload: Uint8Array; timestampMs: number }
export interface ReassembledChunk { streamId: string; direction: Direction; payload: Uint8Array }
export interface ReassemblerOptions { maxBufferedBytesPerFlow?: number; maxFlows?: number; idleTimeoutMs?: number }
interface Flow { next?: number; pending: Map<number, Uint8Array>; pendingBytes: number; lastSeen: number }
const U32 = 0x1_0000_0000;
const addSeq = (a: number, n: number) => (a + n) >>> 0;
const distance = (from: number, to: number) => (to - from + U32) % U32;

export class StreamReassembler {
  private flows = new Map<string, Flow>();
  private readonly maxBytes: number; private readonly maxFlows: number; private readonly idle: number;
  constructor(options: ReassemblerOptions = {}) { this.maxBytes = options.maxBufferedBytesPerFlow ?? 4 * 1024 * 1024; this.maxFlows = options.maxFlows ?? 128; this.idle = options.idleTimeoutMs ?? 120_000; }

  push(segment: TcpSegment): ReassembledChunk[] {
    this.evictIdle(segment.timestampMs);
    const key = `${segment.streamId}:${segment.direction}`;
    let flow = this.flows.get(key);
    if (!flow) { if (this.flows.size >= this.maxFlows) throw new Error("TCP flow limit exceeded"); flow = { pending: new Map(), pendingBytes: 0, lastSeen: segment.timestampMs }; this.flows.set(key, flow); }
    flow.lastSeen = segment.timestampMs;
    if (!segment.payload.byteLength) return [];
    if (flow.next === undefined) flow.next = segment.sequence >>> 0;
    let seq = segment.sequence >>> 0, data = segment.payload;
    const behind = distance(seq, flow.next);
    if (behind > 0 && behind < 0x8000_0000) { if (behind >= data.byteLength) return []; data = data.slice(behind); seq = flow.next; }
    if (seq === flow.next) {
      const parts = [data]; flow.next = addSeq(flow.next, data.byteLength);
      while (true) {
        let found = false;
        for (const [pendingSeq, pending] of flow.pending) {
          const overlap = distance(pendingSeq, flow.next);
          if (pendingSeq === flow.next || (overlap > 0 && overlap < 0x8000_0000 && overlap < pending.byteLength)) {
            const tail = pendingSeq === flow.next ? pending : pending.slice(overlap);
            flow.pending.delete(pendingSeq); flow.pendingBytes -= pending.byteLength;
            if (tail.byteLength) { parts.push(tail); flow.next = addSeq(flow.next, tail.byteLength); }
            found = true; break;
          }
        }
        if (!found) break;
      }
      const size = parts.reduce((n, p) => n + p.byteLength, 0), payload = new Uint8Array(size); let offset = 0;
      for (const part of parts) { payload.set(part, offset); offset += part.byteLength; }
      return [{ streamId: segment.streamId, direction: segment.direction, payload }];
    }
    const ahead = distance(flow.next, seq);
    if (ahead < 0x8000_0000) {
      const prior = flow.pending.get(seq);
      if (!prior || data.byteLength > prior.byteLength) { flow.pendingBytes += data.byteLength - (prior?.byteLength ?? 0); flow.pending.set(seq, data); }
      if (flow.pendingBytes > this.maxBytes) { this.flows.delete(key); throw new Error("TCP flow memory limit exceeded"); }
    }
    return [];
  }

  get flowCount(): number { return this.flows.size; }
  private evictIdle(now: number): void { for (const [key, flow] of this.flows) if (now - flow.lastSeen > this.idle) this.flows.delete(key); }
}
