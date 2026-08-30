import { createInterface } from "node:readline/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stdin, stdout } from "node:process";
import { createStashGridCalibration, cellCenterFor, type ScreenPoint } from "../src/domain/stashScreenCalibration";
import { PowerShellWindowsUiBridge } from "./windowsSupervisedMoveRuntime";

const args = parseArgs(process.argv.slice(2));
const profileId = required(args, "profile-id");
const gameBuildFingerprint = required(args, "build-fingerprint");
const helperPath = resolve("tools/windows-supervised-move.ps1");
const bridge = new PowerShellWindowsUiBridge(helperPath);
const inspectDelaySeconds = args["inspect-delay-seconds"] === undefined
  ? 0
  : Number(args["inspect-delay-seconds"]);
if (!Number.isFinite(inspectDelaySeconds) || inspectDelaySeconds < 0 || inspectDelaySeconds > 30) {
  throw new Error("--inspect-delay-seconds must be between 0 and 30.");
}
if (inspectDelaySeconds > 0) {
  console.log(`Foreground inspection begins in ${inspectDelaySeconds} seconds. Return to the stationary game window now.`);
  await new Promise(resolveDelay => setTimeout(resolveDelay, inspectDelaySeconds * 1000));
}
const window = await bridge.inspectForegroundWindow();
if (window.processName.toLowerCase() !== "dungeoncrawler") {
  throw new Error("The foreground window is not DungeonCrawler. Bring the game to the foreground and retry.");
}

console.log(`Foreground game window: ${window.windowTitle || window.processName}`);
console.log(`Window bounds: left=${window.bounds.left}, top=${window.bounds.top}, width=${window.bounds.width}, height=${window.bounds.height}`);
console.log("No mouse input will be generated. Enter the OUTER edges of the complete 12x20 stash grid.");

const prompt = createInterface({ input: stdin, output: stdout });
try {
  const captureCursor = args["capture-cursor"] === "true";
  const topLeft = captureCursor
    ? await capturePoint("outer top-left", prompt)
    : parsePoint(await prompt.question("Outer top-left screen point (x,y): "));
  const bottomRight = captureCursor
    ? await capturePoint("outer bottom-right", prompt)
    : parsePoint(await prompt.question("Outer bottom-right screen point (x,y): "));
  const calibration = createStashGridCalibration({
    profileId,
    gameBuildFingerprint,
    windowBounds: window.bounds,
    grid: { columns: 12, rows: 20 },
    gridTopLeft: topLeft,
    gridBottomRight: bottomRight
  });
  const outputDirectory = resolve("fixtures-private/runtime/move-003", profileId);
  await mkdir(outputDirectory, { recursive: true });
  const privateProfile = {
    schemaVersion: 1,
    private: true,
    calibration,
    windowIdentity: {
      windowHandle: window.windowHandle,
      processId: window.processId,
      processName: window.processName
    },
    display: window.display,
    createdAtUtc: new Date().toISOString()
  };
  await writeFile(resolve(outputDirectory, "calibration.private.json"), `${JSON.stringify(privateProfile, null, 2)}\n`, "utf8");

  const source = optionalPoint(args.source);
  const destination = optionalPoint(args.destination);
  await writeFile(
    resolve(outputDirectory, "calibration-preview.private.html"),
    renderPreview(calibration, source, destination),
    "utf8"
  );
  console.log(`Private calibration saved under fixtures-private/runtime/move-003/${profileId}/`);
  console.log("The preview is non-clicking and generated no game input.");
} finally {
  prompt.close();
}

async function capturePoint(label: string, prompt: ReturnType<typeof createInterface>): Promise<ScreenPoint> {
  await prompt.question(`Press Enter, then return to the game and place the cursor on the ${label} grid edge within 5 seconds. No click: `);
  console.log(`Sampling ${label} in 5 seconds...`);
  await new Promise(resolveDelay => setTimeout(resolveDelay, 5000));
  const sample = await bridge.inspectCursor();
  if (sample.windowHandle !== window.windowHandle ||
      sample.processName.toLowerCase() !== "dungeoncrawler" ||
      JSON.stringify(sample.bounds) !== JSON.stringify(window.bounds) ||
      JSON.stringify(sample.display) !== JSON.stringify(window.display)) {
    throw new Error("The foreground game window, bounds, or display changed during calibration.");
  }
  console.log(`${label} captured. Return to this terminal without moving or resizing the game window.`);
  return sample.cursor;
}

function renderPreview(
  calibration: ReturnType<typeof createStashGridCalibration>,
  source?: ScreenPoint,
  destination?: ScreenPoint
): string {
  const width = calibration.gridBottomRight.x - calibration.gridTopLeft.x;
  const height = calibration.gridBottomRight.y - calibration.gridTopLeft.y;
  const marker = (point: ScreenPoint | undefined, label: string, color: string) => {
    if (!point) return "";
    const center = cellCenterFor(calibration, point);
    const localX = center.x - calibration.gridTopLeft.x;
    const localY = center.y - calibration.gridTopLeft.y;
    return `<circle cx="${localX}" cy="${localY}" r="${Math.min(calibration.cellWidth, calibration.cellHeight) * 0.35}" fill="${color}" fill-opacity="0.65"/><text x="${localX + 6}" y="${localY - 6}" fill="${color}">${label} (${point.x},${point.y}) center (${center.x.toFixed(1)},${center.y.toFixed(1)})</text>`;
  };
  const vertical = Array.from({ length: 13 }, (_, x) => `<line x1="${x * calibration.cellWidth}" y1="0" x2="${x * calibration.cellWidth}" y2="${height}"/>`).join("");
  const horizontal = Array.from({ length: 21 }, (_, y) => `<line x1="0" y1="${y * calibration.cellHeight}" x2="${width}" y2="${y * calibration.cellHeight}"/>`).join("");
  return `<!doctype html><meta charset="utf-8"><title>MOVE-003 private calibration preview</title><style>body{background:#151515;color:#eee;font:14px system-ui}svg{background:#222;border:3px solid #fff}line{stroke:#777;stroke-width:.5}text{font-size:12px;font-weight:700}</style><h1>MOVE-003 private non-clicking preview</h1><p>Complete calibrated 12x20 boundary. Do not publish: screen coordinates are private.</p><svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${vertical}${horizontal}${marker(source, "SOURCE", "#ffcc00")}${marker(destination, "DESTINATION", "#00e5ff")}</svg>`;
}

function parseArgs(values: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("Arguments must be --name value pairs.");
    result[key.slice(2)] = value;
  }
  return result;
}
function required(values: Record<string, string>, key: string): string {
  const value = values[key]?.trim();
  if (!value) throw new Error(`--${key} is required.`);
  return value;
}
function optionalPoint(value: string | undefined): ScreenPoint | undefined {
  return value ? parsePoint(value) : undefined;
}
function parsePoint(value: string): ScreenPoint {
  const match = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(value);
  if (!match) throw new Error("Point must use x,y integer format.");
  return { x: Number(match[1]), y: Number(match[2]) };
}
