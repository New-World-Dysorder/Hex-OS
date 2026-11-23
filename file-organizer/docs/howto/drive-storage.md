# How-to: Save Indigo stills to Drive as well as R2

Plain-language steps for Jasmine. Status as of Nov 8, 2026 (America/Los_Angeles).

## 1. What changed and why

The upload Worker can now save each still in **two places at once**:

1. **Cloudflare R2** (bucket `nv-stills`) — same as today
2. **Google Drive** — a new **Stills** folder in your WebApp shared drive

Mode name: `STORAGE=both` (the intended mode). The old `r2` and `drive` modes still work.

Behaviour for `both`:

1. Write to R2 first
2. Then write to Drive
3. If Drive fails, the upload still **succeeds** for R2, and the JSON reply includes a `drive` error field (no secrets in logs)
4. `/list` and `/file` still read from R2

**Nothing was redeployed.** The live Worker at `https://nv-file-organizer.bookings-8be.workers.dev` is still R2-only until you say to switch.

## 2. Where things live on Cyphr's computer

Folder: `/workspace/nv-file-organizer/`

| Path | Role |
|------|------|
| `src/index.ts` | Worker (modes `r2`, `drive`, `both`) |
| `apps-script/Code.gs` | Google Apps Script that writes into Drive |
| `wrangler.jsonc` | Config; intended `STORAGE=both` (live still `r2` until you OK a switch) |
| `secrets/drive-shared-secret` | Shared secret for Worker ↔ Apps Script (mode 600, **never** shown in chat) |
| `secrets/upload-key` | Indigo's upload Bearer key (already there) |
| `docs/howto/drive-storage.md` | This guide |
| `scripts/mock-drive-script.mjs` | Local fake Apps Script for tests |
| `scripts/run-local-tests.sh` | R2 local suite |
| `scripts/run-drive-tests.sh` | Drive/both local suite |

## 3. Drive folder that was set up

- Shared drive display name (from the Nov 2026 map): **`<NV/D//:> WebApp//Neon Vigil Oauth`** (short name: **WebApp**)
- Shared drive root id: `0APDocXd3NxWxUk9PVA`
- **Stills** folder (created at the top level of that drive):
  - id: `1vIxTpii9DSgq_kRc2ntYbomXFQs_Zrjh`
  - link: https://drive.google.com/drive/folders/1vIxTpii9DSgq_kRc2ntYbomXFQs_Zrjh

Uploads land in dated subfolders: `Stills / YYYY-MM-DD / filename`. Same-name uploads get a `-2`, `-3`, … suffix (never overwrite).

## 4. Size limits (plain English)

- The Worker still refuses anything over **25 MB**.
- Drive goes through a Google Apps Script web app. Google's request ceiling is about **50 MB**. Images are sent as base64 text, which is about one-third larger, so **25 MB of image stays under that ceiling**.
- If a still ever fails on the Drive side only, it will still be in R2.

## 5. What you do once (create the Apps Script)

About 5 minutes of clicking in your Google account. Cyphr cannot do this for you.

### Step A — New project

1. Open [https://script.google.com](https://script.google.com) while signed in as the account that can write to the WebApp drive (usually `bookings@jasmineinfiniti.com`).
2. Click **New project**.
3. Name it something clear, e.g. **NV Stills Drive Writer**.
4. Delete any sample code in `Code.gs`.
5. Open `/workspace/nv-file-organizer/apps-script/Code.gs` on Cyphr's computer (or ask Cyphr to paste it into a chat message as a file). Copy the whole file into the Apps Script editor. Save (disk icon / Ctrl+S).

### Step B — Script properties (the folder id and the secret)

1. In the Apps Script editor, open **Project Settings** (gear on the left).
2. Scroll to **Script properties** → **Add script property**.
3. Add two properties (names exact):

| Property | Value |
|----------|-------|
| `STILLS_FOLDER_ID` | `1vIxTpii9DSgq_kRc2ntYbomXFQs_Zrjh` |
| `SHARED_SECRET` | the contents of Cyphr's file `secrets/drive-shared-secret` (ask Cyphr to show it only on her computer screen, never in chat) |

4. Save the properties.

### Step C — Deploy as web app

1. Click **Deploy** → **New deployment**.
2. Click the gear next to **Select type** → choose **Web app**.
3. Settings:
   - **Description:** `nv-stills-drive-writer`
   - **Execute as:** **Me** (your account)
   - **Who has access:** **Anyone** (the shared secret still protects it; Google "Anyone" here means the URL can be called without a Google login, which the Worker needs)
4. Click **Deploy**. Approve any permission prompts (Drive access).
5. Copy the **Web app URL** (looks like `https://script.google.com/macros/s/…/exec`). Send that URL to Cyphr in chat (the URL alone is fine; it is not the secret).

## 6. What Cyphr does after you send the web app URL (only when you say so)

Still **no deploy** until you say the word (e.g. **switch to both** or **deploy drive**).

Then Cyphr will:

1. Put the web app URL into the Worker as `DRIVE_SCRIPT_URL` (Worker secret / var).
2. Put the shared secret into the Worker as `DRIVE_SHARED_SECRET` (from `secrets/drive-shared-secret`, never printed).
3. Set `STORAGE=both` on the live Worker.
4. Redeploy the Worker script only (no DNS, no new routes).
5. Smoke-test `/health`, one tiny PNG upload, and check that the file appears in both R2 and the Drive **Stills** folder.

## 7. How to test on phone and desktop

1. Phone or desktop browser: open `https://nv-file-organizer.bookings-8be.workers.dev/health` — should show `"ok":true` and `"storage":"both"` after the switch.
2. From a terminal (key in the env, not typed into chat), upload one tiny PNG the same way Indigo already does.
3. Open the **Stills** folder link above on phone and on desktop. You should see a dated subfolder with the image.
4. Optional: open Cloudflare R2 → bucket `nv-stills` → same date path under `stills/`.

## 8. How to undo

Pick one:

1. **Back to R2 only:** set live `STORAGE=r2` and redeploy (or remove the Drive secrets). Uploads stop going to Drive; existing Drive files stay.
2. **Turn off the Apps Script:** in script.google.com → **Deploy** → **Manage deployments** → archive/delete the web app deployment. Drive writes will fail; with `STORAGE=both`, R2 uploads still succeed and the reply shows a Drive error field.
3. **Full take-down of the Worker:** see `docs/howto/upload-worker.md` section 8 (delete Worker + empty/delete R2 bucket). Does not delete the Drive **Stills** folder unless you trash it yourself.

## 9. Local checks Cyphr already ran

- Existing R2 curl suite (`scripts/run-local-tests.sh`) kept green.
- Mock Apps Script (`scripts/mock-drive-script.mjs`) used for both-mode success and Drive-failure partial success.
- No live Worker change, no secret printed.
