#!/usr/bin/env node
/**
 * Local stand-in for the Google Apps Script Drive writer.
 * POST JSON { filename, mimeType, base64, date, secret } or { action:"list", ... }
 * Env: PORT (default 8790), MOCK_SECRET (required), MOCK_FAIL (optional "1" to always 500)
 */
import http from "node:http";

const PORT = Number(process.env.PORT || 8790);
const SECRET = process.env.MOCK_SECRET || "";
const FAIL = process.env.MOCK_FAIL === "1";

if (!SECRET) {
  console.error("MOCK_SECRET is required");
  process.exit(1);
}

/** @type {Map<string, {id:string,name:string,url:string,date:string,size:number}>} */
const store = new Map();
let seq = 1;

function timingSafeEqual(a, b) {
  a = String(a);
  b = String(b);
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const x = i < a.length ? a.charCodeAt(i) : 0;
    const y = i < b.length ? b.charCodeAt(i) : 0;
    diff |= x ^ y;
  }
  return diff === 0;
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET") {
    return send(res, 200, { ok: true, service: "mock-drive-script" });
  }
  if (req.method !== "POST") {
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return send(res, 400, { ok: false, error: "bad_request", message: "Body must be JSON." });
  }

  if (!timingSafeEqual(body.secret || "", SECRET)) {
    return send(res, 401, { ok: false, error: "unauthorized", message: "Invalid secret." });
  }

  if (FAIL) {
    return send(res, 500, { ok: false, error: "server_error", message: "Mock forced failure." });
  }

  if (body.action === "list") {
    const prefix = String(body.prefix || "");
    const objects = [...store.values()]
      .filter((o) => !prefix || o.date.startsWith(prefix) || `${o.date}/${o.name}`.startsWith(prefix))
      .map((o) => ({
        key: `${o.date}/${o.name}`,
        id: o.id,
        name: o.name,
        url: o.url,
        size: o.size,
      }));
    return send(res, 200, { ok: true, prefix, objects });
  }

  const filename = String(body.filename || "still");
  const date = String(body.date || "1970-01-01");
  const b64 = String(body.base64 || "");
  if (!b64) {
    return send(res, 400, { ok: false, error: "bad_request", message: "base64 required." });
  }
  const size = Buffer.from(b64, "base64").byteLength;
  const id = `mock-${seq++}`;
  // unique name
  let name = filename;
  let n = 2;
  while ([...store.values()].some((o) => o.date === date && o.name === name)) {
    const i = filename.lastIndexOf(".");
    const stem = i > 0 ? filename.slice(0, i) : filename;
    const ext = i > 0 ? filename.slice(i) : "";
    name = `${stem}-${n++}${ext}`;
  }
  const url = `https://drive.google.com/file/d/${id}/view`;
  store.set(id, { id, name, url, date, size });
  return send(res, 201, { ok: true, id, name, url, date });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock-drive-script listening on http://127.0.0.1:${PORT}/`);
});
