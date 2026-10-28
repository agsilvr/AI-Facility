import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { Facility } from "./facility";

const PUSH_EVERY_MS = 150;
const MAX_BODY = 4096;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ServerOptions {
  /** Built screens to serve, or null to serve only the API. */
  staticDir: string | null;
  /** Host names the facility answers to; anything else is refused. */
  allowedHosts: string[];
}

/**
 * The facility's local web server: the API the screens use, plus the built
 * screens themselves. It only answers to its own host names (which blocks
 * DNS-rebinding tricks), and only same-origin JSON requests may change
 * anything, so a web page open in another tab can't press buttons in the facility.
 */
export function createFacilityServer(facility: Facility, options: ServerOptions) {
  const { staticDir, allowedHosts } = options;
  return createServer((req, res) => {
    handle(facility, staticDir, allowedHosts, req, res).catch((err: unknown) => {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) sendJson(res, status, { error: err instanceof Error ? err.message : "Error" });
      else res.end();
    });
  });
}

async function handle(
  facility: Facility,
  staticDir: string | null,
  allowedHosts: string[],
  req: IncomingMessage,
  res: ServerResponse,
) {
  checkHost(req, allowedHosts);
  const url = new URL(req.url ?? "/", "http://facility.local");
  const path = url.pathname;

  if (req.method === "GET" && path === "/api/health") return sendJson(res, 200, { ok: true });
  if (req.method === "GET" && path === "/api/state") {
    return sendJson(res, 200, { state: facility.ledger.getState(), control: facility.getControl() });
  }
  if (req.method === "GET" && path === "/api/events") return streamEvents(facility, req, res);

  if (req.method === "POST" && path.startsWith("/api/")) {
    checkSameOrigin(req);
    const body = await readJson(req);

    const approval = path.match(/^\/api\/approvals\/([^/]+)$/);
    if (approval) {
      if (typeof body.approve !== "boolean") throw new HttpError(400, "approve must be true or false");
      const id = decodeURIComponent(approval[1]);
      const found = facility.ledger.getState().approvals.find((a) => a.id === id && a.status === "pending");
      if (!found) throw new HttpError(404, "No pending approval with that id");
      facility.ledger.decide(id, body.approve);
      return sendJson(res, 200, { ok: true });
    }

    const pause = path.match(/^\/api\/agents\/([^/]+)\/pause$/);
    if (pause) {
      if (typeof body.paused !== "boolean") throw new HttpError(400, "paused must be true or false");
      const id = decodeURIComponent(pause[1]);
      if (!facility.ledger.agent(id)) throw new HttpError(404, "No agent with that id");
      facility.ledger.setAgentPaused(id, body.paused);
      return sendJson(res, 200, { ok: true });
    }

    if (path === "/api/control") {
      facility.setControl({
        running: typeof body.running === "boolean" ? body.running : undefined,
        speed: typeof body.speed === "number" ? body.speed : undefined,
      });
      return sendJson(res, 200, { ok: true, control: facility.getControl() });
    }
    throw new HttpError(404, "Unknown endpoint");
  }

  if (req.method === "GET" && staticDir) return serveStatic(staticDir, path, res);
  throw new HttpError(404, "Not found");
}

function hostName(host: string) {
  return new URL(`http://${host}`).hostname;
}

function checkHost(req: IncomingMessage, allowedHosts: string[]) {
  const host = req.headers.host;
  if (!host || !allowedHosts.includes(hostName(host))) throw new HttpError(421, "Unknown host");
}

function checkSameOrigin(req: IncomingMessage) {
  const type = req.headers["content-type"] ?? "";
  if (!type.startsWith("application/json")) throw new HttpError(415, "Expected JSON");
  const origin = req.headers.origin;
  // Browsers always send Origin on cross-site POSTs. Requests without one come
  // from local tools (curl, scripts) on this machine, which are allowed.
  if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, "Cross-origin request refused");
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "Request too large");
    chunks.push(chunk as Buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

/** Push a full snapshot right away, then at most every PUSH_EVERY_MS while things change. */
function streamEvents(facility: Facility, req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  let pending = true;
  const send = () => {
    if (!pending) return;
    pending = false;
    const snapshot = { state: facility.ledger.getState(), control: facility.getControl() };
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
  };
  const mark = () => {
    pending = true;
  };
  send();
  const offState = facility.ledger.subscribe(mark);
  const offControl = facility.onControl(mark);
  const timer = setInterval(send, PUSH_EVERY_MS);
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => {
    offState();
    offControl();
    clearInterval(timer);
    clearInterval(keepAlive);
  });
}

function serveStatic(root: string, path: string, res: ServerResponse) {
  const base = resolve(root);
  let file = resolve(join(base, normalize(decodeURIComponent(path))));
  if (file !== base && !file.startsWith(base + sep)) throw new HttpError(404, "Not found");
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(base, "index.html");
  if (!existsSync(file)) throw new HttpError(404, "Screens not built yet. Run npm run build.");
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
