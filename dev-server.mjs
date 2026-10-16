// Local server: runs this folder exactly like Vercel does (static files + /api functions).
// Start with:  npm run dev   (run "npm install" once first)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

// Load .env.local / .env (simple KEY=VALUE lines)
for (const f of [".env.local", ".env"]) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const headerRules = (vercel.headers || []).map((h) => ({
  re: new RegExp("^" + h.source.replace(/\(\.\*\)/g, ".*") + "$"),
  headers: h.headers,
}));

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".mp4": "video/mp4", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};
// Never serve these over HTTP (Vercel does not either).
const BLOCKED = /^\/(\.env|\.git|node_modules|supabase|api\/_|dev-server\.mjs|package(-lock)?\.json|vercel\.json|.*\.bat$|.*\.md$)/i;

function applyHeaders(res, urlPath) {
  for (const r of headerRules) if (r.re.test(urlPath)) for (const h of r.headers) res.setHeader(h.key, h.value);
}

async function runApi(name, req, res) {
  const file = path.join(ROOT, "api", name + ".js");
  if (!/^[a-z0-9-]+$/i.test(name) || !fs.existsSync(file)) {
    res.statusCode = 404; return res.end("Not found");
  }
  const mod = await import(pathToFileURL(file).href + "?t=" + fs.statSync(file).mtimeMs);
  return mod.default(req, res);
}

function serveStatic(urlPath, req, res) {
  let rel = decodeURIComponent(urlPath);
  if (rel.endsWith("/")) rel += "index.html";
  const full = path.normalize(path.join(ROOT, rel));
  if (!full.startsWith(ROOT + path.sep)) { res.statusCode = 403; return res.end("Forbidden"); }
  let file = full;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    res.statusCode = 308; res.setHeader("Location", urlPath + "/"); return res.end();
  }
  if (!fs.existsSync(file)) { res.statusCode = 404; res.setHeader("Content-Type", "text/plain"); return res.end("Not found"); }
  const stat = fs.statSync(file);
  const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
  res.setHeader("Content-Type", type);
  // Range support so the scroll film can seek
  const range = req.headers.range;
  if (range && /^bytes=\d*-\d*$/.test(range)) {
    let [s, e] = range.slice(6).split("-");
    let start = s ? parseInt(s, 10) : stat.size - parseInt(e, 10);
    let end = s && e ? parseInt(e, 10) : stat.size - 1;
    if (isNaN(start) || start < 0 || start >= stat.size || end >= stat.size || start > end) {
      res.statusCode = 416; res.setHeader("Content-Range", `bytes */${stat.size}`); return res.end();
    }
    res.statusCode = 206;
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    res.setHeader("Content-Length", end - start + 1);
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Length", stat.size);
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = new URL(req.url, "http://localhost").pathname;
    if (BLOCKED.test(urlPath)) { res.statusCode = 404; return res.end("Not found"); }
    applyHeaders(res, urlPath);
    const api = urlPath.match(/^\/api\/([^/]+?)\/?$/);
    if (api) return await runApi(api[1], req, res);
    // clean URLs like Vercel: /manage -> /manage/
    if (/^\/(manage|portal|request|print)$/.test(urlPath)) { res.statusCode = 308; res.setHeader("Location", urlPath + "/"); return res.end(); }
    return serveStatic(urlPath, req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.statusCode = 500; res.end("Server error"); }
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("  Parceros website running:");
  console.log(`    Public site      http://localhost:${PORT}/`);
  console.log(`    Customer portal  http://localhost:${PORT}/portal/`);
  console.log(`    Shop management  http://localhost:${PORT}/manage/`);
  console.log(`    Estimate request http://localhost:${PORT}/request/`);
  if (!process.env.SUPABASE_URL) console.log("\n  ! Supabase is not set up yet: copy .env.example to .env.local and fill it in (see SETUP.md).");
  console.log("\n  Keep this window open. Press Ctrl+C to stop.\n");
});
