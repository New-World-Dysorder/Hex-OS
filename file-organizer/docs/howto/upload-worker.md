# How-to: Indigo stills upload Worker (nv-file-organizer)

Plain-language steps for Jasmine. Status as of Nov 8, 2026 (America/Los_Angeles).

## 1. What this is

A small Cloudflare Worker that lets Prof. Indigo send stills (images) into a private storage bucket. It is a drop box, not the full Drive/GitHub filing organizer from the Nov 4 plan. The organizer can be added later on the same Worker.

- Worker name: `nv-file-organizer`
- Planned live URL: `https://nv-file-organizer.bookings-8be.workers.dev`
- Optional custom host `files.neonvigil.app` needs a **separate** OK (that would add a DNS record). Not included in the first deploy.

## 2. What lives on Cyphr's computer

Folder: `/workspace/nv-file-organizer/`

| File | Role |
|------|------|
| `src/index.ts` | Worker code |
| `wrangler.jsonc` | Config (`workers_dev: true`, R2 binding `STILLS` → bucket `nv-stills`, no routes) |
| `.dev.vars` | Local throwaway test key only (gitignored, never committed) |
| `.dev.vars.example` | Template for local secrets |
| `scripts/indigo-upload.sh` | Curl helper; reads key from `NV_UPLOAD_KEY` |
| `scripts/run-local-tests.sh` | Local curl test suite |
| `scripts/make-tiny-png.mjs` | Builds a tiny test PNG (no canon images) |
| `README.md` | Short technical overview |
| `docs/howto/upload-worker.md` | This guide |

Nothing has been deployed. No R2 bucket exists yet. No secret has been put on Cloudflare.

## 3. How it was tested (local only)

Cyphr ran `wrangler dev --local` (Miniflare simulates R2 on the box) and the curl suite. Expected checks:

1. `/health` → 200 `{ok:true}`
2. Upload a real tiny PNG with the test key → 201
3. Upload with no key → 401
4. Upload with wrong key → 401
5. Upload a text file → 415
6. Upload a fake `.png` with wrong magic bytes → 415
7. Upload over 25 MB → 413
8. `/list` with key → 200 and at least one object
9. `/file/<key>` with key → 200 image bytes
10. Second upload with the same filename → new key with a suffix (no overwrite)

See the report Cyphr posted in chat for pass/fail of each.

## 4. What you do to go live

Only when you are ready. Say the word **deploy** after step 2.

### Step 1 — Enable R2 (your Cloudflare dashboard)

1. Open [https://dash.cloudflare.com](https://dash.cloudflare.com) and pick the account that holds neonvigil.app (bookings / `bookings-8be`).
2. Go to **R2** and turn it on / accept the free tier if asked.
3. You do **not** need to create the bucket by hand. Cyphr will create `nv-stills` with Wrangler after you say deploy.

### Step 2 — Sign in on Cyphr's computer

On Cyphr's desktop / terminal (she will walk you):

```bash
cd /workspace/nv-file-organizer
npx wrangler login
```

Complete the browser login. This is a one-time OAuth sign-in. You never paste a password into chat.

### Step 3 — Say **deploy**

Then Cyphr runs, in order (and only then):

1. `npx wrangler r2 bucket create nv-stills`
2. Generate an upload key into a local file only, e.g. `/workspace/nv-file-organizer/secrets/upload-key` (directory gitignored). The key is **never** printed in chat.
3. `npx wrangler secret put UPLOAD_KEY < secrets/upload-key` (or the stdin form Wrangler documents — key stays out of argv/logs/chat)
4. `npx wrangler deploy`

Resulting URL:

`https://nv-file-organizer.bookings-8be.workers.dev`

Cyphr gives Indigo the URL and the key through a private channel (not this chat body if avoidable). Indigo uploads with:

```bash
NV_UPLOAD_KEY='…' BASE_URL=https://nv-file-organizer.bookings-8be.workers.dev \
  ./scripts/indigo-upload.sh ./some-still.png
```

### Step 4 — Quick smoke test (phone or desktop)

1. Open `https://nv-file-organizer.bookings-8be.workers.dev/health` in a browser. You should see `{"ok":true}`.
2. From a terminal with the key in the env (not typed into chat), upload one tiny PNG and confirm a 201 JSON reply with a `key`.

## 5. How to undo

```bash
cd /workspace/nv-file-organizer
npx wrangler delete
npx wrangler r2 bucket delete nv-stills
```

(Deleting the bucket needs it empty first — remove objects in the R2 dashboard or with `wrangler r2 object delete`.)

Also revoke/rotate the upload key if it was shared.

## 6. Optional later: `files.neonvigil.app`

Pointing a custom hostname at this Worker needs a DNS record on neonvigil.app. That is a **separate** decision. Do not do it as part of the first deploy unless you explicitly OK the DNS change.

## 7. Drive dual-save

Built locally (not live yet). See `docs/howto/drive-storage.md`. Intended mode is `STORAGE=both` (R2 + Drive). Live Worker stays on `STORAGE=r2` until you say to switch.

## 8. Deployed via API connector (Nov 8, 2026, America/Los_Angeles)

Live deploy used the connected Cloudflare MCP `execute` tool against account `8be22c83eb83bf0ffab1a418c72acc4b` (workers.dev subdomain `bookings-8be`), because Wrangler OAuth login fails for Jasmine. No routes or DNS were touched.

What ran, in order:

1. Created R2 bucket `nv-stills` (`POST /accounts/.../r2/buckets`).
2. Bundled locally with `npx wrangler deploy --dry-run --outdir /tmp/nvfo-dist` (no auth).
3. Uploaded script `nv-file-organizer` (`PUT .../workers/scripts/nv-file-organizer` multipart) with bindings `STILLS` → `nv-stills` (R2) and `STORAGE=r2` (plain text).
4. Enabled workers.dev (`POST .../workers/scripts/nv-file-organizer/subdomain` `{enabled:true}`).
5. Generated `UPLOAD_KEY` into `/workspace/nv-file-organizer/secrets/upload-key` (mode 600, never printed) and set it as a Worker secret (`PUT .../secrets`).
6. Verified `GET /health` → 200, upload with key → 201, no/wrong key → 401, `GET /list` shows the object.

Live URL: `https://nv-file-organizer.bookings-8be.workers.dev`

### Undo (API or dashboard)

- Delete the Worker script: dashboard Workers & Pages → `nv-file-organizer` → Delete, or `DELETE /accounts/.../workers/scripts/nv-file-organizer`.
- Empty then delete the R2 bucket `nv-stills` in the R2 dashboard (or API). Bucket must be empty first.
- Rotate/revoke the local key file and any copy shared with Indigo.
