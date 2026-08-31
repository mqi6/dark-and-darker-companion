import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import gameplayJson from "../fixtures/darkerdb/gameplay/catalog.json";
import localizationJson from "../fixtures/darkerdb/localization/catalog.json";
import { GameStateReducer } from "../src/domain/gameStateReducer";
import { gameplayCatalogSchema } from "../src/domain/gameplayCatalog";
import { projectSpatialState, type SpatialProjection } from "../src/domain/inventoryGeometry";
import { localizationCatalogSchema } from "../src/domain/localizedCatalog";
import { planCrossTabSmokeTransfer, type CrossTabSortPlan } from "../src/domain/stashRouting";
import {
  confirmedStashTabEntries,
  createStashTabMapping,
  stashTabMappingSchema,
  type StashTabMapping
} from "../src/domain/stashTabMapping";
import { prepareCrossTabScreenBatch } from "../src/domain/crossTabScreenPlan";
import { asCharacterInfoResponse } from "../src/protocol/semanticDecoder";
import { CrossTabOperatorController } from "../src/tasks/crossTabOperatorController";
import { CrossTabSortExecutionRunner } from "../src/tasks/crossTabSortExecution";
import { FixedCoordinateCrossTabRuntime, rebindExpectedGameWindow } from "../src/tasks/fixedCoordinateCrossTabRuntime";
import { prepareMove003Refresh } from "../src/tasks/move003RefreshWorkflow";
import { GameInteractionLease } from "../src/tasks/taskMachine";
import { WindowsNavigationSequenceRunner, type NavigationWindowState } from "../src/tasks/windowsNavigationRuntime";
import { readPrivateCapture } from "./privateCaptureReader";
import { PowerShellNavigationAdapter, validatePrivateNavProfile, type PrivateNavProfile } from "./windowsNavigationAdapter";
import { WindowsFixedCoordinateCrossTabAdapter } from "./windowsFixedCoordinateCrossTabAdapter";

const execFileAsync = promisify(execFile);
const gameplay = gameplayCatalogSchema.parse(gameplayJson);
const localization = localizationCatalogSchema.parse(localizationJson);

export interface PrivateCrossTabPrepared {
  controller: CrossTabOperatorController;
  summary: {
    itemAlias: string;
    sourceTabIndex: number;
    sourceCell: { x: number; y: number };
    footprint: { width: number; height: number };
    quantity: number;
    bagItemCount: number;
    bagFreeCells: number;
    bagCell: { x: number; y: number };
    targetTabIndex: number;
    targetCell: { x: number; y: number };
    stashToBag: { source: { x: number; y: number }; destination: { x: number; y: number } };
    bagToStash: { source: { x: number; y: number }; destination: { x: number; y: number } };
  };
  focusGame(): Promise<{ processName: string; isForeground: boolean }>;
}

export async function preparePrivateCrossTabOperator(parameters: {
  runtimeDirectory: string;
  navigationDirectory: string;
  captureRoot: string;
  resumeItemFromBag?: boolean;
  log(event: { event: string; detail: string }): void;
}): Promise<PrivateCrossTabPrepared> {
  const profile = JSON.parse(await readFile(resolve(parameters.navigationDirectory, "profile.private.json"), "utf8")) as PrivateNavProfile;
  validatePrivateNavProfile(profile);
  const refreshPlan = JSON.parse(await readFile(resolve(parameters.navigationDirectory, "plan.private.json"), "utf8")) as { window: NavigationWindowState };
  const mapping = await loadAndUpgradeMapping(parameters.runtimeDirectory, profile);
  const sourceSession = await newestCompleteCapture(parameters.captureRoot);
  const reducer = new GameStateReducer(localization, "cross-tab-operator");
  const projection = await projectionFromCapture(sourceSession, reducer);
  const plan = planCrossTabSmokeTransfer({ projection, mapping });
  if (plan.status !== "ready" || plan.transfers.length !== 1) {
    throw new Error(plan.status === "blocked" ? plan.detail : "Exactly one smoke transfer is required.");
  }

  const helper = resolve("tools/windows-navigation.ps1");
  const dragHelper = resolve("tools/windows-supervised-move.ps1");
  const navigation = new PowerShellNavigationAdapter(
    helper, profile, refreshPlan.window, resolve(parameters.navigationDirectory, "transition-screen.private.png")
  );
  const drag = {
    async dispatchLeftDrag(value: {
      expectedWindowHandle: string;
      expectedBounds: NavigationWindowState["clientBounds"];
      source: { x: number; y: number };
      destination: { x: number; y: number };
      durationMilliseconds: number;
    }) {
      const b = value.expectedBounds;
      try {
        const result = await execFileAsync("powershell.exe", [
          "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", dragHelper,
          "-Drag", "-ExpectedWindowHandle", value.expectedWindowHandle,
          "-ExpectedLeft", String(Math.round(b.left)), "-ExpectedTop", String(Math.round(b.top)),
          "-ExpectedWidth", String(Math.round(b.width)), "-ExpectedHeight", String(Math.round(b.height)),
          "-SourceX", String(Math.round(value.source.x)), "-SourceY", String(Math.round(value.source.y)),
          "-DestinationX", String(Math.round(value.destination.x)), "-DestinationY", String(Math.round(value.destination.y)),
          "-DurationMilliseconds", String(value.durationMilliseconds)
        ], { encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024 });
        return JSON.parse(result.stdout);
      } catch (error) {
        const stdout = typeof error === "object" && error && "stdout" in error ? String(error.stdout) : "";
        try { return JSON.parse(stdout); } catch {
          return { status: "failed", diagnosticCode: "ordinary-foreground-input-failed", inputMayHaveBeenDispatched: false };
        }
      }
    }
  };
  const lease = new GameInteractionLease();
  const adapter = new WindowsFixedCoordinateCrossTabAdapter(navigation, drag, refreshPlan.window);
  const refresher = new AutomaticProjectionRefresher({
    captureRoot: parameters.captureRoot,
    sourceSession,
    navigationDirectory: parameters.navigationDirectory,
    profile,
    expectedWindow: refreshPlan.window,
    navigation,
    lease,
    reducer,
    log: parameters.log
  });
  const runtime = new FixedCoordinateCrossTabRuntime(adapter, refresher, refreshPlan.window, profile.visibleStashTabs);
  const screens = prepareCrossTabScreenBatch(plan.transfers, runtime.layout);
  const runner = new CrossTabSortExecutionRunner(lease, runtime, parameters.log);
  const transfer = plan.transfers[0]!;
  const screen = screens[0]!;
  const toBag = transfer.actions.find(action => action.kind === "drag-stash-to-bag");
  const toStash = transfer.actions.find(action => action.kind === "drag-bag-to-stash");
  if (!toBag || toBag.kind !== "drag-stash-to-bag" || !toStash || toStash.kind !== "drag-bag-to-stash") {
    throw new Error("Smoke transfer drag actions are incomplete.");
  }
  return {
    controller: new CrossTabOperatorController(plan, screens, runner, parameters.resumeItemFromBag),
    summary: {
      itemAlias: transfer.itemAlias,
      sourceTabIndex: transfer.sourceTabIndex,
      sourceCell: toBag.source.point,
      footprint: { width: transfer.width, height: transfer.height },
      quantity: transfer.quantity ?? 1,
      bagItemCount: plan.bag.itemCount,
      bagFreeCells: plan.bag.freeCellCount,
      bagCell: toBag.destination.point,
      targetTabIndex: transfer.targetTabIndex,
      targetCell: toStash.destination.point,
      stashToBag: screen.stashToBag,
      bagToStash: screen.bagToStash
    },
    async focusGame() {
      const state = await navigation.inspectWindow();
      rebindExpectedGameWindow(refreshPlan.window, state);
      return { processName: state.processName, isForeground: true };
    }
  };
}

class AutomaticProjectionRefresher {
  constructor(private readonly value: {
    captureRoot: string;
    sourceSession: string;
    navigationDirectory: string;
    profile: PrivateNavProfile;
    expectedWindow: NavigationWindowState;
    navigation: PowerShellNavigationAdapter;
    lease: GameInteractionLease;
    reducer: GameStateReducer;
    log(event: { event: string; detail: string }): void;
  }) {}

  async refreshCompleteProjection(signal?: AbortSignal): Promise<SpatialProjection> {
    const manifest = JSON.parse((await readFile(resolve(this.value.sourceSession, "manifest.private.json"), "utf8")).replace(/^\uFEFF/, "")) as {
      interface: string; gameVersion: string; gameSha256: string; tsharkPath: string;
    };
    const recorder = await startRecorder(manifest, signal);
    try {
      const classified = await this.value.navigation.classifyScreen();
      if (classified.status !== "classified") throw new Error(`refresh-screen-${classified.status}`);
      const plan = prepareMove003Refresh({
        window: this.value.expectedWindow,
        visibleStashTabs: this.value.profile.visibleStashTabs,
        startingScreen: classified.observation.screen
      });
      recorder.child.stdin.write("ACTION_START\n");
      const result = await new WindowsNavigationSequenceRunner(
        this.value.lease, this.value.navigation, this.value.log
      ).execute({
        plan,
        approval: { kind: "human-confirmation", planFingerprint: plan.planFingerprint },
        leaseTaskId: "SORT-SMOKE-001",
        ...(signal ? { signal } : {})
      });
      if (result.status !== "completed") throw new Error(`automatic-refresh-${result.status}`);
      recorder.child.stdin.write("ACTION_END\nSTOP\n");
      await recorder.done;
      return projectionFromCapture(recorder.directory, this.value.reducer);
    } finally {
      if (recorder.child.exitCode === null) recorder.child.stdin.write("STOP\n");
      await recorder.done.catch(() => undefined);
    }
  }
}

async function loadAndUpgradeMapping(directory: string, profile: PrivateNavProfile): Promise<StashTabMapping> {
  const path = resolve(directory, "mapping.private.json");
  const existing = stashTabMappingSchema.parse(JSON.parse(await readFile(path, "utf8")));
  if (existing.entries.length === profile.visibleStashTabs) return existing;
  const entries = confirmedStashTabEntries({ visibleTabCount: profile.visibleStashTabs });
  const upgraded = createStashTabMapping({
    runtimeProfileKey: existing.runtimeProfileKey,
    gameBuildFingerprint: existing.gameBuildFingerprint,
    availableInventoryIds: [...existing.availableInventoryIds],
    entries
  });
  await writeFile(path, `${JSON.stringify(upgraded, null, 2)}\n`, "utf8");
  return upgraded;
}

async function projectionFromCapture(directory: string, reducer: GameStateReducer): Promise<SpatialProjection> {
  const capture = await readPrivateCapture(directory);
  const candidates = capture.events.filter(event => event.command === 44).map(event => ({
    relativeTimestampMs: event.absoluteAtMilliseconds,
    response: asCharacterInfoResponse(event.value)
  }));
  const state = await reducer.replaceBaseline(candidates);
  return projectSpatialState(state, gameplay);
}

async function newestCompleteCapture(root: string): Promise<string> {
  const candidates: Array<{ path: string; modified: number }> = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = resolve(root, entry.name);
    try {
      await Promise.all([access(resolve(path, "capture.pcapng")), access(resolve(path, "semantic-snapshot.sanitized-private.json"))]);
      candidates.push({ path, modified: (await stat(resolve(path, "capture.pcapng"))).mtimeMs });
    } catch { /* incomplete private capture */ }
  }
  candidates.sort((a, b) => b.modified - a.modified);
  if (!candidates[0]) throw new Error("No complete private command-44 capture is available.");
  return candidates[0].path;
}

async function startRecorder(manifest: { interface: string; gameVersion: string; gameSha256: string; tsharkPath: string }, signal?: AbortSignal) {
  const child = spawn("powershell.exe", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve("tools/record-game-traffic.ps1"),
    "-Interface", manifest.interface, "-GameVersion", manifest.gameVersion,
    "-GameSha256", manifest.gameSha256, "-SampleId", "SORT-001", "-TsharkPath", manifest.tsharkPath
  ], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }) as ChildProcessWithoutNullStreams;
  signal?.addEventListener("abort", () => child.stdin.write("STOP\n"), { once: true });
  let output = "";
  const directory = await new Promise<string>((resolveReady, reject) => {
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/Private session:\s*(.+)\r?\n/);
      if (match && output.includes("tshark PID:")) resolveReady(match[1]!.trim());
    };
    child.stdout.on("data", onData);
    child.once("error", reject);
    child.once("exit", code => reject(new Error(`Private recorder exited before ready (${code}).`)));
  });
  const done = new Promise<void>((resolveDone, reject) => {
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolveDone() : reject(new Error(stderr || `Private recorder exit ${code}`)));
  });
  return { child, directory, done };
}
