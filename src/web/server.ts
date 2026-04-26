// Local-only HTTP server. Serves the bundled SPA + JSON API + SSE feed.
// 127.0.0.1 binding only; external IPs receive a 403.
//
// The server keeps an in-memory analysis (refreshed every 10s) so API calls
// are O(1). On every refresh, if the analysis changes, we push an SSE event.

import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import url from "node:url";
import { fileURLToPath } from "node:url";
import { analyze } from "../core/analyze.js";
import type { Analysis } from "../core/types.js";
import { log } from "../core/logger.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

export interface ServerOptions {
  port: number;
  open?: boolean;
}

export interface ServerHandle {
  url: string;
  token: string;
  close(): Promise<void>;
}

export async function startServer(opts: ServerOptions): Promise<ServerHandle> {
  const token = crypto.randomBytes(16).toString("hex");
  const webDir = await locateWebDir();

  let analysisCache: Analysis | null = null;
  let lastRefresh = 0;
  const refresh = async (): Promise<Analysis> => {
    if (analysisCache && Date.now() - lastRefresh < 5_000) return analysisCache;
    analysisCache = await analyze({ days: 90, fillGaps: true });
    lastRefresh = Date.now();
    pushEvent({ type: "analysis-updated", at: lastRefresh });
    return analysisCache;
  };
  // warm cache in background
  refresh().catch(() => {});
  setInterval(() => {
    refresh().catch(() => {});
  }, 30_000).unref();

  const sseClients = new Set<http.ServerResponse>();
  function pushEvent(payload: object): void {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(data);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      // 127-only enforcement
      const remote = req.socket.remoteAddress ?? "";
      if (
        !remote.startsWith("127.") &&
        remote !== "::1" &&
        remote !== "::ffff:127.0.0.1" &&
        remote !== "localhost"
      ) {
        res.writeHead(403).end("forbidden");
        return;
      }

      const u = url.parse(req.url ?? "/", true);
      const pathname = u.pathname ?? "/";

      // CORS: explicitly NONE — only same-origin loads from the served HTML
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");

      if (pathname.startsWith("/api/")) {
        // bearer-token auth on API
        const auth = req.headers.authorization ?? "";
        const tokFromHeader = auth.replace(/^Bearer /, "");
        const tokFromQuery = String(u.query.t ?? "");
        if (tokFromHeader !== token && tokFromQuery !== token) {
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }
        await handleApi(pathname, u.query, refresh, sseClients, req, res);
        return;
      }

      // static file
      await serveStatic(webDir, pathname, token, res);
    } catch (err) {
      log.warn(`server error: ${(err as Error).message}`);
      try {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("internal error");
      } catch {
        /* ignore */
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", () => resolve());
  });

  const baseUrl = `http://127.0.0.1:${opts.port}/?t=${token}`;
  return {
    url: baseUrl,
    token,
    async close(): Promise<void> {
      for (const c of sseClients) c.end();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function handleApi(
  pathname: string,
  query: NodeJS.Dict<string | string[]>,
  getAnalysis: () => Promise<Analysis>,
  sseClients: Set<http.ServerResponse>,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const a = await getAnalysis();
  const json = (data: unknown) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  const days = parseInt(String(query.days ?? 30), 10) || 30;
  const sinceMs = Date.now() - days * 86_400_000;
  const sessionsInRange = a.sessions.filter((s) => s.endMs >= sinceMs);

  if (pathname === "/api/summary") {
    json({
      generatedAt: a.generatedAt,
      totals: {
        ...a.totals,
        totalCost: sessionsInRange.reduce((acc, s) => acc + s.cost.totalCost, 0),
        sessions: sessionsInRange.length,
      },
      daily: a.daily.filter((d) => new Date(d.date).getTime() >= sinceMs),
      byProject: a.byProject,
      byModel: a.byModel,
      recommendationsCount: a.recommendations.length,
    });
    return;
  }
  if (pathname === "/api/sessions") {
    const top = parseInt(String(query.top ?? 100), 10);
    const sort = String(query.sort ?? "cost");
    const proj = query.project ? String(query.project).toLowerCase() : "";
    let list = sessionsInRange;
    if (proj) list = list.filter((s) => s.projectPath.toLowerCase().includes(proj));
    list = [...list].sort((x, y) => {
      switch (sort) {
        case "duration":
          return y.durationMs - x.durationMs;
        case "busts":
          return y.cacheBusts.length - x.cacheBusts.length;
        case "date":
          return y.startMs - x.startMs;
        default:
          return y.cost.totalCost - x.cost.totalCost;
      }
    });
    json(list.slice(0, top));
    return;
  }
  if (pathname.startsWith("/api/sessions/")) {
    const id = pathname.replace("/api/sessions/", "");
    const s = a.sessions.find((x) => x.id === id);
    if (!s) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    json(s);
    return;
  }
  if (pathname === "/api/cache") {
    json({
      busts: a.totals.busts,
      bustCost: a.totals.bustCost,
      hitRatio: a.totals.cacheHitRatio,
      daily: a.daily.filter((d) => new Date(d.date).getTime() >= sinceMs),
    });
    return;
  }
  if (pathname === "/api/recommendations") {
    json(a.recommendations);
    return;
  }
  if (pathname === "/api/trends") {
    json({ daily: a.daily.filter((d) => new Date(d.date).getTime() >= sinceMs) });
    return;
  }
  if (pathname === "/api/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "hello", at: Date.now() })}\n\n`);
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }
  if (pathname === "/api/parse-stats") {
    json(a.parseStats);
    return;
  }
  if (pathname === "/api/tools") {
    json(a.byTool);
    return;
  }
  if (pathname === "/api/tags") {
    const tags = new Map<string, { sessions: number; cost: number }>();
    for (const s of a.sessions) {
      if (!s.tag) continue;
      const cur = tags.get(s.tag) ?? { sessions: 0, cost: 0 };
      cur.sessions += 1;
      cur.cost += s.cost.totalCost;
      tags.set(s.tag, cur);
    }
    json([...tags.entries()].map(([tag, v]) => ({ tag, ...v })));
    return;
  }
  if (pathname === "/api/metrics") {
    // Prometheus exposition format
    res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
    const lines = [
      `# HELP ccmeter_total_spend_usd total spend in window`,
      `# TYPE ccmeter_total_spend_usd gauge`,
      `ccmeter_total_spend_usd ${a.totals.totalCost.toFixed(6)}`,
      `# HELP ccmeter_cache_hit_ratio cache hit ratio`,
      `# TYPE ccmeter_cache_hit_ratio gauge`,
      `ccmeter_cache_hit_ratio ${a.totals.cacheHitRatio.toFixed(4)}`,
      `# HELP ccmeter_cache_busts cache bust count`,
      `# TYPE ccmeter_cache_busts gauge`,
      `ccmeter_cache_busts ${a.totals.busts}`,
      `# HELP ccmeter_cache_bust_cost_usd dollars wasted on busts`,
      `# TYPE ccmeter_cache_bust_cost_usd gauge`,
      `ccmeter_cache_bust_cost_usd ${a.totals.bustCost.toFixed(6)}`,
    ];
    res.end(lines.join("\n") + "\n");
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

async function serveStatic(
  root: string,
  pathname: string,
  token: string,
  res: http.ServerResponse,
): Promise<void> {
  let p = pathname === "/" ? "/index.html" : pathname;
  // strip leading slash and prevent traversal
  const clean = path.normalize(p).replace(/^[/\\]+/, "");
  const filePath = path.join(root, clean);
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    // SPA fallback: route every unknown path to index.html
    if (path.extname(clean) === "") {
      const html = await renderIndex(root, token);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    res.writeHead(404).end("not found");
    return;
  }
  if (!stat.isFile()) {
    res.writeHead(404).end("not found");
    return;
  }
  if (clean === "index.html") {
    const html = await renderIndex(root, token);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "content-type": MIME[ext] ?? "application/octet-stream",
    "cache-control": "public, max-age=300",
  });
  createReadStream(filePath).pipe(res);
}

async function renderIndex(root: string, token: string): Promise<string> {
  const indexPath = path.join(root, "index.html");
  let html: string;
  try {
    html = await fs.readFile(indexPath, "utf8");
  } catch {
    html = fallbackHtml();
  }
  // Inject the token as a global so API calls can use it from JS.
  const inject = `<script>window.__CCMETER_TOKEN__=${JSON.stringify(token)};</script>`;
  if (html.includes("</head>")) return html.replace("</head>", `${inject}</head>`);
  return inject + html;
}

function fallbackHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>ccmeter</title></head>
<body style="font-family:system-ui;max-width:680px;margin:60px auto;padding:0 20px;">
<h1>ccmeter dashboard</h1>
<p>The bundled SPA isn't available in this build (you may have installed without the web bundle).</p>
<p>The JSON API still works. Try:</p>
<pre>curl -H "Authorization: Bearer YOUR_TOKEN" http://127.0.0.1:7777/api/summary</pre>
<p>Use the CLI for now: <code>ccmeter</code>, <code>ccmeter recommend</code>, <code>ccmeter cache</code>.</p>
</body></html>`;
}

async function locateWebDir(): Promise<string> {
  // After tsc, this file lives at dist/web/server.js. Vite emits the SPA
  // bundle into the same directory, so the web assets ARE the cwd.
  // (We also support an env override for hacking on the dashboard locally.)
  const override = process.env.CCMETER_WEB_DIR;
  if (override && override.length > 0) return path.resolve(override);
  const here = fileURLToPath(import.meta.url);
  const candidate = path.dirname(here);
  // sanity check: if there's no index.html here, fall back to ../web
  try {
    await fs.access(path.join(candidate, "index.html"));
    return candidate;
  } catch {
    return path.join(path.dirname(candidate), "web");
  }
}
