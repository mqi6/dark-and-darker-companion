import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { DarkerDbClient, PINNED_DARKERDB_API_VERSION } from "../src/adapters/darkerdb";
import { DarkerDbMarketplaceCatalogLoader } from "../src/adapters/darkerdbMarketplaceCatalogLoader";
import { MarketplaceLiveController } from "../src/adapters/marketplaceLiveController";
import type { MarketplaceSearchSpecInput } from "../src/domain/marketplaceSearch";

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const apiKey = process.env.DARKERDB_API_KEY;
  if (!apiKey) {
    process.stderr.write(
      "DARKERDB_API_KEY is required. It stays in this Node process and is never sent to the browser.\n"
    );
    process.exitCode = 2;
  } else {
    await main(apiKey);
  }
}

export async function createMarketplaceLiveOperator(parameters: {
  controller: Pick<MarketplaceLiveController, "catalog" | "search" | "cancel">;
  distDirectory: string;
  allowedOrigins: ReadonlySet<string>;
}) {
  const indexPath = resolve(parameters.distDirectory, "index.html");
  await access(indexPath);
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname.startsWith("/api/marketplace/")) {
        enforceSameOrigin(request, parameters.allowedOrigins);
        if (request.method === "GET" && url.pathname === "/api/marketplace/catalog") {
          return json(response, 200, await parameters.controller.catalog());
        }
        if (request.method === "POST" && url.pathname === "/api/marketplace/cancel") {
          await readJsonBody(request);
          parameters.controller.cancel();
          return json(response, 200, { status: "cancelled" });
        }
        if (
          request.method === "POST" &&
          (url.pathname === "/api/marketplace/search" || url.pathname === "/api/marketplace/refresh")
        ) {
          const body = await readJsonBody(request) as { spec?: unknown };
          if (body.spec === undefined) return json(response, 400, { error: "missing-search-spec" });
          const cancelOnDisconnect = () => parameters.controller.cancel();
          request.once("aborted", cancelOnDisconnect);
          response.once("close", () => {
            if (!response.writableEnded) cancelOnDisconnect();
          });
          return json(
            response,
            200,
            await parameters.controller.search(body.spec as MarketplaceSearchSpecInput, {
              refresh: url.pathname.endsWith("/refresh")
            })
          );
        }
        return json(response, 404, { error: "not-found" });
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        return json(response, 405, { error: "method-not-allowed" });
      }
      if (url.pathname === "/marketplace-runtime-config.js") {
        return send(
          response,
          200,
          "text/javascript; charset=utf-8",
          'globalThis.__DARKERDB_MARKETPLACE_RUNTIME__={baseUrl:"/api/marketplace"};\n',
          request.method === "HEAD"
        );
      }
      return serveStatic(response, request.method === "HEAD", parameters.distDirectory, url.pathname);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown-error";
      return json(response, statusForError(message), { error: message });
    }
  });
}

async function main(apiKey: string) {
  const args = parseArgs(process.argv.slice(2));
  const port = Number(args.port ?? 4318);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid operator port.");
  const distDirectory = resolve(args.dist ?? "dist");
  const origin = `http://127.0.0.1:${port}`;
  const localhostOrigin = `http://localhost:${port}`;
  const client = new DarkerDbClient({
    apiKey,
    apiVersion: process.env.DARKERDB_API_VERSION ?? PINNED_DARKERDB_API_VERSION,
    ...(process.env.DARKERDB_BASE_URL === undefined
      ? {}
      : { baseUrl: process.env.DARKERDB_BASE_URL })
  });
  const loader = new DarkerDbMarketplaceCatalogLoader(client, {
    ...(process.env.DARKERDB_ZH_LOCALE === undefined
      ? {}
      : { simplifiedChineseLocale: process.env.DARKERDB_ZH_LOCALE })
  });
  const controller = new MarketplaceLiveController(client, loader);

  process.stdout.write("Loading the canonical English and Simplified Chinese DarkerDB catalogs...\n");
  const catalog = await controller.catalog();
  process.stdout.write(
    `Catalog ready: ${catalog.items.length} variants, ${catalog.families.length} item names, ${catalog.attributes.length} attributes.\n`
  );
  const server = await createMarketplaceLiveOperator({
    controller,
    distDirectory,
    allowedOrigins: new Set([origin, localhostOrigin])
  });
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`Marketplace companion: ${origin}\n`);
    process.stdout.write("Marketplace listing requests run only after Search, Refresh, or Load more.\n");
    if (args.open !== "false") openBrowser(origin);
  });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error("content-type-must-be-application-json");
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 64 * 1024) throw new Error("request-body-too-large");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text || "{}");
}

function enforceSameOrigin(request: IncomingMessage, allowedOrigins: ReadonlySet<string>): void {
  const origin = request.headers.origin;
  if (origin !== undefined && !allowedOrigins.has(origin)) throw new Error("cross-origin-request-blocked");
  if (request.headers["sec-fetch-site"] === "cross-site") throw new Error("cross-site-request-blocked");
}

async function serveStatic(
  response: ServerResponse,
  headOnly: boolean,
  distDirectory: string,
  pathname: string
) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const candidate = resolve(distDirectory, relative);
  const root = resolve(distDirectory) + sep;
  if (candidate !== resolve(distDirectory) && !candidate.startsWith(root)) {
    return json(response, 404, { error: "not-found" });
  }
  try {
    const body = await readFile(candidate);
    return send(response, 200, contentType(candidate), body, headOnly);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    if (extname(relative) !== "") return json(response, 404, { error: "not-found" });
    const body = await readFile(resolve(distDirectory, "index.html"));
    return send(response, 200, "text/html; charset=utf-8", body, headOnly);
  }
}

function json(response: ServerResponse, status: number, value: unknown) {
  return send(response, status, "application/json; charset=utf-8", JSON.stringify(value), false);
}

function send(
  response: ServerResponse,
  status: number,
  type: string,
  body: string | Buffer,
  headOnly: boolean
) {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": type.startsWith("text/html") || type.startsWith("application/json")
      ? "no-store"
      : "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  });
  response.end(headOnly ? undefined : body);
}

function contentType(path: string): string {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webp": "image/webp",
    ".ico": "image/x-icon"
  } as Record<string, string>)[extname(path)] ?? "application/octet-stream";
}

function statusForError(message: string): number {
  if (message.includes("cross-origin") || message.includes("cross-site")) return 403;
  if (
    message.includes("content-type") ||
    message.includes("request-body") ||
    message.includes("JSON") ||
    message.includes("search-spec")
  ) return 400;
  return 500;
}

function openBrowser(url: string): void {
  const command = process.platform === "win32"
    ? { executable: "cmd.exe", args: ["/c", "start", "", url] }
    : process.platform === "darwin"
      ? { executable: "open", args: [url] }
      : { executable: "xdg-open", args: [url] };
  const child = spawn(command.executable, command.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
}

function parseArgs(values: string[]): Record<string, string> {
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
