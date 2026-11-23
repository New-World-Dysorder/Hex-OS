/**
 * nv-file-organizer — drop box for Prof. Indigo stills.
 *
 * STORAGE modes:
 *   r2    — Cloudflare R2 only (binding STILLS → bucket nv-stills)
 *   drive — Google Drive only, via Apps Script (DRIVE_SCRIPT_URL)
 *   both  — write R2 first, then Drive (intended dual-save mode)
 *
 * /list and /file always read from R2 when STORAGE is r2 or both.
 * In drive-only mode, /list proxies the Apps Script list action; /file returns 501
 * (Drive files are opened via the Drive URL returned on upload).
 *
 * Do not deploy or change live secrets without Jasmine's explicit word.
 */

export interface Env {
  STILLS?: R2Bucket;
  UPLOAD_KEY?: string;
  STORAGE?: string;
  DRIVE_SCRIPT_URL?: string;
  DRIVE_SHARED_SECRET?: string;
}

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB (Worker + R2)
// Apps Script web-app POST ~50 MB; base64 expands ~4/3 → ~35 MB raw theoretical.
// We keep the same 25 MB check so both backends stay under that ceiling.
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);

type Detected = { mime: string; ext: string };
type StorageMode = "r2" | "drive" | "both";

function json(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });
}

/** Constant-time compare for bearer tokens / shared secrets. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    const x = i < ab.length ? ab[i] : 0;
    const y = i < bb.length ? bb[i] : 0;
    diff |= x ^ y;
  }
  return diff === 0;
}

function storageMode(env: Env): StorageMode {
  const raw = (env.STORAGE || "r2").toLowerCase().trim();
  if (raw === "drive") return "drive";
  if (raw === "both") return "both";
  return "r2";
}

function requireAuth(request: Request, env: Env): Response | null {
  if (!env.UPLOAD_KEY) {
    return json(
      {
        error: "misconfigured",
        message: "UPLOAD_KEY secret is not set. Refusing non-health routes.",
      },
      503,
    );
  }
  const header = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) {
    return json({ error: "unauthorized", message: "Missing Bearer token." }, 401);
  }
  if (!timingSafeEqual(m[1].trim(), env.UPLOAD_KEY)) {
    return json({ error: "unauthorized", message: "Invalid token." }, 401);
  }
  return null;
}

function detectImage(bytes: Uint8Array): Detected | null {
  if (bytes.length < 12) return null;

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }

  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return { mime: "image/gif", ext: "gif" };
  }

  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: "image/webp", ext: "webp" };
  }

  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(
      bytes[8],
      bytes[9],
      bytes[10],
      bytes[11],
    );
    const head = new TextDecoder().decode(bytes.subarray(0, Math.min(64, bytes.length)));
    if (
      brand === "avif" ||
      brand === "avis" ||
      head.includes("avif") ||
      head.includes("avis")
    ) {
      return { mime: "image/avif", ext: "avif" };
    }
  }

  return null;
}

function sanitizeName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() || "still";
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 120);
  return cleaned || "still";
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function splitName(name: string): { stem: string; ext: string } {
  const i = name.lastIndexOf(".");
  if (i <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, i), ext: name.slice(i) };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function uniqueKey(bucket: R2Bucket, folder: string, filename: string): Promise<string> {
  let candidate = `${folder}/${filename}`;
  const existing = await bucket.head(candidate);
  if (!existing) return candidate;

  const { stem, ext } = splitName(filename);
  for (let n = 2; n < 10_000; n++) {
    candidate = `${folder}/${stem}-${n}${ext}`;
    const hit = await bucket.head(candidate);
    if (!hit) return candidate;
  }
  return `${folder}/${stem}-${Date.now()}${ext}`;
}

async function readUpload(
  request: Request,
): Promise<{ bytes: Uint8Array; name: string; claimedType: string | null } | Response> {
  const url = new URL(request.url);
  const contentType = (request.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return json({ error: "bad_request", message: "Could not parse multipart body." }, 400);
    }
    const file = form.get("file");
    // Duck-type: workers-types FormDataEntryValue may not support `instanceof File`.
    if (
      file === null ||
      typeof file === "string" ||
      typeof (file as Blob).arrayBuffer !== "function"
    ) {
      return json(
        { error: "bad_request", message: "multipart field 'file' is required." },
        400,
      );
    }
    const blob = file as File;
    if (blob.size > MAX_BYTES) {
      return json({ error: "too_large", message: "Max size is 25 MB." }, 413);
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    return {
      bytes: buf,
      name: (blob as File).name || url.searchParams.get("name") || "still",
      claimedType: blob.type || null,
    };
  }

  const cl = request.headers.get("content-length");
  if (cl && Number(cl) > MAX_BYTES) {
    return json({ error: "too_large", message: "Max size is 25 MB." }, 413);
  }
  const ab = await request.arrayBuffer();
  if (ab.byteLength > MAX_BYTES) {
    return json({ error: "too_large", message: "Max size is 25 MB." }, 413);
  }
  if (ab.byteLength === 0) {
    return json({ error: "bad_request", message: "Empty body." }, 400);
  }
  const name = url.searchParams.get("name") || "still";
  return {
    bytes: new Uint8Array(ab),
    name,
    claimedType: request.headers.get("content-type"),
  };
}

type ValidatedUpload = {
  bytes: Uint8Array;
  filename: string;
  mime: string;
};

async function validateUpload(
  request: Request,
): Promise<ValidatedUpload | Response> {
  const parsed = await readUpload(request);
  if (parsed instanceof Response) return parsed;

  const { bytes, name, claimedType } = parsed;
  const detected = detectImage(bytes);
  if (!detected) {
    return json(
      {
        error: "unsupported_media",
        message:
          "Not a recognized image (png/jpeg/webp/gif/avif). Magic bytes checked; content-type alone is not enough.",
        claimedType,
      },
      415,
    );
  }
  if (!ALLOWED_TYPES.has(detected.mime)) {
    return json({ error: "unsupported_media", message: `Type ${detected.mime} not allowed.` }, 415);
  }
  if (claimedType) {
    const claimed = claimedType.split(";")[0].trim().toLowerCase();
    if (claimed.startsWith("image/") && claimed !== detected.mime) {
      const jpegAlias =
        (claimed === "image/jpg" || claimed === "image/jpeg") &&
        detected.mime === "image/jpeg";
      if (!jpegAlias) {
        return json(
          {
            error: "unsupported_media",
            message: `Claimed type ${claimed} does not match file magic (${detected.mime}).`,
          },
          415,
        );
      }
    }
  }

  let filename = sanitizeName(name);
  const { stem, ext } = splitName(filename);
  if (!ext || ext.toLowerCase() !== `.${detected.ext}`) {
    filename = `${stem || "still"}.${detected.ext}`;
  }

  return { bytes, filename, mime: detected.mime };
}

type DriveResult =
  | { ok: true; id: string; name: string; url: string }
  | { ok: false; error: string };

async function uploadToDrive(
  env: Env,
  upload: ValidatedUpload,
  date: string,
): Promise<DriveResult> {
  if (!env.DRIVE_SCRIPT_URL || !env.DRIVE_SHARED_SECRET) {
    return {
      ok: false,
      error: "DRIVE_SCRIPT_URL or DRIVE_SHARED_SECRET not configured",
    };
  }

  const payload = {
    filename: upload.filename,
    mimeType: upload.mime,
    base64: bytesToBase64(upload.bytes),
    date,
    secret: env.DRIVE_SHARED_SECRET,
  };

  let res: Response;
  try {
    res = await fetch(env.DRIVE_SCRIPT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    console.error("drive_upload_fetch_failed", msg);
    return { ok: false, error: `Drive script unreachable: ${msg}` };
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    console.error("drive_upload_bad_json", res.status);
    return { ok: false, error: `Drive script returned non-JSON (HTTP ${res.status})` };
  }

  if (!res.ok || body.ok === false) {
    const err =
      typeof body.error === "string"
        ? body.error
        : typeof body.message === "string"
          ? body.message
          : `HTTP ${res.status}`;
    console.error("drive_upload_rejected", err);
    return { ok: false, error: err };
  }

  return {
    ok: true,
    id: String(body.id || ""),
    name: String(body.name || upload.filename),
    url: String(body.url || ""),
  };
}

async function uploadToR2(
  env: Env,
  upload: ValidatedUpload,
  date: string,
): Promise<{ key: string } | Response> {
  if (!env.STILLS) {
    return json(
      {
        error: "misconfigured",
        message: "R2 binding STILLS is not available.",
      },
      503,
    );
  }
  const folder = `stills/${date}`;
  const key = await uniqueKey(env.STILLS, folder, upload.filename);
  await env.STILLS.put(key, upload.bytes, {
    httpMetadata: { contentType: upload.mime },
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      originalName: upload.filename,
    },
  });
  return { key };
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  const mode = storageMode(env);
  const validated = await validateUpload(request);
  if (validated instanceof Response) return validated;

  const date = todayUTC();

  if (mode === "r2") {
    const r2 = await uploadToR2(env, validated, date);
    if (r2 instanceof Response) return r2;
    return json(
      {
        key: r2.key,
        size: validated.bytes.byteLength,
        type: validated.mime,
        "url-path": `/file/${r2.key}`,
        storage: "r2",
      },
      201,
    );
  }

  if (mode === "drive") {
    const drive = await uploadToDrive(env, validated, date);
    if (!drive.ok) {
      return json(
        {
          error: "drive_failed",
          message: drive.error,
          storage: "drive",
        },
        502,
      );
    }
    return json(
      {
        key: `drive:${drive.id}`,
        size: validated.bytes.byteLength,
        type: validated.mime,
        drive,
        storage: "drive",
      },
      201,
    );
  }

  // both: R2 first, then Drive. Drive failure still returns R2 success.
  const r2 = await uploadToR2(env, validated, date);
  if (r2 instanceof Response) return r2;

  const drive = await uploadToDrive(env, validated, date);
  if (!drive.ok) {
    console.error("drive_partial_failure_after_r2", drive.error);
  }

  return json(
    {
      key: r2.key,
      size: validated.bytes.byteLength,
      type: validated.mime,
      "url-path": `/file/${r2.key}`,
      storage: "both",
      drive: drive.ok
        ? drive
        : { ok: false as const, error: drive.error },
    },
    201,
  );
}

async function handleList(request: Request, env: Env): Promise<Response> {
  const mode = storageMode(env);
  if (mode === "drive") {
    if (!env.DRIVE_SCRIPT_URL || !env.DRIVE_SHARED_SECRET) {
      return json(
        {
          error: "misconfigured",
          message: "DRIVE_SCRIPT_URL or DRIVE_SHARED_SECRET not configured.",
        },
        503,
      );
    }
    const url = new URL(request.url);
    const prefix = url.searchParams.get("prefix") || "";
    try {
      const res = await fetch(env.DRIVE_SCRIPT_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "list",
          prefix,
          secret: env.DRIVE_SHARED_SECRET,
        }),
      });
      const body = (await res.json()) as Record<string, unknown>;
      if (!res.ok || body.ok === false) {
        return json(
          {
            error: "drive_list_failed",
            message:
              typeof body.message === "string"
                ? body.message
                : typeof body.error === "string"
                  ? body.error
                  : `HTTP ${res.status}`,
          },
          502,
        );
      }
      return json({
        prefix,
        storage: "drive",
        truncated: false,
        objects: body.objects || [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "fetch failed";
      console.error("drive_list_failed", msg);
      return json({ error: "drive_list_failed", message: msg }, 502);
    }
  }

  if (!env.STILLS) {
    return json(
      { error: "misconfigured", message: "R2 binding STILLS is not available." },
      503,
    );
  }
  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") || "stills/";
  const listed = await env.STILLS.list({ prefix, limit: 1000 });
  return json({
    prefix,
    storage: mode,
    truncated: listed.truncated,
    objects: listed.objects.map((o) => ({
      key: o.key,
      size: o.size,
      uploaded: o.uploaded?.toISOString?.() ?? null,
      etag: o.etag,
    })),
  });
}

async function handleFile(request: Request, env: Env, key: string): Promise<Response> {
  const mode = storageMode(env);
  if (mode === "drive") {
    return json(
      {
        error: "not_implemented",
        message:
          "STORAGE=drive does not serve file bytes through this Worker. Open the Drive url from the upload response, or use STORAGE=both / STORAGE=r2 so /file reads from R2.",
      },
      501,
    );
  }
  if (!key || key.includes("..")) {
    return json({ error: "bad_request", message: "Invalid key." }, 400);
  }
  if (!env.STILLS) {
    return json(
      { error: "misconfigured", message: "R2 binding STILLS is not available." },
      503,
    );
  }
  const obj = await env.STILLS.get(key);
  if (!obj) {
    return json({ error: "not_found", message: "No object at that key." }, 404);
  }
  const headers = new Headers();
  headers.set("cache-control", "no-store");
  obj.writeHttpMetadata(headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/octet-stream");
  }
  headers.set("etag", obj.httpEtag);
  return new Response(obj.body, { status: 200, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "GET" && path === "/health") {
      return json({
        ok: true,
        storage: storageMode(env),
      });
    }

    const denied = requireAuth(request, env);
    if (denied) return denied;

    if (
      (request.method === "PUT" || request.method === "POST") &&
      path === "/upload"
    ) {
      return handleUpload(request, env);
    }

    if (request.method === "GET" && path === "/list") {
      return handleList(request, env);
    }

    if (request.method === "GET" && path.startsWith("/file/")) {
      const key = decodeURIComponent(path.slice("/file/".length));
      return handleFile(request, env, key);
    }

    return json({ error: "not_found", message: `No route for ${request.method} ${path}` }, 404);
  },
};
