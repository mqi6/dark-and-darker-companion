import { execFile } from "node:child_process";
import { appendFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { GameInteractionLease } from "../src/tasks/taskMachine";
import { prepareMove003Refresh } from "../src/tasks/move003RefreshWorkflow";
import {
  prepareNav001Sequence,
  WindowsNavigationSequenceRunner,
  type PreparedNavigationSequence
} from "../src/tasks/windowsNavigationRuntime";
import { NAVIGATION_FEATURE_VERSION } from "../src/tasks/navigationScreenClassifier";
import {
  classifyFeature,
  PowerShellNavigationAdapter,
  validatePrivateNavProfile,
  type PrivateNavProfile,
  type PrivateScreenTemplate
} from "./windowsNavigationAdapter";

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
const mode = required("mode");
const directory = resolve(args.directory ?? "fixtures-private/runtime/nav-001");
await mkdir(directory, { recursive: true });
const helper = resolve("tools/windows-navigation.ps1");
const profilePath = resolve(directory, "profile.private.json");

if (mode === "migrate-references") {
  const previousText = await readFile(profilePath, "utf8");
  const previous = JSON.parse(previousText) as {
    gameBuildFingerprint: string;
    visibleStashTabs: number;
    selectedCharacterSlotIndex: number | null;
    templates?: Array<Partial<PrivateScreenTemplate> & { screen?: PrivateScreenTemplate["screen"] }>;
  };
  const files = (await readdir(directory)).filter(file =>
    /^reference-(character-selection|lobby|stash|merchant)-.+\.private\.png$/.test(file)
  );
  if (files.length === 0) throw new Error("No existing private reference screenshots were found.");
  const templates: PrivateScreenTemplate[] = [];
  for (const file of files.sort()) {
    const match = file.match(/^reference-(character-selection|lobby|stash|merchant)-/);
    if (!match) continue;
    const screen = match[1] as PrivateScreenTemplate["screen"];
    const state = await run(["-AnalyzeImage", "-InputPath", resolve(directory, file)]);
    if (state.featureVersion !== NAVIGATION_FEATURE_VERSION || !state.feature) {
      throw new Error(`Feature migration failed for ${file}.`);
    }
    const metadata = previous.templates?.find(template => template.screen === screen);
    templates.push({
      screen,
      featureVersion: NAVIGATION_FEATURE_VERSION,
      feature: state.feature,
      ...(metadata?.selectedCharacterSlotIndex === undefined
        ? {}
        : { selectedCharacterSlotIndex: metadata.selectedCharacterSlotIndex }),
      ...(metadata?.selectedStashTabIndex === undefined
        ? {}
        : { selectedStashTabIndex: metadata.selectedStashTabIndex })
    });
  }
  const profile: PrivateNavProfile = {
    schemaVersion: 2,
    gameBuildFingerprint: previous.gameBuildFingerprint,
    visibleStashTabs: previous.visibleStashTabs,
    selectedCharacterSlotIndex: previous.selectedCharacterSlotIndex,
    templates
  };
  validatePrivateNavProfile(profile);
  await writeFile(resolve(directory, "profile-v1-backup.private.json"), previousText);
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
  console.log(`Migrated ${templates.length} private screenshot templates to feature version 2. No input generated.`);
} else if (mode === "capture-reference") {
  const screen = required("screen") as PrivateScreenTemplate["screen"];
  if (!["character-selection", "lobby", "stash", "merchant"].includes(screen)) {
    throw new Error("Unsupported screen template.");
  }
  await delay();
  const shot = resolve(directory, `reference-${screen}-${Date.now()}.private.png`);
  const state = await run(["-Capture", "-OutputPath", shot]);
  if (state.featureVersion !== NAVIGATION_FEATURE_VERSION || !state.feature) {
    throw new Error("Capture did not return a feature-version-2 sample.");
  }
  let profile: PrivateNavProfile;
  try {
    profile = JSON.parse(await readFile(profilePath, "utf8")) as PrivateNavProfile;
    validatePrivateNavProfile(profile, { requireRouteTemplates: false });
  } catch {
    profile = {
      schemaVersion: 2,
      gameBuildFingerprint: required("build-fingerprint"),
      visibleStashTabs: Number(required("visible-tabs")),
      selectedCharacterSlotIndex: null,
      templates: []
    };
  }
  const template: PrivateScreenTemplate = {
    screen,
    featureVersion: NAVIGATION_FEATURE_VERSION,
    feature: state.feature,
    ...(screen === "stash" && args["stash-tab"] !== undefined
      ? { selectedStashTabIndex: Number(args["stash-tab"]) }
      : {})
  };
  const sameScreen = profile.templates.filter(value => value.screen === screen).slice(-3);
  profile.templates = [
    ...profile.templates.filter(value => value.screen !== screen),
    ...sameScreen,
    template
  ];
  validatePrivateNavProfile(profile, { requireRouteTemplates: false });
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
  console.log(`Saved private ${screen} reference. No input generated.`);
} else if (mode === "prepare" || mode === "prepare-move003-refresh") {
  const profile = JSON.parse(await readFile(profilePath, "utf8")) as PrivateNavProfile;
  validatePrivateNavProfile(profile);
  await delay();
  const shot = resolve(directory, "current-screen.private.png");
  const state = await run(["-Capture", "-OutputPath", shot]);
  if (state.featureVersion !== NAVIGATION_FEATURE_VERSION || !state.feature) {
    throw new Error("Current capture did not return a feature-version-2 sample.");
  }
  const classification = classifyFeature(state.feature, profile.templates);
  if (classification.status !== "classified") {
    throw new Error(`Starting screen is ${classification.status}.`);
  }
  const window = {
      windowHandle: state.windowHandle,
      processName: state.processName,
      clientBounds: state.clientBounds,
      display: state.display,
      primaryDisplay: state.primaryDisplay,
      gameBuildFingerprint: profile.gameBuildFingerprint
    };
  const plan = mode === "prepare-move003-refresh" ? prepareMove003Refresh({
    window,
    visibleStashTabs: profile.visibleStashTabs,
    startingScreen: classification.observation.screen
  }) : prepareNav001Sequence({
    window,
    visibleStashTabs: profile.visibleStashTabs,
    startingScreen: classification.observation.screen
  });
  await writeFile(resolve(directory, "plan.private.json"), `${JSON.stringify(plan, null, 2)}\n`);
  await writeFile(resolve(directory, "preview.private.html"), preview(plan));
  console.log(JSON.stringify({
    detectedResolution: `${state.clientBounds.width}x${state.clientBounds.height}`,
    clientBounds: state.clientBounds,
    scaleMode: plan.layout.transform.mode,
    startingPage: plan.startingScreen,
    visibleStashTabs: plan.visibleStashTabs,
    selectedCharacterSlot: "current protocol-selected character; no card click",
    primaryDisplayValidation: "passed",
    inputMethod: plan.inputMethod,
    featureVersion: NAVIGATION_FEATURE_VERSION,
    previewPath: resolve(directory, "preview.private.html"),
    planFingerprint: plan.planFingerprint,
    pageSequence: [plan.startingScreen, ...plan.steps.map(step => step.expectedScreen)],
    controls: plan.steps.map(step => step.control),
    approvalScope: "approvalScope" in plan ? plan.approvalScope : "navigation-only",
    mouseEvents: 0
  }, null, 2));
} else if (mode === "execute") {
  const profile = JSON.parse(await readFile(profilePath, "utf8")) as PrivateNavProfile;
  validatePrivateNavProfile(profile);
  const plan = JSON.parse(
    await readFile(resolve(directory, "plan.private.json"), "utf8")
  ) as PreparedNavigationSequence;
  const fingerprint = required("plan-fingerprint");
  if (fingerprint !== plan.planFingerprint) {
    throw new Error("Plan fingerprint does not match the prepared private plan.");
  }
  await delay();
  const logPath = resolve(directory, "execution.private.jsonl");
  const adapter = new PowerShellNavigationAdapter(
    helper,
    profile,
    plan.window,
    resolve(directory, "transition-screen.private.png")
  );
  const started = performance.now();
  const log = (event: { event: string; detail: string }) => appendFileSync(
    logPath,
    `${JSON.stringify({
      utc: new Date().toISOString(),
      monotonicMilliseconds: Math.round(performance.now() - started),
      ...event
    })}\n`
  );
  log({ event: "sequence-start", detail: plan.planFingerprint });
  const runner = new WindowsNavigationSequenceRunner(new GameInteractionLease(), adapter, log);
  const result = await runner.execute({
    plan,
    approval: { kind: "human-confirmation", planFingerprint: fingerprint }
  });
  log({ event: "sequence-result", detail: JSON.stringify(result) });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "completed") process.exitCode = 2;
} else {
  throw new Error("--mode must be migrate-references, capture-reference, prepare, prepare-move003-refresh, or execute.");
}

async function delay() {
  const seconds = Number(args["delay-seconds"] ?? 0);
  if (seconds) {
    console.log(`Read-only capture in ${seconds}s; foreground the stationary game window.`);
    await new Promise(resolveDelay => setTimeout(resolveDelay, seconds * 1000));
  }
}

async function run(values: string[]) {
  const result = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", helper, ...values],
    { encoding: "utf8", windowsHide: true, maxBuffer: 2 * 1024 * 1024 }
  );
  return JSON.parse(result.stdout) as {
    windowHandle: string;
    processName: string;
    clientBounds: { left: number; top: number; width: number; height: number };
    display: { left: number; top: number; width: number; height: number };
    primaryDisplay: { left: number; top: number; width: number; height: number };
    featureVersion?: number;
    feature?: number[];
  };
}

function preview(plan: ReturnType<typeof prepareNav001Sequence>) {
  const bounds = plan.window.clientBounds;
  const layout = plan.layout;
  const mark = (label: string, point: { x: number; y: number }, color = "#fc0") =>
    `<circle cx="${point.x - bounds.left}" cy="${point.y - bounds.top}" r="8" fill="${color}"/>` +
    `<text x="${point.x - bounds.left + 10}" y="${point.y - bounds.top - 8}">${label} (${point.x},${point.y})</text>`;
  const points = [
    mark("Start Game", layout.controls.startGame),
    mark("Stash", layout.controls.stash),
    mark("Merchant", layout.controls.merchant),
    mark("Return", layout.controls.returnToCharacterSelection),
    mark("Enter Lobby (current selected character)", layout.controls.enterLobby, "#0ef"),
    ...layout.stash.tabCenters.map((point, index) => mark(`T${index}`, point, "#f6c"))
  ].join("");
  const grid = layout.stash;
  return `<!doctype html><meta charset="utf-8"><style>body{background:#111;color:#eee}svg{background:#222}text{fill:#fff;font:12px sans-serif}.grid{fill:none;stroke:#0f8;stroke-width:3}</style><h1>NAV PRIVATE non-clicking preview</h1><svg width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">${points}<rect class="grid" x="${grid.gridTopLeft.x - bounds.left}" y="${grid.gridTopLeft.y - bounds.top}" width="${grid.gridBottomRight.x - grid.gridTopLeft.x}" height="${grid.gridBottomRight.y - grid.gridTopLeft.y}"/></svg>`;
}

function parseArgs(values: string[]) {
  const result: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    if (!values[index]?.startsWith("--") || values[index + 1] === undefined) {
      throw new Error("Use --name value pairs.");
    }
    result[values[index]!.slice(2)] = values[index + 1]!;
  }
  return result;
}

function required(key: string) {
  const value = args[key]?.trim();
  if (!value) throw new Error(`--${key} required`);
  return value;
}
