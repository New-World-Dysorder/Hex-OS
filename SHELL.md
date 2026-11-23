# Infinity6Shell — shared App Shell (audit fix, Nov 8, 2026)

**Hex OS port, Nov 22, 2026** (Base44 hub prototype → live code, User's go): ONE typeface everywhere — the clean system monospace stack (`ui-monospace, Menlo, monospace`); the old pixel display font is retired on every surface. Ground is the near-black #050508 family; panels/cards are glass (translucent fill + top sheen, never flat matte behind text); buttons are bubbled pills (gloss, glowing accent outline, translucent fill, opaque text). Sigil tokens: Hexa cyan #22d3ee, Cyphr indigo #6366f1 (default before a pick), Helix pink #f471b5, Warden green. A shared wireframe band (.nv-wireframe) runs along the bottom of shell pages, and the shared UI Moments loaders (snake / rings / shimmer / cascade) live in nv-terminal-tokens.css. The sprite materializes from particles at a fixed spawn spot and moves per base (SWEEP / PROWL / DART / STRIDE); it is not loaded on the Game page, NV-TV, or the Options page.

The Neon Vigil web app is static HTML — no build step — so the shell is three
shared files plus a module. Every signed-in page wires into the same shell:

**Include (in `<head>`):**
```html
<link rel="stylesheet" href="./nv-terminal-tokens.css">
<link rel="stylesheet" href="./nv-ticker.css">
<link rel="stylesheet" href="./nv-commands.css">
```
**Include (before `</body>`):**
```html
<script src="./nv-ticker.js"></script>
<script src="./nv-commands.js"></script>
<script src="./nv-shell.js"></script>
```
From a sub-folder (`/nv808/`, `/gridlog/`, …) use `../` in place of
`./`. Add `class="nv-shell-page"` to `<body>` so the fixed ticker (top) and
the fixed dock (bottom) never cover page content. The hub does **not** use
`.nv-shell-page` and does **not** include `nv-shell.js` — its dock is inline
and its centred `.hub-col` already accounts for ticker + dock.

**What each file does:**
- `nv-terminal-tokens.css` — design tokens (near-black #050508 ground,
  glass panels + sheen, sigil accents, the system monospace stack, 1px
  borders) + the shell header wrapper (`.nv-shell-head`), the bottom
  Radio/Hexa dock (`.nv-shell-dock`), the display-name field + buttons
  (`#nameInput`, `#saveNameBtn`, …), the wireframe band (`.nv-wireframe`),
  the radio wave (`.nv-radio-wave`), and the shared loaders
  (`.nv-loader-snake` / `-rings` / `-shimmer` / `-cascade`) and pill
  button (`.nv-btn`) / glass panel (`.nv-glass`) classes.
- `nv-ticker.js` + `nv-ticker.css` — the shared top telemetry ticker:
  time + date in numbers only, location, Open-Meteo weather. 10px in the
  system monospace stack (Nov 8, 2026, Jasmine's order — really small,
  supersedes the 14px from the Nov 8 hub cleanup). Content per the
  Nov 20, 2026 lock (carried by the Nov 22, 2026 port): NO tide item, no
  labels, no STANDBY/placeholder filler — an item with no data shows
  nothing; items are separated by a horizontal line (an em dash). It sits
  still until location resolves, then scrolls seamlessly; the loop seam
  ends each copy with the same delimiter so the repeat never reads
  back-to-back.
- `nv-commands.js` + `nv-commands.css` — the shared Cmd/Ctrl+K palette.
  Labels (locked): `iKG://GigasGarden.Construct` (Jasmine's Nov 15 rename — the IKG, Intergalactic Kyber Grid; was `Virtual IWW: Gigas Garden`, Nov 7),
  `NV_Gigas Garden — Remix`, `NV_808`, `NV_Gridlog`, `NV-TV`, `Settings`,
  `Sign out`, plus `Avatar Editor` and `NV_Pet Pal` (added by this audit fix).
- `nv-shell.js` (`window.Infinity6Shell`) — injects the standard bottom dock
  (Radio: Sound Beds 1–3, default Bed 3, + Atmospheric Haze; no label
  text — merged play/stop + living wave at rest, station list on
  hover/focus, scroll cycles stations; + Hexa/Commands button)
  when the page has no dock, injects the wireframe band, and loads the
  ticker/palette modules if a page forgot them. The dock radio is the
  shared implementation — same stations, same first-tap autoplay, same
  cookie-lock guard as the hub.

**Routes (all same-origin, shell-preserving — nothing leaves the app shell
except through a wrapper page):**
- `/gigas-garden/` — shell wrapper; the game loads in a full-viewport iframe
  from `xer0yootz.github.io/neon-vigil-oauth/gigas-garden/` (GitHub Pages
  allows framing). Fallback link on the page if the frame cannot load.
- `/remix/` — shell wrapper; the Remix game loads in an iframe from
  `remix.gg/g/neon-vigil-gigas-garden`. **Framing by remix.gg is unverified**
  — if it blocks framing the page shows the shell + an "Open in Remix"
  link. Needs a live rendered check.
- `/gridlog/` — the Grid Log: the same five creature entries as the in-game
  log (`GRID_CREATURES`). Praxia is shown (unlocked by default in-game);
  the other four show `UNSYNCED SIGNAL` until synced in the Garden, exactly
  like the in-game modal. Syncing happens in the Garden — link on the page.
- `/settings.html#avatar-editor` — the Avatar Editor section in Settings
  (test editor copy, Nov 8). Moved out of the standalone `/aniimo/` page per
  Jasmine's Nov 8 order ("not Aniimo — just Avatar Editor, with profile
  creation and profile editing, in Settings"). The editor's GLBs and vendor
  Three.js still live in `/aniimo/assets/` (paths only — no user-facing
  "Aniimo" remains there); `/aniimo/` itself is now a redirect to the
  Settings section.
- `/nv808/` — NV_808 (ticker + standard dock added; its own lone ⌘K button
  and Sound Bed 3 button were replaced by the shell dock).
- `/test-web-bible-neon-ultra` — Bible character-sheets test page (shell
  header wrapper + ticker + standard dock added).
- `/nv-tv.html` — NV-TV (shell header wrapper + ticker + standard dock
  added; still the blank water + static page — the fuller ts-space NV TV
  app is a separate port decision, not part of this fix).
- `/hub.html` — hub (terminal + palette routes updated to the
  shell-preserving destinations; greeting heading — "Greetings User" by
  default, "Greetings \<username\>" when a username is saved — inside the
  terminal box per the Nov 8 order, typed by the typewriter on load and
  re-typed when the saved username arrives; "Infinity 6 Terminal" small at
  the bottom of the box, clean system monospace 13px; no display-name input or Save
  button on the hub — name editing lives in Settings only. A screenshot
  taken in the first ~0.4s can catch the greeting mid-type — that is the
  "truncation" the audit saw, not a layout clip: no width/overflow rule
  truncates it).
- `/settings.html`, `/options.html` — name field styled to the shell;
  nav routes updated to the shell-preserving destinations.

**Not wired:** the main page (`/index.html`, the sign-in / coming-soon gate)
is excepted from the ticker lock and keeps its own "Hub Status" bar.
`/settings.html` and `/options.html` keep their `User:` label (the Nov 8
removal was hub-only) — flag if Jasmine wants it gone there too.

**Deploy (from Jasmine's Mac terminal only — never from here):**
```bash
cd <NV- repo>
git checkout audit-fixes-2026-11-08
git status            # review the branch diff first
git push -u origin audit-fixes-2026-11-08
# then merge to main (GitHub web UI or: git checkout main && git merge audit-fixes-2026-11-08 && git push)
# Cloudflare Pages redeploys from main automatically; verify live afterwards.
```
