# nv-file-organizer

Cloudflare Worker drop box for **Prof. Indigo stills**.

- Images only: PNG, JPEG, WEBP, GIF, AVIF (magic-byte checked)
- Auth: `Authorization: Bearer <UPLOAD_KEY>`
- Storage modes (`STORAGE` var):
  - `r2` — R2 bucket `nv-stills` only
  - `drive` — Google Drive only (via Apps Script web app)
  - `both` — **intended mode**: write R2 first, then Drive; Drive failure still returns R2 success with a `drive` error field
- `/list` and `/file` read from R2 when mode is `r2` or `both`. In `drive` mode, `/list` proxies the Apps Script; `/file` returns 501 (use the Drive URL from the upload reply).

**Do not deploy or change live secrets without Jasmine's explicit word.**

Live (as of last deploy): `https://nv-file-organizer.bookings-8be.workers.dev` — still `STORAGE=r2` until she OKs the switch to `both`.

## Endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/health` | no | `{ok:true, storage}` |
| POST/PUT | `/upload` | yes | multipart field `file`, or raw body with `?name=` |
| GET | `/list?prefix=` | yes | list keys (R2) or Drive list when `drive` |
| GET | `/file/<key>` | yes | fetch R2 object (`r2` / `both` only) |

R2 keys look like `stills/YYYY-MM-DD/<name>`. Drive files land under the **Stills** folder in dated subfolders. Existing names get a `-2`, `-3`, … suffix (never overwrite).

## Local run

```bash
cp .dev.vars.example .dev.vars   # already present for local tests
npm install
npm run dev                      # wrangler dev --local on :8787
npm run test:local               # R2 suite in another terminal
```

Drive/both local tests (mock Apps Script on :8790):

```bash
MOCK_SECRET='local-drive-shared-secret-not-for-production' node scripts/mock-drive-script.mjs
# point .dev.vars STORAGE=both, DRIVE_SCRIPT_URL=http://127.0.0.1:18790/, DRIVE_SHARED_SECRET=…
npm run test:drive
```

## Drive dual-save (Jasmine)

See `docs/howto/drive-storage.md`. Short version:

1. Stills folder already created in the WebApp shared drive.
2. You deploy `apps-script/Code.gs` once from script.google.com and set Script Properties.
3. Send Cyphr the web app URL.
4. Say **switch to both** — Cyphr sets secrets + `STORAGE=both` and redeploys (no DNS).

## Layout

- `src/index.ts` — Worker
- `apps-script/Code.gs` — Drive writer
- `wrangler.jsonc` — name `nv-file-organizer`, `workers_dev: true`, no routes
- `scripts/` — upload helper, local suites, mock Drive script
- `docs/howto/upload-worker.md` — original R2 go-live guide
- `docs/howto/drive-storage.md` — Drive / both guide


## In this repo

This folder lives at `file-organizer/` inside the NV- hub repo so Jasmine can review and push through GitHub. Merging it does **not** change the live Worker — that is deployed separately with Wrangler to `https://nv-file-organizer.bookings-8be.workers.dev`.

**Not committed here (on purpose):**

- `secrets/` — upload key and Drive shared secret stay only on Cyphr's computer
- `.dev.vars` — local throwaway keys
- `node_modules/`, `.wrangler/`, `dist/`
- `fixtures/tiny.png` — binaries only reach repos via Jasmine's GitHub web upload. Regenerate locally with:

```bash
node scripts/make-tiny-png.mjs
```

That writes `fixtures/tiny.png` for the local curl suite. Do not commit the PNG.
