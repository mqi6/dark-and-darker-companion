import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FrameDecoder } from "../src/protocol/frameDecoder";
import {
  decodeSemanticMessage,
  pinnedPacketCommandIds
} from "../src/protocol/semanticDecoder";
import { StreamReassembler, type Direction } from "../src/protocol/streamReassembler";

export interface PrivateCaptureManifest {
  tsharkPath: string;
  gameVersion: string;
  gameSha256: string;
  elapsedMilliseconds: number;
  startUtc: string;
}

export interface PrivateTimelineEntry {
  marker: string;
  monotonicMilliseconds: number;
}

export interface PrivateDecodedEvent {
  relativeAtMilliseconds: number;
  absoluteAtMilliseconds: number;
  direction: Direction;
  command: number;
  value: Record<string, any>;
}

export interface PrivateCapture {
  directory: string;
  manifest: PrivateCaptureManifest;
  timeline: readonly PrivateTimelineEntry[];
  events: readonly PrivateDecodedEvent[];
  validFrames: number;
  discardedBytes: number;
}

export async function readPrivateCapture(directoryInput: string): Promise<PrivateCapture> {
  const directory = resolve(directoryInput);
  const manifest = JSON.parse(
    (await readFile(resolve(directory, "manifest.private.json"), "utf8")).replace(/^\uFEFF/, "")
  ) as PrivateCaptureManifest;
  const timelineText = await readFile(resolve(directory, "operator-timeline.ndjson"), "utf8")
    .catch(error => isMissingFile(error) ? "" : Promise.reject(error));
  const timeline = timelineText
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line) as PrivateTimelineEntry);
  const fields = execFileSync(manifest.tsharkPath, [
    "-r", resolve(directory, "capture.pcapng"),
    "-T", "fields",
    "-E", "separator=/t",
    "-E", "occurrence=f",
    "-e", "frame.time_epoch",
    "-e", "tcp.stream",
    "-e", "tcp.srcport",
    "-e", "tcp.dstport",
    "-e", "tcp.seq_raw",
    "-e", "tcp.len",
    "-e", "tcp.payload"
  ], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true
  });

  const reassembler = new StreamReassembler({
    maxBufferedBytesPerFlow: 16 * 1024 * 1024,
    maxFlows: 128,
    idleTimeoutMs: 300_000
  });
  const decoders = new Map<string, FrameDecoder>();
  const events: PrivateDecodedEvent[] = [];
  let validFrames = 0;
  let discardedBytes = 0;
  const captureStartMilliseconds = Date.parse(manifest.startUtc);
  if (!Number.isFinite(captureStartMilliseconds)) {
    throw new Error("Private capture manifest has an invalid startUtc.");
  }

  for (const line of fields.split(/\r?\n/)) {
    if (!line) continue;
    const [epoch, streamId, sourceText, destinationText, sequenceText, lengthText, payloadText] =
      line.split("\t");
    if (!streamId || !payloadText || Number(lengthText) <= 0) continue;
    const source = Number(sourceText);
    const destination = Number(destinationText);
    const direction: Direction | undefined =
      source >= 20200 && source <= 20300
        ? "server-to-client"
        : destination >= 20200 && destination <= 20300
          ? "client-to-server"
          : undefined;
    if (!direction) continue;
    const payload = Uint8Array.from(
      payloadText.replace(/:/g, "").match(/.{2}/g)?.map(value => Number.parseInt(value, 16)) ?? []
    );
    const absoluteAtMilliseconds = Number(epoch) * 1000;
    const relativeAtMilliseconds = absoluteAtMilliseconds - captureStartMilliseconds;
    for (const chunk of reassembler.push({
      streamId,
      direction,
      sequence: Number(sequenceText) >>> 0,
      payload,
      timestampMs: relativeAtMilliseconds
    })) {
      const decoderKey = `${streamId}:${direction}`;
      let decoder = decoders.get(decoderKey);
      if (!decoder) {
        decoder = new FrameDecoder({
          maxFrameLength: 4 * 1024 * 1024,
          maxResyncBytes: 1024 * 1024,
          commands: pinnedPacketCommandIds,
          allowedPadding:
            direction === "client-to-server"
              ? value => value >= 0 && value <= 0xffff
              : new Set([0, 256])
        });
        decoders.set(decoderKey, decoder);
      }
      const discardedBefore = decoder.discardedBytes;
      for (const frame of decoder.push(chunk.payload)) {
        validFrames += 1;
        const decoded = decodeSemanticMessage(frame.command, frame.payload);
        if (decoded) {
          events.push({
            relativeAtMilliseconds,
            absoluteAtMilliseconds,
            direction,
            command: frame.command,
            value: decoded.value
          });
        }
      }
      discardedBytes += decoder.discardedBytes - discardedBefore;
    }
  }

  return {
    directory,
    manifest,
    timeline,
    events,
    validFrames,
    discardedBytes
  };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function markerTime(capture: PrivateCapture, marker: string): number | undefined {
  const matches = capture.timeline.filter(value => value.marker === marker);
  return matches.length === 1 ? matches[0]!.monotonicMilliseconds : undefined;
}
