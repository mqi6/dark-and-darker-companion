import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import localizationJson from "../fixtures/darkerdb/localization/catalog.json";
import gameplayJson from "../fixtures/darkerdb/gameplay/catalog.json";
import { GameStateReducer } from "../src/domain/gameStateReducer";
import { gameplayCatalogSchema } from "../src/domain/gameplayCatalog";
import {
  projectSpatialState,
  RECTANGULAR_STORAGE_INVENTORY_IDS
} from "../src/domain/inventoryGeometry";
import { localizationCatalogSchema } from "../src/domain/localizedCatalog";
import {
  selectLatestCompletePostState,
  selectLatestCompletePreState,
  selectSingleActionEvent,
  validateMoveCaptureWindow,
  type MoveCaptureWindow
} from "../src/domain/moveCaptureSelection";
import { correlateMove, type MoveCorrelation, type MoveItemState } from "../src/domain/moveCorrelation";
import { SessionItemAliasRegistry } from "../src/domain/sessionItemAliasRegistry";
import { PRIORITIZED_COMMANDS, SCHEMA_PROVENANCE } from "../src/protocol/commands";
import { FrameDecoder } from "../src/protocol/frameDecoder";
import {
  asCharacterInfoResponse,
  decodeSemanticMessage,
  pinnedPacketCommandIds,
  type SemanticCharacterInfoResponse,
  type SemanticItem
} from "../src/protocol/semanticDecoder";
import { StreamReassembler, type Direction } from "../src/protocol/streamReassembler";

interface PrivateManifest {
  tsharkPath: string;
  gameVersion: string;
  gameSha256: string;
  elapsedMilliseconds: number;
  startUtc: string;
}

interface TimelineEntry {
  marker: string;
  monotonicMilliseconds: number;
}

interface DecodedEvent {
  atMilliseconds: number;
  direction: Direction;
  command: number;
  value: Record<string, any>;
}

interface CompleteStateValue {
  response: SemanticCharacterInfoResponse;
  items: SemanticItem[];
  containerIds: number[];
}

const directory = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  throw new Error("Usage: npm run protocol:analyze-move002 -- <private-session-directory>");
}

const manifest = JSON.parse(
  (await readFile(resolve(directory, "manifest.private.json"), "utf8")).replace(/^\uFEFF/, "")
) as PrivateManifest;
const timeline = (await readFile(resolve(directory, "operator-timeline.ndjson"), "utf8"))
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map(line => JSON.parse(line) as TimelineEntry);

const markerTime = (name: string): number => {
  const matches = timeline.filter(value => value.marker === name);
  if (matches.length !== 1) throw new Error(`MOVE-002 requires exactly one ${name} marker; observed ${matches.length}.`);
  return matches[0]!.monotonicMilliseconds;
};
const window: MoveCaptureWindow = {
  readyAtMilliseconds: markerTime("READY"),
  actionStartAtMilliseconds: markerTime("ACTION_START"),
  actionEndAtMilliseconds: markerTime("ACTION_END"),
  stopAtMilliseconds: markerTime("STOP")
};
validateMoveCaptureWindow(window);

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
const commandCounts = new Map<number, number>();
const events: DecodedEvent[] = [];
let packets = 0;
let payloadSegments = 0;
let clientToServerSegments = 0;
let serverToClientSegments = 0;
let validFrames = 0;
let discardedBytes = 0;

for (const line of fields.split(/\r?\n/)) {
  if (!line) continue;
  packets += 1;
  const [epoch, streamId, sourceText, destinationText, sequenceText, lengthText, payloadText] =
    line.split("\t");
  if (!payloadText || Number(lengthText) <= 0) continue;
  payloadSegments += 1;
  const source = Number(sourceText);
  const destination = Number(destinationText);
  const direction: Direction | undefined =
    source >= 20200 && source <= 20300
      ? "server-to-client"
      : destination >= 20200 && destination <= 20300
        ? "client-to-server"
        : undefined;
  if (!direction) continue;
  if (direction === "client-to-server") clientToServerSegments += 1;
  else serverToClientSegments += 1;

  const payload = Uint8Array.from(
    payloadText.replace(/:/g, "").match(/.{2}/g)?.map(value => Number.parseInt(value, 16)) ?? []
  );
  const atMilliseconds = Number(epoch) * 1000 - Date.parse(manifest.startUtc);
  for (const chunk of reassembler.push({
    streamId,
    direction,
    sequence: Number(sequenceText) >>> 0,
    payload,
    timestampMs: atMilliseconds
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
      commandCounts.set(frame.command, (commandCounts.get(frame.command) ?? 0) + 1);
      const decoded = decodeSemanticMessage(frame.command, frame.payload);
      if (decoded) {
        events.push({
          atMilliseconds,
          direction,
          command: frame.command,
          value: decoded.value
        });
      }
    }
    discardedBytes += decoder.discardedBytes - discardedBefore;
  }
}

const moveRequestEvents = events
  .filter(event => event.command === 507 && event.direction === "client-to-server")
  .map(event => ({ atMilliseconds: event.atMilliseconds, value: event.value }));
const requestSelection = selectSingleActionEvent(moveRequestEvents, window);

const expectedContainerIds = [...RECTANGULAR_STORAGE_INVENTORY_IDS].sort((a, b) => a - b);
const stateCandidates = events
  .filter(event => event.command === 44 && event.direction === "server-to-client")
  .map(event => {
    const response = asCharacterInfoResponse(event.value);
    const storage = response.characterDataBase?.characterStorageInfos ?? [];
    const containerIds = storage.map(value => value.inventoryId).sort((a, b) => a - b);
    const items = storage.flatMap(value => value.characterStorageItemList);
    const successful = response.result === 1 && Boolean(response.characterDataBase);
    const complete =
      successful &&
      JSON.stringify(containerIds) === JSON.stringify(expectedContainerIds) &&
      new Set(containerIds).size === containerIds.length &&
      storage.every(container =>
        container.characterStorageItemList.every(item => item.inventoryId === container.inventoryId)
      ) &&
      items.every(item => String(item.itemUniqueId).length > 0) &&
      new Set(items.map(item => String(item.itemUniqueId))).size === items.length;
    return {
      atMilliseconds: event.atMilliseconds,
      successful,
      complete,
      value: { response, items, containerIds } satisfies CompleteStateValue
    };
  });

const aliases = new SessionItemAliasRegistry();
let classification: MoveCorrelation;
let preState: ReturnType<typeof selectLatestCompletePreState<CompleteStateValue>>;
let postState: ReturnType<typeof selectLatestCompletePostState<CompleteStateValue>>;
let spatialValidation:
  | {
      preReady: boolean;
      postReady: boolean;
      preBlockedContainers: number;
      postBlockedContainers: number;
      sameContainerSet: boolean;
    }
  | undefined;
let requestSummary:
  | {
      alias: string;
      sourceInventoryId: number;
      sourceSlotId: number;
      destinationInventoryId: number;
      destinationSlotId: number;
      atMilliseconds: number;
    }
  | undefined;

if (requestSelection.status !== "selected") {
  classification = {
    status: "ambiguous",
    reason: "request-count-mismatch",
    detail: `Expected exactly one move request inside the action window; observed ${requestSelection.observedCount}.`
  };
} else {
  const request = requestSelection.event.value;
  const requestAtMilliseconds = requestSelection.event.atMilliseconds;
  preState = selectLatestCompletePreState(stateCandidates, window, requestAtMilliseconds);
  postState = selectLatestCompletePostState(stateCandidates, window);
  const rawUniqueId = String(request.srcInfo?.uniqueId ?? "");
  const targetAlias = rawUniqueId ? aliases.aliasFor(rawUniqueId) : "item-unknown";
  const source = {
    inventoryId: Number(request.srcInfo?.inventoryId),
    slotId: Number(request.srcInfo?.slotId)
  };
  const destination = {
    inventoryId: Number(request.dstInventoryId),
    slotId: Number(request.dstSlotId)
  };
  requestSummary = {
    alias: targetAlias,
    sourceInventoryId: source.inventoryId,
    sourceSlotId: source.slotId,
    destinationInventoryId: destination.inventoryId,
    destinationSlotId: destination.slotId,
    atMilliseconds: requestAtMilliseconds
  };

  const beforeTarget = preState?.value.items.find(
    item => String(item.itemUniqueId) === rawUniqueId
  );
  const afterTarget = postState?.value.items.find(
    item => String(item.itemUniqueId) === rawUniqueId
  );
  const toMoveItemState = (item: SemanticItem | undefined): MoveItemState[] =>
    item
      ? [{
          alias: targetAlias,
          inventoryId: item.inventoryId,
          slotId: item.slotId,
          quantity: item.itemCount,
          gameDesignItemId: item.itemId
        }]
      : [];

  const acknowledgementCount = events.filter(
    event =>
      event.command === 508 &&
      event.direction === "server-to-client" &&
      event.atMilliseconds > requestAtMilliseconds &&
      event.atMilliseconds < window.stopAtMilliseconds
  ).length;

  classification = correlateMove({
    intent: {
      alias: targetAlias,
      source,
      destination,
      ...(beforeTarget ? {
        expectedQuantity: beforeTarget.itemCount,
        expectedGameDesignItemId: beforeTarget.itemId
      } : {})
    },
    matchingRequestCount: 1,
    acknowledgementCount,
    requestAtMilliseconds,
    beforeVersion: 1,
    beforeObservedAtMilliseconds:
      preState?.atMilliseconds ?? window.actionStartAtMilliseconds,
    ...(postState ? {
      afterVersion: 2,
      afterObservedAtMilliseconds: postState.atMilliseconds,
      afterItems: toMoveItemState(afterTarget)
    } : {}),
    beforeItems: toMoveItemState(beforeTarget)
  });

  if (preState && postState) {
    const localization = localizationCatalogSchema.parse(localizationJson);
    const gameplay = gameplayCatalogSchema.parse(gameplayJson);
    const reducer = new GameStateReducer(localization, "move-002");
    const reducedBefore = await reducer.replaceBaseline([{
      relativeTimestampMs: preState.atMilliseconds,
      response: preState.value.response
    }]);
    const reducedAfter = await reducer.replaceBaseline([{
      relativeTimestampMs: postState.atMilliseconds,
      response: postState.value.response
    }]);
    const projectedBefore = projectSpatialState(reducedBefore, gameplay);
    const projectedAfter = projectSpatialState(reducedAfter, gameplay);
    spatialValidation = {
      preReady: projectedBefore.ready,
      postReady: projectedAfter.ready,
      preBlockedContainers: projectedBefore.containers.filter(value => value.status === "blocked").length,
      postBlockedContainers: projectedAfter.containers.filter(value => value.status === "blocked").length,
      sameContainerSet:
        JSON.stringify(preState.value.containerIds) === JSON.stringify(postState.value.containerIds)
    };
    if (
      classification.status === "confirmed" &&
      (!spatialValidation.preReady ||
        !spatialValidation.postReady ||
        !spatialValidation.sameContainerSet)
    ) {
      classification = {
        status: "ambiguous",
        reason: "identity-transition-mismatch",
        detail: "The identity transition matched, but complete spatial validation did not pass for both states."
      };
    }
  }
}

const review = {
  reviewVersion: 1,
  sampleId: "MOVE-002",
  sanitized: true,
  containsRawPacketData: false,
  build: {
    versionMatchesPinned: manifest.gameVersion === SCHEMA_PROVENANCE.gameVersion,
    shaMatchesPinned:
      manifest.gameSha256.toLowerCase() === SCHEMA_PROVENANCE.gameSha256
  },
  capture: {
    durationMilliseconds: manifest.elapsedMilliseconds,
    packets,
    tcpPayloadSegments: payloadSegments,
    clientToServerSegments,
    serverToClientSegments,
    validFrames,
    discardedBytes
  },
  markers: window,
  evidence: {
    moveRequestsInsideActionWindow: requestSelection.observedCount,
    completePreStateObserved: Boolean(preState),
    completePostStateObserved: Boolean(postState),
    request: requestSummary,
    spatialValidation
  },
  commands: Object.fromEntries(
    [...commandCounts]
      .sort(([left], [right]) => left - right)
      .map(([id, count]) => [
        PRIORITIZED_COMMANDS[id as keyof typeof PRIORITIZED_COMMANDS] ?? `command-${id}`,
        count
      ])
  ),
  classification,
  intentionallyOmitted: [
    "rawPacketPayloads",
    "networkAddresses",
    "rawItemUniqueIds",
    "accountAndCharacterIdentifiers",
    "completeStashLayouts",
    "privateInventoryComposition"
  ]
};

await writeFile(
  resolve(directory, "move002-review.sanitized-private.json"),
  `${JSON.stringify(review, null, 2)}\n`,
  "utf8"
);
console.log(
  `Wrote private MOVE-002 review; status=${classification.status}; reason=${classification.reason}.`
);
