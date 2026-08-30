import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { HumanMoveApproval, PreparedSupervisedMove } from "../src/domain/supervisedMove";
import { SupervisedMoveRunner } from "../src/tasks/supervisedMoveRunner";
import { GameInteractionLease } from "../src/tasks/taskMachine";
import {
  PowerShellWindowsUiBridge,
  PrivateJsonMoveStateProvider,
  WindowsSupervisedMoveRuntime,
  type ExpectedWindowsEnvironment
} from "./windowsSupervisedMoveRuntime";

const args = parseArgs(process.argv.slice(2));
const directory = resolve(required(args, "private-directory"));
const execute = args.execute === "true";
const plan = JSON.parse(await readFile(resolve(directory, "plan.private.json"), "utf8")) as PreparedSupervisedMove;
const profile = JSON.parse(await readFile(resolve(directory, "calibration.private.json"), "utf8")) as {
  calibration: { profileId: string };
  windowIdentity: { windowHandle: string; processName: string };
  display: ExpectedWindowsEnvironment["display"];
};
if (profile.calibration.profileId !== plan.calibrationProfileId) {
  throw new Error("The private calibration profile does not match the prepared plan.");
}

const expected: ExpectedWindowsEnvironment = {
  windowHandle: profile.windowIdentity.windowHandle,
  processName: profile.windowIdentity.processName,
  display: profile.display,
  windowBounds: plan.windowBounds
};
const ui = new PowerShellWindowsUiBridge(resolve("tools/windows-supervised-move.ps1"));
const state = new PrivateJsonMoveStateProvider(
  resolve(directory, "live-environment.private.json"),
  resolve(directory, "verification.private.json")
);
const runtime = new WindowsSupervisedMoveRuntime(
  ui,
  state,
  expected,
  !execute,
  remaining => {
    if (execute && remaining % 1000 < 100) console.log(`Dispatch countdown: ${Math.ceil(remaining / 1000)}s (Ctrl+C cancels)`);
  }
);
const runner = new SupervisedMoveRunner(new GameInteractionLease(), runtime);

if (!execute) {
  const result = runner.preview(plan);
  console.log(JSON.stringify({
    status: result.status,
    mouseButtonEvents: 0,
    planFingerprint: plan.planFingerprint,
    itemAlias: plan.itemAlias,
    tabIndex: plan.tabIndex,
    inventoryId: plan.inventoryId,
    source: plan.source,
    destination: plan.destination,
    snapshotHashShort: plan.sourceSnapshotHash.slice(0, 12),
    snapshotVersion: plan.sourceSnapshotVersion,
    calibrationProfileId: plan.calibrationProfileId,
    gameBuildFingerprint: plan.gameBuildFingerprint,
    statement: "Dry-run only. Exactly one left drag would occur after exact approval; there is no retry."
  }, null, 2));
  process.exit(0);
}

const expectedConfirmation = `CONFIRM MOVE-003 ${plan.planFingerprint}`;
if (args.confirmation !== expectedConfirmation) {
  throw new Error("Exact action-specific confirmation is missing or does not match the complete planFingerprint.");
}
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
const approval: HumanMoveApproval = {
  kind: "human-confirmation",
  planFingerprint: plan.planFingerprint,
  confirmedAtMilliseconds: Date.now()
};
const result = await runner.execute({ plan, approval, signal: controller.signal });
console.log(JSON.stringify(result));
if (result.status !== "confirmed") process.exitCode = 2;

function parseArgs(values: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key?.startsWith("--")) throw new Error("Arguments must use --name value.");
    if (key === "--execute") { result.execute = "true"; continue; }
    const value = values[++index];
    if (value === undefined) throw new Error(`${key} requires a value.`);
    result[key.slice(2)] = value;
  }
  return result;
}
function required(values: Record<string, string>, key: string): string {
  const value = values[key]?.trim();
  if (!value) throw new Error(`--${key} is required.`);
  return value;
}
