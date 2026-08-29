import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import localizationJson from "../fixtures/darkerdb/localization/catalog.json";
import gameplayJson from "../fixtures/darkerdb/gameplay/catalog.json";
import {
  classifyCrossCaptureAudit,
  type CrossCaptureAuditFacts
} from "../src/domain/crossCaptureAudit";
import { GameStateReducer } from "../src/domain/gameStateReducer";
import { gameplayCatalogSchema } from "../src/domain/gameplayCatalog";
import { projectSpatialState } from "../src/domain/inventoryGeometry";
import { localizationCatalogSchema } from "../src/domain/localizedCatalog";
import { SCHEMA_PROVENANCE } from "../src/protocol/commands";
import {
  asCharacterInfoResponse,
  type SemanticCharacterInfoResponse,
  type SemanticItem
} from "../src/protocol/semanticDecoder";
import {
  markerTime,
  readPrivateCapture,
  type PrivateCapture,
  type PrivateDecodedEvent
} from "./privateCaptureReader";

interface CompleteCharacterState {
  event: PrivateDecodedEvent;
  response: SemanticCharacterInfoResponse;
  items: SemanticItem[];
  complete: boolean;
}

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const preDirectory = argument("--pre");
const actDirectory = argument("--act");
const postDirectory = argument("--post");
const outputPath = resolve(
  argument("--output") ?? "fixtures-private/cross-capture-audit.sanitized.json"
);
if (!preDirectory || !actDirectory || !postDirectory) {
  throw new Error(
    "Usage: npm run protocol:audit-cross-capture -- --pre <NET-000-dir> --act <ACT-001-dir> --post <REF-004-dir> [--output <json>]"
  );
}

const [preCapture, actCapture, postCapture] = await Promise.all([
  readPrivateCapture(preDirectory),
  readPrivateCapture(actDirectory),
  readPrivateCapture(postDirectory)
]);

const actionStart = markerTime(actCapture, "ACTION_START");
const actionEnd = markerTime(actCapture, "ACTION_END");
const moveRequests = actCapture.events.filter(
  event =>
    event.command === 507 &&
    event.direction === "client-to-server" &&
    actionStart !== undefined &&
    actionEnd !== undefined &&
    event.relativeAtMilliseconds > actionStart &&
    event.relativeAtMilliseconds < actionEnd
);
const requestEvent = moveRequests.length === 1 ? moveRequests[0] : undefined;
const request = requestEvent?.value;
const rawUniqueId = request?.srcInfo?.uniqueId === undefined
  ? undefined
  : String(request.srcInfo.uniqueId);
const requestAbsoluteAt = requestEvent?.absoluteAtMilliseconds;
const sourceInventoryId = Number(request?.srcInfo?.inventoryId);
const sourceSlotId = Number(request?.srcInfo?.slotId);
const destinationInventoryId = Number(request?.dstInventoryId);
const destinationSlotId = Number(request?.dstSlotId);

const preStates = completeCharacterStates(preCapture)
  .filter(state =>
    requestAbsoluteAt === undefined ||
    state.event.absoluteAtMilliseconds < requestAbsoluteAt
  )
  .sort((left, right) =>
    left.event.absoluteAtMilliseconds - right.event.absoluteAtMilliseconds
  );
const postStates = completeCharacterStates(postCapture)
  .filter(state =>
    requestAbsoluteAt === undefined ||
    state.event.absoluteAtMilliseconds > requestAbsoluteAt
  )
  .sort((left, right) =>
    left.event.absoluteAtMilliseconds - right.event.absoluteAtMilliseconds
  );
const preState = preStates.filter(value => value.complete).at(-1);
const postState = postStates.filter(value => value.complete).at(-1);
const preItem = rawUniqueId
  ? preState?.items.find(item => String(item.itemUniqueId) === rawUniqueId)
  : undefined;
const postItem = rawUniqueId
  ? postState?.items.find(item => String(item.itemUniqueId) === rawUniqueId)
  : undefined;

const buildCompatible = [preCapture, actCapture, postCapture].every(
  capture =>
    capture.manifest.gameVersion === SCHEMA_PROVENANCE.gameVersion &&
    capture.manifest.gameSha256.toLowerCase() === SCHEMA_PROVENANCE.gameSha256
);
const temporalOrderValid = Boolean(
  preState &&
  requestAbsoluteAt !== undefined &&
  postState &&
  preState.event.absoluteAtMilliseconds < requestAbsoluteAt &&
  requestAbsoluteAt < postState.event.absoluteAtMilliseconds
);
const [preSpatialReady, postSpatialReady] = await Promise.all([
  spatialReady(preState),
  spatialReady(postState)
]);

const facts: CrossCaptureAuditFacts = {
  matchingMoveRequestCount: moveRequests.length,
  buildCompatible,
  temporalOrderValid,
  preStateComplete: Boolean(preState),
  postStateComplete: Boolean(postState),
  preIdentityFound: Boolean(preItem),
  postIdentityFound: Boolean(postItem),
  preAtRequestedSource: Boolean(
    preItem &&
    preItem.inventoryId === sourceInventoryId &&
    preItem.slotId === sourceSlotId
  ),
  postAtRequestedDestination: Boolean(
    postItem &&
    postItem.inventoryId === destinationInventoryId &&
    postItem.slotId === destinationSlotId
  ),
  sameGameDesignItemId: Boolean(
    preItem &&
    postItem &&
    preItem.itemId === postItem.itemId
  ),
  sameQuantity: Boolean(
    preItem &&
    postItem &&
    preItem.itemCount === postItem.itemCount
  ),
  preSpatialReady,
  postSpatialReady
};
const classification = classifyCrossCaptureAudit(facts);

const review = {
  auditVersion: 1,
  sanitized: true,
  containsRawPacketData: false,
  subjectAlias: "audit-item-001",
  inputs: {
    pre: captureSummary(preCapture),
    action: captureSummary(actCapture),
    post: captureSummary(postCapture)
  },
  observableChecks: facts,
  classification,
  limitation:
    "Separate captures cannot exclude unrecorded intervening actions, so cross-capture consistency is never promoted to same-capture protocol confirmation.",
  nextStep:
    classification.status === "cross-capture-consistent"
      ? "Cloud review may decide whether this evidence is sufficient for the MVP gate."
      : "Do not infer move success from these captures; retain the MOVE-002 human checkpoint.",
  intentionallyOmitted: [
    "rawPacketPayloads",
    "rawItemUniqueIds",
    "sourceAndDestinationCoordinates",
    "gameDesignItemId",
    "accountAndCharacterIdentifiers",
    "networkAddresses",
    "completeStashLayouts",
    "privateInventoryComposition",
    "privateFilesystemPaths",
    "captureWallClockTimestamps"
  ]
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(review, null, 2)}\n`, "utf8");
console.log(
  `Wrote sanitized cross-capture audit; status=${classification.status}; reason=${classification.reason}.`
);

function completeCharacterStates(capture: PrivateCapture): CompleteCharacterState[] {
  return capture.events
    .filter(event => event.command === 44 && event.direction === "server-to-client")
    .map(event => {
      const response = asCharacterInfoResponse(event.value);
      const character = response.characterDataBase;
      const storage = character?.characterStorageInfos ?? [];
      const items = [
        ...(character?.characterItemList ?? []),
        ...storage.flatMap(value => value.characterStorageItemList)
      ];
      const inventoryIds = storage.map(value => value.inventoryId);
      const rawIds = items.map(item => String(item.itemUniqueId));
      const complete =
        response.result === 1 &&
        Boolean(character) &&
        storage.length > 0 &&
        new Set(inventoryIds).size === inventoryIds.length &&
        storage.every(container =>
          container.characterStorageItemList.every(
            item => item.inventoryId === container.inventoryId
          )
        ) &&
        rawIds.every(Boolean) &&
        new Set(rawIds).size === rawIds.length;
      return { event, response, items, complete };
    });
}

async function spatialReady(
  state: CompleteCharacterState | undefined
): Promise<boolean> {
  if (!state) return false;
  try {
    const reducer = new GameStateReducer(
      localizationCatalogSchema.parse(localizationJson),
      "cross-capture-audit"
    );
    const reduced = await reducer.replaceBaseline([{
      relativeTimestampMs: state.event.relativeAtMilliseconds,
      response: state.response
    }]);
    return projectSpatialState(
      reduced,
      gameplayCatalogSchema.parse(gameplayJson)
    ).ready;
  } catch {
    return false;
  }
}

function captureSummary(capture: PrivateCapture) {
  return {
    sampleId:
      /(?:NET|ACT|REF)-\d{3}/.exec(capture.directory)?.[0] ?? "private-capture",
    buildMatchesPinned:
      capture.manifest.gameVersion === SCHEMA_PROVENANCE.gameVersion &&
      capture.manifest.gameSha256.toLowerCase() === SCHEMA_PROVENANCE.gameSha256,
    validFrames: capture.validFrames,
    discardedBytes: capture.discardedBytes
  };
}
