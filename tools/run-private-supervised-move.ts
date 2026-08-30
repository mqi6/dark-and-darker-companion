import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { issueLocalMoveApprovalToken, type PreparedSupervisedMove } from "../src/domain/supervisedMove";
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
    itemAlias: plan.itemAlias,
    tabIndex: plan.tabIndex,
    inventoryId: plan.inventoryId,
    source: plan.source,
    destination: plan.destination,
    quantity: 1,
    footprint: "1x1",
    dragCount: 1,
    statement: "Dry-run only. Exactly one left drag would occur after local confirmation; there is no retry."
  }, null, 2));
  process.exit(0);
}

const terminal = createInterface({ input: stdin, output: stdout });
console.log(`\nMOVE-003 preview\nItem: ${plan.itemAlias}\nQuantity / footprint: 1 / 1x1\nSource: tab ${plan.tabIndex}, cell (${plan.source.grid.x},${plan.source.grid.y})\nDestination: tab ${plan.tabIndex}, cell (${plan.destination.grid.x},${plan.destination.grid.y})\nDrag count: 1\nNo retry will occur.`);
const choice = (await terminal.question("Confirm Move / Cancel [C/X]: ")).trim().toLowerCase();
terminal.close();
if (choice !== "c" && choice !== "confirm move") {
  console.log(JSON.stringify({ status: "cancelled", phase: "pre-dispatch" }));
  process.exit(0);
}
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
const approval = issueLocalMoveApprovalToken(plan, Date.now());
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
