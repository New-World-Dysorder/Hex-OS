# How-to: File organizer in the NV- repo

Plain-language steps for Jasmine. Status as of Nov 9, 2026 (America/Los_Angeles). Cyphr is she/her.

## 1. What was added and why

Cyphr copied the NV file organizer build into this hub repo so you can review it and push through GitHub in one place. It sits in its own folder and does not change the hub pages.

Folder: `file-organizer/`

| Path | Role |
|------|------|
| `file-organizer/src/index.ts` | Cloudflare Worker (R2, Drive, or both) |
| `file-organizer/apps-script/Code.gs` | Google Apps Script that writes into Drive |
| `file-organizer/wrangler.jsonc` | Worker config (intended `STORAGE=both`; live is still R2-only) |
| `file-organizer/drive-config.json` | WebApp drive and Stills folder ids (not secrets) |
| `file-organizer/docs/howto/upload-worker.md` | Original R2 go-live guide |
| `file-organizer/docs/howto/drive-storage.md` | Drive / both guide |
| `file-organizer/docs/howto/file-organizer-in-repo.md` | This guide |
| `file-organizer/scripts/` | Local test and upload helpers (text only) |
| `file-organizer/README.md` | Short technical overview |

**Left out on purpose:** `secrets/`, `.dev.vars`, `node_modules/`, `.wrangler/`, `dist/`, and any PNG/GLB. Binaries only reach a repo through your GitHub web upload. To rebuild the tiny test PNG on Cyphr's computer: `node file-organizer/scripts/make-tiny-png.mjs`.

## 2. Merging does not change the live Worker

The live drop box is still:

`https://nv-file-organizer.bookings-8be.workers.dev`

It is deployed separately with Wrangler. It is still **Cloudflare R2 only** until you finish the Google script steps in `drive-storage.md` and say **switch to both**. Merging this PR only stores the source in GitHub. It does not redeploy, does not touch DNS, and does not change neonvigil.app pages other than making these source files available as static files after merge (see section 3).

## 3. Public folder note (Cloudflare Pages)

neonvigil.app is served by Cloudflare Pages from this repo's `main` branch. The project looks like a flat static site (HTML/JS/CSS at the repo root, no separate build output folder found). After a merge, files under `file-organizer/` would normally be reachable at URLs like:

`https://neonvigil.app/file-organizer/README.md`

No secrets are in that folder, so the risk is low. If you want to block public access later, a simple option is a root `_redirects` rule that returns 404 for that path, for example:

```txt
/file-organizer/*  /404  404
```

Cyphr did **not** add that rule in this PR. Say the word if you want a follow-up PR that only adds it.

## 4. How to check (phone and desktop)

1. Open this pull request on GitHub and look at the **Files changed** tab. You should see only new files under `file-organizer/`, no hub page edits.
2. Confirm there is no `secrets/` folder and no PNG/GLB under `file-organizer/`.
3. After you merge (only when you say), the live Worker health check is still at `https://nv-file-organizer.bookings-8be.workers.dev/health` and should keep showing R2-only until you switch.
4. Optional after merge: open `https://neonvigil.app/file-organizer/README.md` on phone and desktop to see whether Pages is serving the folder.

## 5. How to undo

1. Before merge: close the pull request on GitHub. Nothing live changes.
2. After merge: open the merged pull request and press GitHub's **Revert** button, then merge the revert when you are ready. That removes `file-organizer/` from `main` on the next Pages publish.
3. The live Worker is separate. Taking the folder out of the repo does not take the Worker down. To take the Worker down, delete `nv-file-organizer` under Workers in the Cloudflare dashboard (and optionally the `nv-stills` R2 bucket).
