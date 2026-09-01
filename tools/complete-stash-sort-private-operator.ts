import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import gameplayJson from "../fixtures/darkerdb/gameplay/catalog.json";
import { resolveSortInputTiming, type AutomationSpeedPreset, type SortInputTiming } from "../src/domain/automationTiming";
import { canonicalItemIdForGameDesignIdInCatalog, asGameDesignItemId } from "../src/domain/gameIdBridge";
import type { ReducedGameState } from "../src/domain/gameStateReducer";
import { gameplayCatalogSchema } from "../src/domain/gameplayCatalog";
import { projectSpatialState, type SpatialProjection } from "../src/domain/inventoryGeometry";
import type { CompleteStashSortPlan } from "../src/domain/completeStashSort";
import type { StashPackingMode } from "../src/domain/stashPacking";
import { STASH_ITEM_CATEGORIES, classifyStashItem, type StashTabItemPolicy } from "../src/domain/stashRouting";
import { stashTabMappingSchema, type StashTabMapping } from "../src/domain/stashTabMapping";
import { GameInteractionLease } from "../src/tasks/taskMachine";
import { CompleteStashSortExecutionRunner } from "../src/tasks/completeStashSortExecution";
import { CompleteStashSortOperatorController } from "../src/tasks/completeStashSortOperatorController";
import { CompleteStashSortPreparationController } from "../src/tasks/completeStashSortPreparation";
import { FixedCoordinateCrossTabRuntime } from "../src/tasks/fixedCoordinateCrossTabRuntime";
import { WindowsNavigationSequenceRunner, type NavigationWindowState } from "../src/tasks/windowsNavigationRuntime";
import type { PreparedMove003Refresh } from "../src/tasks/move003RefreshWorkflow";
import { prepareMove003Refresh } from "../src/tasks/move003RefreshWorkflow";
import type { SanitizedSemanticSnapshotV1 } from "../src/protocol/semanticSnapshot";
import { createCompleteSortOperatorServer, type CompleteSortHttpController } from "./completeSortOperatorServer";
import { PowerShellNavigationAdapter, type PrivateNavProfile } from "./windowsNavigationAdapter";
import { WindowsFixedCoordinateCrossTabAdapter } from "./windowsFixedCoordinateCrossTabAdapter";
import { PowerShellWindowsUiBridge } from "./windowsSupervisedMoveRuntime";
import { PrivateSortOperatorLog, PrivateSortSessionStore } from "./privateSortSessionStore";

const execFileAsync = promisify(execFile);
const gameplayCatalog = gameplayCatalogSchema.parse(gameplayJson);
const gameplayItemIds = gameplayCatalog.items.map(item => item.id);
type Settings = { mode: StashPackingMode; speed: AutomationSpeedPreset; custom?: Partial<SortInputTiming>; tabs: Array<{ tabIndex: number; enabled: boolean; allowedCategories: string[] }> };

class AutomaticPrivateProjectionRefresher {
  private version = Date.now();
  constructor(
    private readonly profile: PrivateNavProfile,
    private readonly refreshPlan: PreparedMove003Refresh,
    private readonly capture: { interface: string; gameVersion: string; gameSha256: string; tsharkPath: string },
    private readonly adapter: PowerShellNavigationAdapter
  ) {}
  async refreshCompleteProjection(signal?: AbortSignal): Promise<SpatialProjection> {
    if (signal?.aborted) throw new Error("operator-cancelled");
    // Reuse the operator's adapter so a successful Focus request and every
    // prior capture keep the current HWND/bounds. Creating a fresh adapter
    // here forced a slow stale-handle discovery on every preview.
    const currentWindow = await this.adapter.inspectWindow();
    const capture = startRefreshCapture(this.capture, signal);
    const classified = await this.adapter.classifyScreen();
    if (classified.status !== "classified") throw new Error(`initial-screen-${classified.status}`);
    const plan = prepareMove003Refresh({
      window: currentWindow,
      visibleStashTabs: this.profile.visibleStashTabs,
      startingScreen: classified.observation.screen
    });
    await capture.ready;
    let navigation;
    try {
      navigation = await new WindowsNavigationSequenceRunner(new GameInteractionLease(), this.adapter).execute({
        plan,
        approval: { kind: "human-confirmation", planFingerprint: plan.planFingerprint },
        signal,
        initialState: { window: currentWindow, classification: classified }
      });
    } finally {
      capture.stop();
    }
    const captured = await capture.completed;
    if (navigation.status !== "completed") {
      const diagnostic = "diagnosticCode" in navigation ? navigation.diagnosticCode : navigation.status;
      throw new Error(`navigation-${diagnostic}`);
    }
    const session = captured.match(/Private session:\s*(.+)/)?.[1]?.trim();
    if (!session) throw new Error("capture-session-not-reported");
    await execFileAsync(process.execPath, ["--import", "tsx", resolve("tools/analyze-private-move003-refresh.ts"), session], { encoding: "utf8", windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    const snapshot = JSON.parse(await readFile(resolve(session, "semantic-snapshot.sanitized-private.json"), "utf8")) as SanitizedSemanticSnapshotV1;
    const items = snapshot.containers.flatMap(container => container.items.map(item => {
      const gameDesignItemId = asGameDesignItemId(item.gameDesignItemId), canonical = canonicalItemIdForGameDesignIdInCatalog(gameDesignItemId, gameplayItemIds);
      return { alias: item.alias, gameDesignItemId, ...(canonical ? { darkerDbCanonicalItemId: canonical } : {}), inventoryId: item.inventoryId, slotId: item.slotId, stackQuantity: item.stackQuantity, ammoCount: item.ammoCount, contentsCount: item.contentsCount, primaryProperties: [], secondaryProperties: [], tradable: item.tradable, permittedAreas: item.permittedAreas };
    }));
    const projected = projectSpatialState({ protocol: snapshot, items, diagnostics: [] } as ReducedGameState, gameplayCatalog);
    return { ...projected, sourceVersion: ++this.version };
  }
}

class PrivateCompleteController implements CompleteSortHttpController {
  private phase = "idle";
  private prepared?: CompleteStashSortOperatorController;
  private abort?: AbortController;
  private detail: Record<string, unknown> = {};
  private readonly activity: PrivateSortOperatorLog;
  constructor(private readonly mapping: StashTabMapping, private readonly window: NavigationWindowState, private readonly refresher: AutomaticPrivateProjectionRefresher, private readonly sessionsRoot: string, private readonly navigation: PowerShellNavigationAdapter) {
    this.activity = new PrivateSortOperatorLog(sessionsRoot);
  }
  snapshot() { return { phase: this.phase, tabs: this.mapping.entries.map(entry => ({ tabIndex: entry.tabIndex, enabled: true, allowedCategories: STASH_ITEM_CATEGORIES })), ...this.detail }; }
  async focus() {
    const state = await this.navigation.inspectWindow();
    this.detail = { ...this.detail, foreground: { status: "focused", processClass: state.processName.toLowerCase() === "dungeoncrawler" ? "verified-game-process" : "unexpected-process" } };
    return this.snapshot();
  }
  async refreshAndPreview(value: unknown) {
    if (this.phase === "refreshing" || this.phase === "running") throw new Error("operator-busy");
    const settings = parseSettings(value, this.mapping); this.phase = "refreshing"; this.abort = new AbortController();
    this.detail = {};
    await this.record("preview-start");
    try {
      const options = { mode: settings.mode, timing: resolveSortInputTiming({ preset: settings.speed, custom: settings.custom }), policies: policies(settings, this.mapping), excludedInventoryIds: [] };
      const result = await new CompleteStashSortPreparationController(this.refresher, this.mapping, this.window).refreshAndPreview(options, this.abort.signal);
      if (result.status !== "ready") {
        this.phase = "blocked";
        this.detail = {
          diagnosticCode: result.diagnosticCode,
          ...(result.initialProjection && result.plan ? previewSummary(
            result.initialProjection,
            result.plan,
            this.mapping,
            result.options?.policies ?? options.policies,
            result.quarantinedInventoryIds ?? []
          ) : {}),
          quarantinedTabCount: result.quarantinedInventoryIds?.length ?? 0,
          unsupportedItemCount: result.unsupportedItemCount ?? 0
        };
        await this.record("preview-blocked", result.diagnosticCode);
        return this.snapshot();
      }
      const directory = resolve(this.sessionsRoot, `sort-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`), store = new PrivateSortSessionStore(directory);
      await store.create({ initialProjection: result.initialProjection, policies: options.policies, packingMode: options.mode, plan: result.plan, schedule: result.schedule, screenActions: result.screenActions, timing: options.timing });
      const drag = new PowerShellWindowsUiBridge(resolve("tools/windows-supervised-move.ps1"));
      const fixed = new WindowsFixedCoordinateCrossTabAdapter(this.navigation, drag, this.window);
      const runtime = new FixedCoordinateCrossTabRuntime(fixed, this.refresher, this.window, this.mapping.entries.length, options.timing);
      const runner = new CompleteStashSortExecutionRunner(new GameInteractionLease(), runtime, undefined, entry => store.append({ at: new Date().toISOString(), ...entry }), (projection, reconciliation) => store.savePostState(projection, reconciliation));
      this.prepared = new CompleteStashSortOperatorController(result, runner);
      this.phase = "ready";
      this.detail = {
        ...previewSummary(
          result.initialProjection,
          result.plan,
          this.mapping,
          result.options.policies,
          result.quarantinedInventoryIds
        ),
        quarantinedTabCount: result.quarantinedInventoryIds.length,
        unsupportedItemCount: result.unsupportedItemCount,
        actionCount: result.schedule.actions.length,
        dragCount: result.schedule.dragCount,
        temporaryBagBufferCount: result.schedule.temporaryBufferCount
      };
      await this.record("preview-ready", undefined, result.schedule.itemMoveCount, result.schedule.actions.length, result.schedule.dragCount);
      return this.snapshot();
    } catch (error) {
      this.phase = "blocked";
      const diagnosticCode = operatorDiagnostic(error);
      const adapterError = error instanceof Error ? error.message : String(error);
      this.detail = { diagnosticCode, diagnosticMessage: diagnosticMessage(diagnosticCode) };
      await this.record("preview-blocked", diagnosticCode, undefined, undefined, undefined, adapterError);
      return this.snapshot();
    } finally { this.abort = undefined; }
  }
  async run() { if (!this.prepared || this.phase !== "ready") throw new Error("preview-required"); this.phase = "running"; await this.record("run-start"); const state = await this.prepared.run(); this.phase = state.phase; this.detail = { ...this.detail, progress: state.lastResult }; await this.record("run-result", state.lastResult && "diagnosticCode" in state.lastResult ? state.lastResult.diagnosticCode : undefined); return this.snapshot(); }
  stop() { this.abort?.abort(); this.prepared?.stop(); void this.record("stop-requested"); return this.snapshot(); }
  private record(event: Parameters<PrivateSortOperatorLog["append"]>[0]["event"], diagnosticCode?: string, moveCount?: number, actionCount?: number, dragCount?: number, adapterError?: string) { return this.activity.append({ at: new Date().toISOString(), event, phase: this.phase, ...(diagnosticCode ? { diagnosticCode } : {}), ...(adapterError ? { adapterError } : {}), ...(moveCount === undefined ? {} : { moveCount }), ...(actionCount === undefined ? {} : { actionCount }), ...(dragCount === undefined ? {} : { dragCount }) }); }
}

async function main() {
  if (process.platform !== "win32") throw new Error("Windows is required.");
  const refreshRoot = resolve("fixtures-private/runtime/move-003-refresh");
  const [profile, refreshPlan, mappingPath, manifestPath] = await Promise.all([
    readJson<PrivateNavProfile>(resolve(refreshRoot, "profile.private.json")), readJson<PreparedMove003Refresh>(resolve(refreshRoot, "plan.private.json")), newestNamed(resolve("fixtures-private"), "mapping.private.json"), newestNamed(resolve("fixtures-private"), "manifest.private.json")
  ]);
  const mapping = stashTabMappingSchema.parse(await readJson(mappingPath));
  const capture = await readJson<{ interface: string; gameVersion: string; gameSha256: string; tsharkPath: string }>(manifestPath);
  const navigation = new PowerShellNavigationAdapter(resolve("tools/windows-navigation.ps1"), profile, refreshPlan.window, resolve(refreshRoot, "operator-transition.private.png"));
  const refresher = new AutomaticPrivateProjectionRefresher(profile, refreshPlan, capture, navigation);
  const controller = new PrivateCompleteController(mapping, refreshPlan.window, refresher, resolve("fixtures-private/runtime/complete-stash-sort"), navigation);
  const port = 4318, token = randomUUID(), server = createCompleteSortOperatorServer({ controller, token });
  server.listen(port, "127.0.0.1", () => console.log(`Complete stash sort operator: http://127.0.0.1:${port}`));
}

function policies(settings: Settings, mapping: StashTabMapping): StashTabItemPolicy[] { return mapping.entries.map(entry => { const tab = settings.tabs.find(value => value.tabIndex === entry.tabIndex); return { inventoryId: entry.inventoryId, enabled: tab?.enabled ?? true, allowedCategories: (tab?.allowedCategories.filter(value => STASH_ITEM_CATEGORIES.includes(value as never)) ?? [...STASH_ITEM_CATEGORIES]) as StashTabItemPolicy["allowedCategories"] }; }); }
function parseSettings(value: unknown, mapping: StashTabMapping): Settings { const input = value as Partial<Settings>; if (input.mode !== "compact-top-left" && input.mode !== "category-rows") throw new Error("invalid-packing-mode"); if (!input.speed || !["fast", "balanced", "reliable", "custom"].includes(input.speed)) throw new Error("invalid-speed"); return { mode: input.mode, speed: input.speed, ...(input.custom ? { custom: input.custom } : {}), tabs: Array.isArray(input.tabs) ? input.tabs : mapping.entries.map(entry => ({ tabIndex: entry.tabIndex, enabled: true, allowedCategories: [...STASH_ITEM_CATEGORIES] })) }; }
async function readJson<T>(path: string): Promise<T> { return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, "")) as T; }
async function newestNamed(root: string, name: string): Promise<string> { const found: Array<{ path: string; time: number }> = []; async function visit(dir: string, depth: number): Promise<void> { if (depth > 5) return; for (const entry of await readdir(dir, { withFileTypes: true })) { const path = resolve(dir, entry.name); if (entry.isDirectory()) await visit(path, depth + 1); else if (entry.name === name) found.push({ path, time: (await stat(path)).mtimeMs }); } } await visit(root, 0); found.sort((a, b) => b.time - a.time); if (!found[0]) throw new Error(`missing-${name}`); return found[0].path; }
function startRefreshCapture(configuration: { interface: string; gameVersion: string; gameSha256: string; tsharkPath: string }, signal?: AbortSignal) {
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve("tools/record-game-traffic.ps1"), "-Interface", configuration.interface, "-GameVersion", configuration.gameVersion, "-GameSha256", configuration.gameSha256, "-SampleId", "REF-003", "-TsharkPath", configuration.tsharkPath], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "", readyDone = false;
  let resolveReady!: () => void, rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolvePromise, rejectPromise) => { resolveReady = resolvePromise; rejectReady = rejectPromise; });
  const timeout = setTimeout(() => { if (!readyDone) rejectReady(new Error("capture-readiness-timeout")); }, 5_000);
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; if (!readyDone && stdout.includes("tshark PID:")) { readyDone = true; clearTimeout(timeout); resolveReady(); } });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const completed = new Promise<string>((resolvePromise, rejectPromise) => child.once("exit", code => { clearTimeout(timeout); if (code === 0) resolvePromise(stdout); else rejectPromise(new Error(`capture-process-failed:${stderr.trim().slice(0, 500)}`)); }));
  signal?.addEventListener("abort", () => child.stdin.write("STOP\n"), { once: true });
  return { ready, completed, stop: () => { if (!child.killed && child.stdin.writable) child.stdin.write("STOP\n"); } };
}
function operatorDiagnostic(error: unknown): string { const message = error instanceof Error ? error.message : ""; if (message.includes("No visible DungeonCrawler main window")) return "game-window-unavailable"; if (message.includes("Multiple DungeonCrawler")) return "multiple-game-windows"; if (message.includes("navigation-")) return message.match(/navigation-[a-z-]+/)?.[0] ?? "navigation-failed"; if (message.includes("capture")) return "complete-capture-failed"; return "refresh-preview-failed"; }
function diagnosticMessage(code: string): string { switch (code) { case "game-window-unavailable": return "The operator cannot see a DungeonCrawler game window on its Windows desktop."; case "multiple-game-windows": return "Multiple game windows are visible; close the extra instance."; case "complete-capture-failed": return "The complete command-44 capture failed; see the private operator log."; default: return "Refresh and Preview failed; local Codex can inspect the private adapter error."; } }
function previewSummary(
  projection: SpatialProjection,
  plan: Extract<CompleteStashSortPlan, { status: "ready" }>,
  mapping: StashTabMapping,
  policies: readonly StashTabItemPolicy[],
  quarantinedInventoryIds: readonly number[]
) {
  const containers = new Map(projection.containers.map(container => [container.inventoryId, container]));
  const afterByInventory = new Map(plan.pages.map(page => [page.inventoryId, page]));
  const policyByInventory = new Map(policies.map(policy => [policy.inventoryId, policy]));
  const quarantined = new Set(quarantinedInventoryIds);
  const placement = (value: { x: number; y: number; width: number; height: number; category: string }) =>
    ({ x: value.x, y: value.y, width: value.width, height: value.height, category: value.category });
  const pageStatus = (inventoryId: number) =>
    quarantined.has(inventoryId)
      ? "quarantined-unknown-items"
      : policyByInventory.get(inventoryId)?.enabled === false
        ? "disabled"
        : "enabled";
  const before = mapping.entries.map(entry => {
    const source = containers.get(entry.inventoryId);
    return {
      tabIndex: entry.tabIndex,
      columns: 12,
      rows: 20,
      status: pageStatus(entry.inventoryId),
      itemCount: source?.placements.length ?? 0,
      unsupportedItemCount: source?.diagnostics.filter(value =>
        value.code === "item-id-unmapped" || value.code === "item-metadata-missing").length ?? 0,
      placements: source?.placements.map(value =>
        placement({ ...value, category: classifyStashItem(value.metadata) })) ?? []
    };
  });
  const after = mapping.entries.map(entry => {
    const target = afterByInventory.get(entry.inventoryId);
    const source = before.find(page => page.tabIndex === entry.tabIndex)!;
    return target
      ? {
          tabIndex: entry.tabIndex,
          columns: 12,
          rows: 20,
          status: source.status,
          itemCount: target.placements.length,
          unsupportedItemCount: source.unsupportedItemCount,
          placements: target.placements.map(placement)
        }
      : { ...source, placements: [...source.placements] };
  });
  return {
    mode: plan.mode,
    moveCount: plan.moves.length,
    crossTabCount: plan.moves.filter(move => move.route === "via-character-bag").length,
    skippedCount: plan.skippedAliases.length,
    skippedDiagnostics: plan.diagnostics,
    before,
    after
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
