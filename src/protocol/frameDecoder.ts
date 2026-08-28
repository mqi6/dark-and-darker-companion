export interface ApplicationFrame { command: number; padding: number; payload: Uint8Array; rawLength: number }
export interface FrameDecoderOptions { maxFrameLength?: number; commands?: ReadonlySet<number>; allowedPadding?: ReadonlySet<number>; maxResyncBytes?: number }

export class FrameDecoder {
  private buffer = new Uint8Array();
  private readonly maxFrameLength: number;
  private readonly commands: ReadonlySet<number> | undefined;
  private readonly allowedPadding: ReadonlySet<number>;
  private readonly maxResyncBytes: number;
  public discardedBytes = 0;

  constructor(options: FrameDecoderOptions = {}) {
    this.maxFrameLength = options.maxFrameLength ?? 4 * 1024 * 1024;
    this.commands = options.commands;
    this.allowedPadding = options.allowedPadding ?? new Set([0, 256]);
    this.maxResyncBytes = options.maxResyncBytes ?? 64 * 1024;
    if (this.maxFrameLength < 8) throw new Error("maxFrameLength must be at least 8");
  }

  push(chunk: Uint8Array): ApplicationFrame[] {
    if (chunk.byteLength) {
      if (this.buffer.byteLength + chunk.byteLength > this.maxFrameLength + this.maxResyncBytes) {
        throw new Error("frame decoder memory limit exceeded");
      }
      const joined = new Uint8Array(this.buffer.byteLength + chunk.byteLength);
      joined.set(this.buffer); joined.set(chunk, this.buffer.byteLength); this.buffer = joined;
    }
    const frames: ApplicationFrame[] = [];
    while (this.buffer.byteLength >= 8) {
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
      const length = view.getUint32(0, true), command = view.getUint16(4, true), padding = view.getUint16(6, true);
      if (!this.validHeader(length, command, padding)) {
        this.buffer = this.buffer.slice(1); this.discardedBytes++;
        if (this.discardedBytes > this.maxResyncBytes) throw new Error("frame resynchronization limit exceeded");
        continue;
      }
      if (this.buffer.byteLength < length) break;
      frames.push({ command, padding, payload: this.buffer.slice(8, length), rawLength: length });
      this.buffer = this.buffer.slice(length);
    }
    return frames;
  }

  get bufferedBytes(): number { return this.buffer.byteLength; }
  private validHeader(length: number, command: number, padding: number): boolean {
    return length >= 8 && length <= this.maxFrameLength && this.allowedPadding.has(padding) && (!this.commands || this.commands.has(command));
  }
}

export function encodeFrame(command: number, payload: Uint8Array, padding = 0): Uint8Array {
  const result = new Uint8Array(8 + payload.byteLength), view = new DataView(result.buffer);
  view.setUint32(0, result.byteLength, true); view.setUint16(4, command, true); view.setUint16(6, padding, true); result.set(payload, 8);
  return result;
}
