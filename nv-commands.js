/* nv-commands.js — Shared Commands popup (Cmd+K) for the Neon Vigil web app.
   Infinity 6 Terminal / Hex OS. One module, included on hub, Settings, NV-808,
   and Grid Log. Replaces the hub's old inline palette with the same behaviour:
   Cmd/Ctrl+K opens it, type to filter, arrows + Enter to run, Esc or clicking
   the overlay closes it. A page-changing pick plays the select sound once
   (Mouse Click 1, volume 0.5) with a 200ms delay so the click is heard
   before the page changes.
   This module creates its own DOM — pages only include the CSS + this file.
   Any element with a data-nv-commands attribute opens the popup on click.
   Safe to include once per page; a second include is a no-op. */
(function () {
  if (window.__nvCommandsLoaded) return;
  window.__nvCommandsLoaded = true;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  /* Select sound (Mouse Click 1): absolute path so it works from any page. */
  var selectAudio = new Audio('/sounds/neon-vigil-mouse-click-1.wav');
  selectAudio.volume = 0.5;
  function playSelect() { try { selectAudio.currentTime = 0; var p = selectAudio.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }

  function doSignOut() {
    if (typeof window.signOut === 'function') { window.signOut(); }
    else { location.href = '/index.html'; }
  }

  var paletteCommands = [
    // Renamed Nov 15, 2026 by Jasmine: "iKG://GigasGarden.Construct" — the IKG (Intergalactic Kyber Grid); before that "Virtual IWW: Gigas Garden" (Nov 7 placeholder).
    // Audit fix Nov 8, 2026: game links stay inside the app shell — the
    // palette routes to the same-origin shell wrappers (/gigas-garden/,
    // instead of leaving neonvigil.app, and NV_Gridlog routes to
    // the real Grid Log page (/gridlog/) instead of the Bible test page.
    // Avatar Editor lives at /settings/avatar-editor/ (Nov 9, 2026).
    { name: 'iKG://GigasGarden.Construct', hint: 'Game', keys: 'ikg iww gigasgarden construct gigas garden game play', run: function () { location.href = '/gigas-garden/'; } },
    { name: 'Avatar Editor', hint: 'Avatar', keys: 'avatar editor editing', run: function () { location.href = '/settings/avatar-editor/'; } },
    { name: 'Profile', hint: 'Your profile', keys: 'profile my profile', run: function () { location.href = '/profile/'; } },
    { name: 'IA Symbiont', hint: 'Companion', keys: 'ia symbiont hexa cyphr helix pet pal baby pigek companion', run: function () { location.href = '/ia-symbiont/'; } },
    { name: 'NV_808', hint: 'NV-808', keys: 'nv_808 nv-808 nv808 drum machine', run: function () { location.href = '/nv808/'; } },
    { name: 'NV_Gridlog', hint: 'Gridlog', keys: 'nv_gridlog gridlog grid log creatures', run: function () { location.href = '/gridlog/'; } },
    { name: 'NV-TV', hint: 'Watch', keys: 'nv-tv nvtv tv watch episodes series', run: function () { location.href = '/nv-tv.html'; } },
    { name: 'Settings', hint: 'Profile', keys: 'settings profile picture username symbiont hexa cyphr change name delete name', run: function () { location.href = '/settings.html'; } },
    { name: 'Sign out', hint: 'Account', keys: 'sign out log out exit', run: function () { doSignOut(); } }
  ];

  var paletteOpen = false, paletteSel = 0, paletteFiltered = paletteCommands.slice();
  var overlay, input, list;

  function renderPalette() {
    var q = input.value.trim().toLowerCase();
    var words = q ? q.split(/\s+/) : [];
    paletteFiltered = paletteCommands.filter(function (c) {
      var hay = (c.name + ' ' + c.keys).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    });
    if (paletteSel >= paletteFiltered.length) paletteSel = Math.max(0, paletteFiltered.length - 1);
    list.innerHTML = paletteFiltered.map(function (c, i) {
      return '<li class="palette-item' + (i === paletteSel ? ' selected' : '') + '" data-i="' + i + '">' + esc(c.name) + '<span class="hint">' + esc(c.hint) + '</span></li>';
    }).join('') || '<li class="palette-item">No command found</li>';
    list.querySelectorAll('.palette-item[data-i]').forEach(function (el) {
      el.addEventListener('click', function () { runPalette(Number(el.getAttribute('data-i'))); });
    });
  }
  function openPalette() { paletteOpen = true; paletteSel = 0; overlay.classList.add('open'); input.value = ''; renderPalette(); input.focus(); }
  function closePalette() { paletteOpen = false; overlay.classList.remove('open'); }
  /* A palette choice changes the page (every entry navigates, except Sign out
     which ends the session), so the select sound plays once. */
  function runPalette(i) { var c = paletteFiltered[i]; if (!c) return; closePalette(); playSelect(); setTimeout(function () { c.run(); }, 200); }
  function togglePalette() { if (paletteOpen) closePalette(); else openPalette(); }

  function init() {
    overlay = document.createElement('div');
    overlay.className = 'palette-overlay';
    overlay.id = 'paletteOverlay';
    overlay.innerHTML = '<div class="palette"><input id="paletteInput" placeholder="Type a command…" autocomplete="off" aria-label="Commands"><ul class="palette-list" id="paletteList"></ul></div>';
    document.body.appendChild(overlay);
    input = document.getElementById('paletteInput');
    list = document.getElementById('paletteList');

    input.addEventListener('input', function () { paletteSel = 0; renderPalette(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); paletteSel = Math.min(paletteFiltered.length - 1, paletteSel + 1); renderPalette(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); paletteSel = Math.max(0, paletteSel - 1); renderPalette(); }
      else if (e.key === 'Enter') { e.preventDefault(); runPalette(paletteSel); }
      else if (e.key === 'Escape') { closePalette(); }
    });
    overlay.addEventListener('click', function (e) { if (e.target === this) closePalette(); });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); togglePalette(); }
      else if (e.key === 'Escape' && paletteOpen) { closePalette(); }
    });
    document.querySelectorAll('[data-nv-commands]').forEach(function (el) {
      el.addEventListener('click', togglePalette);
    });
    /* Expose a manual opener for pages that add a trigger later. */
    window.NVCommands = { open: openPalette, close: closePalette, toggle: togglePalette };
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }
})();
