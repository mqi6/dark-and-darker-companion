import { execFile, spawn } from "node:child_process";
import { access, appendFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { stdin } from "node:process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { PreparedSupervisedMove } from "../src/domain/supervisedMove";

const execFileAsync = promisify(execFile);

export type OperatorPhase = "idle" | "focusing" | "running" | "completed" | "failed";

export interface OperatorPlanSummary {
  itemAlias: string;
  tabIndex: number;
  sourceCell: { x: number; y: number };
  destinationCell: { x: number; y: number };
  dragCount: 1;
  retry: false;
}

export interface OperatorState {
  phase: OperatorPhase;
  plan?: OperatorPlanSummary;
  game?: { processName: string; isForeground: boolean; coordinateSpace: string };
  lastResult?: { exitCode: number; summary: string };
  events: Array<{ at: string; event: string; detail: string }>;
}

export interface LocalOperatorDependencies {
  focusGame(): Promise<{ processName: string; isForeground: boolean }>;
  runPreparedMove(): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  persist(event: { at: string; event: string; detail: string }): Promise<void>;
}

export class LocalOperatorController {
  private state: OperatorState;
  private busy = false;

  constructor(plan: OperatorPlanSummary, private readonly dependencies: LocalOperatorDependencies) {
    this.state = { phase: "idle", plan, events: [] };
  }

  snapshot(): OperatorState {
    return structuredClone(this.state);
  }

  async focus(): Promise<OperatorState> {
    if (this.busy) throw new Error("operator-busy");
    this.busy = true;
    this.state.phase = "focusing";
    await this.record("focus-start", "Restoring DungeonCrawler foreground window.");
    try {
      const game = await this.dependencies.focusGame();
      this.state.game = { ...game, coordinateSpace: "virtual-desktop" };
      this.state.phase = "idle";
      await this.record("focus-complete", `${game.processName}:${game.isForeground}`);
      return this.snapshot();
    } catch (error) {
      this.state.phase = "failed";
      await this.record("focus-failed", error instanceof Error ? error.message : "unknown-error");
      throw error;
    } finally {
      this.busy = false;
    }
  }

  async run(): Promise<OperatorState> {
    if (this.busy) throw new Error("operator-busy");
    this.busy = true;
    this.state.phase = "focusing";
    await this.record("run-start", "One human-requested prepared run; automatic retry disabled.");
    try {
      const game = await this.dependencies.focusGame();
      this.state.game = { ...game, coordinateSpace: "virtual-desktop" };
      this.state.phase = "running";
      await this.record("game-foreground", game.processName);
      const result = await this.dependencies.runPreparedMove();
      const summary = lastNonEmptyLine(result.stdout) || lastNonEmptyLine(result.stderr) || "no-output";
      this.state.lastResult = { exitCode: result.exitCode, summary: summary.slice(0, 1000) };
      this.state.phase = result.exitCode === 0 ? "completed" : "failed";
      await this.record("run-complete", `exit=${result.exitCode}`);
      return this.snapshot();
    } catch (error) {
      this.state.phase = "failed";
      await this.record("run-failed", error instanceof Error ? error.message : "unknown-error");
      throw error;
    } finally {
      this.busy = false;
    }
  }

  private async record(event: string, detail: string) {
    const entry = { at: new Date().toISOString(), event, detail };
    this.state.events = [...this.state.events.slice(-99), entry];
    await this.dependencies.persist(entry);
  }
}

export function createLocalOperatorServer(parameters: {
  controller: LocalOperatorController;
  token: string;
}) {
  return createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/") {
        return send(response, 200, "text/html; charset=utf-8", operatorHtml(parameters.token));
      }
      if (request.method === "GET" && request.url === "/api/status") {
        return json(response, 200, parameters.controller.snapshot());
      }
      if (request.method === "POST" && request.url === "/api/focus") {
        requireToken(request, parameters.token);
        return json(response, 200, await parameters.controller.focus());
      }
      if (request.method === "POST" && request.url === "/api/run") {
        requireToken(request, parameters.token);
        return json(response, 200, await parameters.controller.run());
      }
      return json(response, 404, { error: "not-found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown-error";
      return json(response, message === "operator-busy" ? 409 : 500, { error: message });
    }
  });
}

export async function findOperatorPrivateDirectory(root: string): Promise<string> {
  const resolvedRoot = resolve(root);
  const candidates: Array<{ directory: string; modified: number }> = [];

  async function visit(directory: string, depth: number): Promise<void> {
    const planPath = resolve(directory, "plan.private.json");
    const calibrationPath = resolve(directory, "calibration.private.json");
    try {
      await Promise.all([access(planPath), access(calibrationPath)]);
      candidates.push({ directory, modified: (await stat(planPath)).mtimeMs });
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }

    if (depth >= 4) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isMissingFile(error)) return;
      throw error;
    }
    await Promise.all(
      entries
        .filter(entry => entry.isDirectory() && !entry.isSymbolicLink())
        .map(entry => visit(resolve(directory, entry.name), depth + 1))
    );
  }

  await visit(resolvedRoot, 0);
  candidates.sort((left, right) => right.modified - left.modified);
  const selected = candidates[0];
  if (!selected) {
    throw new Error(
      `No prepared runtime was found below ${resolvedRoot}. Expected matching plan.private.json and calibration.private.json files.`
    );
  }
  return selected.directory;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function main() {
  if (process.platform !== "win32") {
    throw new Error("The local operator must run in Windows PowerShell.");
  }
  const args = parseArgs(process.argv.slice(2));
  const privateDirectory = await findOperatorPrivateDirectory(
    args["private-directory"] ?? "fixtures-private/runtime/move-003"
  );
  const port = Number(args.port ?? 4317);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid operator port.");
  const plan = JSON.parse(
    await readFile(resolve(privateDirectory, "plan.private.json"), "utf8")
  ) as PreparedSupervisedMove;
  const calibration = JSON.parse(
    await readFile(resolve(privateDirectory, "calibration.private.json"), "utf8")
  ) as { windowIdentity: { windowHandle: string } };
  const logDirectory = resolve(privateDirectory, "operator-runs");
  await mkdir(logDirectory, { recursive: true });
  const logPath = resolve(logDirectory, "latest.private.jsonl");
  const helper = resolve("tools/windows-supervised-move.ps1");
  const controller = new LocalOperatorController(summarizePlan(plan), {
    async focusGame() {
      const result = await execFileAsync("powershell.exe", [
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", helper,
        "-FocusGame", "-ExpectedWindowHandle", calibration.windowIdentity.windowHandle
      ], { encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024 });
      const value = JSON.parse(result.stdout) as { processName: string; isForeground: boolean };
      if (!value.isForeground || value.processName.toLowerCase() !== "dungeoncrawler") {
        throw new Error("game-foreground-verification-failed");
      }
      return value;
    },
    runPreparedMove: () => spawnPreparedMove(privateDirectory),
    persist: entry => appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8")
  });
  const token = randomUUID();
  const server = createLocalOperatorServer({ controller, token });
  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`Local operator: ${url}`);
    console.log(`Private runtime: ${privateDirectory}`);
    if (args.open !== "false") {
      const child = spawn("cmd.exe", ["/c", "start", "", url], {
        detached: true, stdio: "ignore", windowsHide: true
      });
      child.unref();
    }
  });
}

function summarizePlan(plan: PreparedSupervisedMove): OperatorPlanSummary {
  return {
    itemAlias: plan.itemAlias,
    tabIndex: plan.tabIndex,
    sourceCell: plan.source.grid,
    destinationCell: plan.destination.grid,
    dragCount: 1,
    retry: false
  };
}

function spawnPreparedMove(privateDirectory: string) {
  return new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolveRun, reject) => {
    const child = spawn(process.execPath, [
      "--import", "tsx", resolve("tools/run-private-supervised-move.ts"),
      "--private-directory", privateDirectory, "--execute"
    ], { cwd: process.cwd(), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdoutText = "";
    let stderrText = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      stdoutText = boundedAppend(stdoutText, String(chunk));
      if (stdoutText.includes("Confirm Move / Cancel")) child.stdin.write("c\n");
    });
    child.stderr.on("data", chunk => { stderrText = boundedAppend(stderrText, String(chunk)); });
    child.once("error", reject);
    child.once("exit", code => resolveRun({ exitCode: code ?? 1, stdout: stdoutText, stderr: stderrText }));
  });
}

function requireToken(request: IncomingMessage, expected: string) {
  if (request.headers["x-operator-token"] !== expected) throw new Error("invalid-operator-token");
}

function json(response: ServerResponse, status: number, value: unknown) {
  send(response, status, "application/json; charset=utf-8", JSON.stringify(value));
}

function send(response: ServerResponse, status: number, contentType: string, body: string) {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'"
  });
  response.end(body);
}

function boundedAppend(current: string, next: string) {
  return `${current}${next}`.slice(-256 * 1024);
}

function lastNonEmptyLine(value: string) {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).at(-1) ?? "";
}

function parseArgs(values: string[]) {
  const result: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key?.startsWith("--")) throw new Error("Arguments must use --name value.");
    const value = values[++index];
    if (value === undefined) throw new Error(`${key} requires a value.`);
    result[key.slice(2)] = value;
  }
  return result;
}

function operatorHtml(token: string) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Companion Test Operator</title>
  <style>
  :root{font:15px system-ui;color:#eee;background:#0c0e11}body{margin:0;padding:28px}main{max-width:900px;margin:auto}.card{background:#171a1f;border:1px solid #343942;border-radius:10px;padding:20px;margin:14px 0}h1{margin:0 0 8px}p{color:#abb1ba}.row{display:flex;gap:12px;flex-wrap:wrap}button{border:1px solid #88613a;border-radius:7px;background:#2b2016;color:#ffd49c;padding:11px 16px;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}.danger{border-color:#844;color:#fbb;background:#2a1717}dl{display:grid;grid-template-columns:150px 1fr;gap:8px}dt{color:#838b96}dd{margin:0}pre{max-height:280px;overflow:auto;background:#0b0d10;padding:14px;border-radius:7px;white-space:pre-wrap}.pill{display:inline-block;padding:4px 9px;border-radius:99px;background:#253428;color:#9fe0ab}</style>
  <main><h1>Companion Test Operator</h1><p>Lightweight test controls. The main product UI will be implemented separately.</p>
  <section class="card"><span class="pill" id="phase">loading</span><dl><dt>Game</dt><dd id="game">—</dd><dt>Plan</dt><dd id="plan">—</dd><dt>Last result</dt><dd id="result">—</dd></dl><div class="row"><button id="focus">Bring game to front</button><button class="danger" id="run">Run one prepared move</button></div><p>Each click is one explicit request. Automatic retry is disabled. The game may be on any monitor.</p></section>
  <section class="card"><h2>Latest events</h2><pre id="events">No events yet.</pre></section></main>
  <script>
  const token=${JSON.stringify(token)};const q=id=>document.getElementById(id);
  async function api(path,method='GET'){const r=await fetch(path,{method,headers:method==='POST'?{'x-operator-token':token}:{}});const v=await r.json();if(!r.ok)throw new Error(v.error||r.statusText);return v}
  function draw(s){q('phase').textContent=s.phase;q('game').textContent=s.game?(s.game.processName+' · '+(s.game.isForeground?'foreground':'background')+' · '+s.game.coordinateSpace):'not checked';q('plan').textContent=s.plan?(s.plan.itemAlias+': tab '+s.plan.tabIndex+', ('+s.plan.sourceCell.x+','+s.plan.sourceCell.y+') → ('+s.plan.destinationCell.x+','+s.plan.destinationCell.y+'), one drag, no retry'):'not loaded';q('result').textContent=s.lastResult?('exit '+s.lastResult.exitCode+': '+s.lastResult.summary):'none';q('events').textContent=(s.events||[]).map(e=>e.at+'  '+e.event+'  '+e.detail).join('\n')||'No events yet.';const busy=['focusing','running'].includes(s.phase);q('focus').disabled=busy;q('run').disabled=busy}
  async function refresh(){try{draw(await api('/api/status'))}catch(e){q('result').textContent=e.message}}
  q('focus').onclick=async()=>{try{draw(await api('/api/focus','POST'))}catch(e){q('result').textContent=e.message}finally{refresh()}};
  q('run').onclick=async()=>{if(!confirm('Run exactly one prepared move? The game will be brought to the foreground. No retry.'))return;try{draw(await api('/api/run','POST'))}catch(e){q('result').textContent=e.message}finally{refresh()}};
  refresh();setInterval(refresh,1000);
  </script></html>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && stdin) {
  await main();
}
