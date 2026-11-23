/* nv-shell.js — Infinity6Shell: the shared App Shell for the Neon Vigil web app.
   Infinity 6 Terminal / Hex OS. Audit fix, Nov 8, 2026.
   Static pages have no build step, so the shell is a module that pages include:
   nv-terminal-tokens.css + nv-ticker.css + nv-commands.css in <head>, and
   nv-ticker.js + nv-commands.js + this file before </body>. This module:
     1. makes sure the ticker (nv-ticker.js) and the palette (nv-commands.js)
        are loaded, using its own script URL as the base path;
     2. injects the standard bottom dock (Radio + Hexa/Commands button) when
        the page does not already have one — the hub has its own dock inline
        and does NOT include this file.
   The dock radio is the shared implementation: the same stations as
   the hub (Sound Beds 1–3, default Sound Bed 3, plus Atmospheric Haze —
   its audio file ships in /sounds), the same first-tap autoplay, and the same
   cookie-lock guard (no playback while body.cookie-locked). Hex OS port,
   Nov 22, 2026: the radio carries NO label text — at rest it is just the
   merged play/stop button and a small living wave (still when silent,
   moving when playing); the station list appears on hover/focus (the
   select stays as the fallback picker) and scrolling over the radio
   cycles stations. This module also injects the shared wireframe band
   (.nv-wireframe, styled in nv-terminal-tokens.css) — its own layer
   along the bottom of the screen, behind the dock. Safe to include
   once per page; a second include is a no-op. Exposes window.Infinity6Shell. */
(function () {
  if (window.__nvShellLoaded) return;
  window.__nvShellLoaded = true;

  /* Base path for the shared modules, derived from this script's own URL,
     so sub-pages (/nv808/, /gridlog/) resolve ../nv-ticker.js and
     ../nv-commands.js correctly without hardcoding a path per page. */
  var base = './';
  try {
    var src = (document.currentScript && document.currentScript.src) || '';
    if (src) base = src.slice(0, src.lastIndexOf('/') + 1);
  } catch (e) {}
  function ensureScript(url, flag) {
    if (flag && window[flag]) return;
    var s = document.createElement('script');
    s.src = url;
    document.head.appendChild(s);
  }

  var STATIONS = [
    '/sounds/neon-vigil-sound-bed-1-landing-workpage.wav',
    '/sounds/neon-vigil-sound-bed-2-practice-page.wav',
    '/sounds/neon-vigil-sound-bed-3-loop.wav',
    '/sounds/neon-vigil-theme-atmospheric-haze.mp3'
  ];
  var PLAY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
  var STOP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12"/></svg>';
  /* Hexa sigil / commands mark — the same mark as the hub's commands button. */
  var HEXA_SVG = '<svg width="28" height="28" viewBox="0 0 100 100" fill="none" stroke="#f5f0ff" stroke-width="3" aria-hidden="true"><circle cx="50" cy="50" r="10"/><circle cx="50" cy="50" r="26"/><circle cx="50" cy="50" r="42"/><ellipse cx="50" cy="50" rx="42" ry="16" transform="rotate(60 50 50)"/><ellipse cx="50" cy="50" rx="42" ry="16" transform="rotate(120 50 50)"/><circle cx="50" cy="8" r="4" fill="#f5f0ff" stroke="none"/><circle cx="86" cy="71" r="4" fill="#f5f0ff" stroke="none"/><circle cx="14" cy="71" r="4" fill="#f5f0ff" stroke="none"/><path d="M50 44v12M44 50h12" stroke-width="4"/></svg>';

  function locked() { return document.body.classList.contains('cookie-locked'); }

  function mountDock() {
    if (document.querySelector('.nv-shell-dock, .commands-footer')) return;
    var dock = document.createElement('div');
    dock.className = 'nv-shell-dock';
    dock.setAttribute('role', 'contentinfo');
    dock.innerHTML =
      '<span class="nv-shell-dock-cell"><span class="nv-shell-radio" id="nvShellRadio">' +
      '<button type="button" id="nvShellRadioBtn" class="nv-shell-radio-btn" aria-label="Play Sound Bed 3" title="Play Sound Bed 3">' + PLAY_SVG + '</button>' +
      '<span class="nv-radio-wave" id="nvShellWave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>' +
      '<select id="nvShellStationSelect" aria-label="Radio station">' +
      '<option value="0">Sound Bed 1</option>' +
      '<option value="1">Sound Bed 2</option>' +
      '<option value="2" selected>Sound Bed 3</option>' +
      '<option value="3">Atmospheric Haze</option>' +
      '</select></span></span>' +
      '<span class="nv-shell-dock-cell"><button type="button" id="nvShellCommandsBtn" class="nv-shell-commands-btn" aria-label="Commands" title="Commands (⌘K)">' + HEXA_SVG + '</button></span>';
    document.body.appendChild(dock);

    /* The dock's Commands button is wired directly to window.NVCommands.open()
       (the manual opener nv-commands.js exposes for triggers added later).
       It deliberately does NOT use data-nv-commands: nv-commands.js binds
       that attribute once at its own init, before this dock exists, and a
       second binding would toggle the palette twice (open then close). */
    var cmdBtn = document.getElementById('nvShellCommandsBtn');
    cmdBtn.addEventListener('click', function () {
      if (window.NVCommands) window.NVCommands.open();
    });

    var audio = document.createElement('audio');
    audio.id = 'nvShellRadioAudio';
    audio.src = STATIONS[2];
    audio.loop = true;
    audio.preload = 'none';
    document.body.appendChild(audio);

    var btn = document.getElementById('nvShellRadioBtn');
    var sel = document.getElementById('nvShellStationSelect');
    var wave = document.getElementById('nvShellWave');
    var radioWrap = document.getElementById('nvShellRadio');
    function stationName() { return sel.options[sel.selectedIndex].text; }
    function sync() {
      var playing = !audio.paused;
      btn.innerHTML = playing ? STOP_SVG : PLAY_SVG;
      btn.setAttribute('aria-label', (playing ? 'Stop ' : 'Play ') + stationName());
      btn.setAttribute('title', (playing ? 'Stop ' : 'Play ') + stationName());
      if (wave) wave.classList.toggle('playing', playing);
    }
    function setStation(idx) {
      var wasPlaying = !audio.paused;
      sel.value = String(idx);
      audio.src = STATIONS[Number(sel.value)];
      if (wasPlaying) play();
      sync();
    }
    /* Scroll over the radio cycles stations (Hex OS radio lock). */
    if (radioWrap) {
      radioWrap.addEventListener('wheel', function (e) {
        e.preventDefault();
        var dir = e.deltaY > 0 ? 1 : -1;
        var next = (Number(sel.value) + dir + STATIONS.length) % STATIONS.length;
        setStation(next);
      }, { passive: false });
    }
    function play() { if (locked()) return; audio.play().catch(function () {}); }
    function pause() { audio.pause(); }
    btn.addEventListener('click', function () {
      if (locked()) return;
      if (audio.paused) play(); else pause();
    });
    sel.addEventListener('change', function () {
      var wasPlaying = !audio.paused;
      audio.src = STATIONS[Number(sel.value)];
      if (wasPlaying) play();
      sync();
    });
    audio.addEventListener('play', sync);
    audio.addEventListener('pause', sync);
    function onFirstTap(e) {
      if (locked()) return;
      if (btn.contains(e.target)) return;
      play();
      document.removeEventListener('pointerdown', onFirstTap);
    }
    document.addEventListener('pointerdown', onFirstTap);
    sync();
  }

  function mountWireframe() {
    /* The wireframe band: its own layer along the bottom of the screen,
       behind the dock and the content (styled in nv-terminal-tokens.css).
       Never baked into any panel. */
    if (document.querySelector('.nv-wireframe')) return;
    var wf = document.createElement('div');
    wf.className = 'nv-wireframe';
    wf.setAttribute('aria-hidden', 'true');
    document.body.appendChild(wf);
  }


  /* Back control (Nov 22, 2026): one shared animated icon button —
     an exit / go-back sign pictogram (door outline + left arrow),
     no visible text; aria-label and title carry the name. Escape
     triggers this same action (see the keydown listener below):
     back and escape are one control. */
  var BACK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 3.5h7v17h-7"/><g class="nv-back-glyph-arrow"><path d="M16.5 12H4"/><path d="M9.5 5.5 3.5 12l6 6.5"/></g></svg>';

  function doGoBack() {
    guardBypassUnload = true;
    if (history.length > 1) { history.back(); }
    else { window.location.href = base + 'hub'; }
  }

  function goBack() {
    /* Unsaved-changes guard (Nov 22, 2026): on a page that
       registered a guard and has unsaved changes, Back (the
       button and Escape-as-back both route here) opens the
       guard popup instead of navigating. The pending back
       action runs only after Save succeeds or Exit is chosen. */
    if (!guardBypassUnload && guardIsActive()) { openGuard({ type: 'back' }); return; }
    doGoBack();
  }

  function mountBack() {
    if (document.querySelector('.nv-back-btn')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'nv-back-btn';
    b.setAttribute('aria-label', 'Back');
    b.setAttribute('title', 'Back (Esc)');
    b.innerHTML = BACK_SVG;
    b.addEventListener('click', goBack);
    document.body.appendChild(b);
  }

  /* Unsaved-changes guard (Nov 22, 2026): saving is a
     requirement on the save pages (Settings, Profile Editor).
     A page registers window.NVGuard.register({ isDirty, save,
     clearDirty }) — isDirty() reports unsaved changes, save()
     persists them (may return a promise; resolving false means
     failure), clearDirty() (optional) resets the page's own
     dirty state and is what NVGuard.markClean() calls.
     While dirty, the guard intercepts:
       (a) in-app anchor clicks (capture phase — palette links
           and the shell's own nav links included),
       (b) the shell's goBack() path (see goBack above),
       (c) window beforeunload — the browser's native prompt;
           its text is the browser's own and cannot be set.
     The popup offers Save (proceed only on success) and Exit
     (proceed without saving). Escape or a backdrop click is
     STAY: the popup closes and nothing navigates. */
  var GUARD_MSG = 'you have unsaved changes are you sure you want to exit page?';
  var guardReg = null;
  var guardOpen = false;
  var guardPending = null;
  var guardBypassUnload = false;
  var guardBackdrop = null, guardSaveBtn = null, guardExitBtn = null;

  function guardIsActive() {
    if (!guardReg || typeof guardReg.isDirty !== 'function') return false;
    try { return !!guardReg.isDirty(); } catch (e) { return false; }
  }

  function guardMarkClean() {
    if (guardReg && typeof guardReg.clearDirty === 'function') {
      try { guardReg.clearDirty(); } catch (e) {}
    }
  }

  window.NVGuard = {
    /* Registering is a fresh page saying "I have a save flow":
       it also clears any proceed-bypass left over from a prior
       navigation, so the new page's exits are guarded. */
    register: function (cfg) { guardReg = cfg || null; guardBypassUnload = false; },
    markClean: guardMarkClean,
    isDirty: guardIsActive
  };

  function mountGuard() {
    if (guardBackdrop || document.querySelector('.nv-guard-backdrop')) {
      guardBackdrop = guardBackdrop || document.querySelector('.nv-guard-backdrop');
      return;
    }
    var bd = document.createElement('div');
    bd.className = 'nv-guard-backdrop';
    bd.hidden = true;
    var panel = document.createElement('div');
    panel.className = 'nv-guard';
    panel.setAttribute('role', 'alertdialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Unsaved changes');
    var msg = document.createElement('p');
    msg.className = 'nv-guard-msg';
    msg.textContent = GUARD_MSG;
    var actions = document.createElement('div');
    actions.className = 'nv-guard-actions';
    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'nv-btn nv-guard-save';
    saveBtn.textContent = 'Save';
    var exitBtn = document.createElement('button');
    exitBtn.type = 'button';
    exitBtn.className = 'nv-btn nv-guard-exit';
    exitBtn.textContent = 'Exit';
    actions.appendChild(saveBtn);
    actions.appendChild(exitBtn);
    panel.appendChild(msg);
    panel.appendChild(actions);
    bd.appendChild(panel);
    document.body.appendChild(bd);
    guardBackdrop = bd;
    guardSaveBtn = saveBtn;
    guardExitBtn = exitBtn;
    bd.addEventListener('click', function (e) {
      /* Backdrop click = stay. Clicks inside the panel do nothing. */
      if (e.target === bd) closeGuard();
    });
    saveBtn.addEventListener('click', onGuardSave);
    exitBtn.addEventListener('click', function () { guardProceed(guardPending); });
  }

  function openGuard(action) {
    if (guardOpen) return;
    mountGuard();
    if (!guardBackdrop) return;
    guardPending = action || null;
    guardBackdrop.hidden = false;
    guardOpen = true;
    if (window.NVAnnounce) NVAnnounce(GUARD_MSG);
    if (guardSaveBtn) guardSaveBtn.focus();
  }

  function closeGuard() {
    if (guardBackdrop) guardBackdrop.hidden = true;
    guardOpen = false;
    guardPending = null;
    setGuardBusy(false);
  }

  function setGuardBusy(busy) {
    if (guardSaveBtn) guardSaveBtn.disabled = !!busy;
    if (guardExitBtn) guardExitBtn.disabled = !!busy;
  }

  function guardProceed(action) {
    var pending = action;
    /* The bypass is set BEFORE closeGuard/navigate and survives
       into the navigation, so beforeunload does not re-prompt
       for an exit the user already confirmed in the popup. */
    guardBypassUnload = true;
    closeGuard();
    guardBypassUnload = true;
    if (!pending) return;
    if (pending.type === 'href' && pending.href) { window.location.href = pending.href; }
    else if (pending.type === 'back') { doGoBack(); }
  }

  function failGuardSave() {
    closeGuard();
    if (window.NVToast) NVToast.error('Save failed — try again');
  }

  function onGuardSave() {
    if (!guardReg || typeof guardReg.save !== 'function') { guardProceed(guardPending); return; }
    setGuardBusy(true);
    var p;
    try { p = guardReg.save(); } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).then(function (res) {
      setGuardBusy(false);
      if (res === false) { failGuardSave(); return; }
      guardMarkClean();
      guardProceed(guardPending);
    }).catch(function () {
      setGuardBusy(false);
      failGuardSave();
    });
  }

  /* (a) In-app anchor interception, capture phase, so palette
     and shell nav links are caught before their own handlers.
     Ignored: modified clicks, new-tab/download anchors, external
     links, and same-page (hash-only) links — none of those leave
     the page. */
  document.addEventListener('click', function (e) {
    if (guardOpen) return;
    if (!guardIsActive()) return;
    if (e.defaultPrevented) return;
    if (typeof e.button === 'number' && e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var t = e.target, a = null;
    while (t && t !== document) {
      if (t.tagName === 'A') { a = t; break; }
      t = t.parentNode;
    }
    if (!a) return;
    if (guardBackdrop && guardBackdrop.contains(a)) return;
    if (!a.getAttribute('href')) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    var url;
    try { url = new URL(a.href, window.location.href); } catch (err) { return; }
    if (url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search) return;
    e.preventDefault();
    e.stopPropagation();
    openGuard({ type: 'href', href: url.href });
  }, true);

  /* (c) Tab close / refresh: the native beforeunload prompt.
     Its text is the browser's — the custom sentence can only
     appear in the in-app popup above. Proceeding from the popup
     (Save or Exit) sets the bypass so the user is not prompted
     twice for the same exit. */
  window.addEventListener('beforeunload', function (e) {
    if (guardBypassUnload) return;
    if (!guardIsActive()) return;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });

  /* Toasts (Nov 22, 2026): shared save/confirmation feedback.
     window.NVToast.show(msg) — the message is set via textContent,
     never innerHTML. */
  function mountToastRegion() {
    if (document.querySelector('.nv-toast-region')) return;
    var r = document.createElement('div');
    r.className = 'nv-toast-region';
    r.setAttribute('role', 'status');
    r.setAttribute('aria-live', 'polite');
    document.body.appendChild(r);
  }

  function spawnToast(msg, extraClass) {
    var region = document.querySelector('.nv-toast-region');
    if (!region) return;
    var t = document.createElement('div');
    t.className = 'nv-toast' + (extraClass ? ' ' + extraClass : '');
    t.textContent = msg;
    region.appendChild(t);
    setTimeout(function () {
      t.classList.add('leaving');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 350);
    }, 2600);
  }

  window.NVToast = {
    show: function (msg) { spawnToast(msg, ''); },
    /* Error states (Nov 22, 2026): the failure variant — the red
       .nv-toast-error pill, and the message is also announced to
       screen readers via NVAnnounce (which itself respects the
       nv_a11y_announce preference). */
    error: function (msg) {
      spawnToast(msg, 'nv-toast-error');
      if (window.NVAnnounce) window.NVAnnounce(msg);
    }
  };


  /* Screen-reader status (Nov 22, 2026): a visually hidden live
     region + window.NVAnnounce(msg). The region text is cleared
     and re-set after 30ms so repeated messages still announce.
     Gated by the Options-page preference nv_a11y_announce
     ('off' silences announcements; anything else is on). */
  function mountSrStatus() {
    if (document.getElementById('nvSrStatus')) return;
    var r = document.createElement('div');
    r.id = 'nvSrStatus';
    r.className = 'nv-sr-only';
    r.setAttribute('role', 'status');
    r.setAttribute('aria-live', 'polite');
    document.body.appendChild(r);
  }

  window.NVAnnounce = function (msg) {
    try { if (localStorage.getItem('nv_a11y_announce') === 'off') return; } catch (e) {}
    var r = document.getElementById('nvSrStatus');
    if (!r) return;
    r.textContent = '';
    setTimeout(function () { r.textContent = msg; }, 30);
  };

  /* Accessibility preferences (Nov 22, 2026): read the Options
     page's localStorage keys and stamp the non-default choices on
     <html>, where the tokens CSS picks them up. Defaults ('auto',
     announcements on) set no attribute. */
  function applyA11yPrefs() {
    var h = document.documentElement;
    function pref(key) { try { return localStorage.getItem(key) || ''; } catch (e) { return ''; } }
    /* Nov 22, 2026 (options popup): a pref that is off / back at its
       default now REMOVES its attribute too, so a change made in the
       options popup applies immediately in both directions instead
       of only on the next page load. Stored-pref behaviour at init
       is unchanged. */
    if (pref('nv_a11y_motion') === 'reduce') h.setAttribute('data-a11y-motion', 'reduce');
    else h.removeAttribute('data-a11y-motion');
    if (pref('nv_a11y_contrast') === 'high') h.setAttribute('data-a11y-contrast', 'high');
    else h.removeAttribute('data-a11y-contrast');
    if (pref('nv_a11y_text') === 'large') h.setAttribute('data-a11y-text', 'large');
    else h.removeAttribute('data-a11y-text');
    if (pref('nv_a11y_bg') === 'calm') h.setAttribute('data-a11y-bg', 'calm');
    else h.removeAttribute('data-a11y-bg');
  }

  /* Options popup (Nov 22, 2026): the ≡ button, fixed top-right —
     the back button's twin — opens a page-relative options panel
     on EVERY shell page (full and back-only alike). Contents:
       - the page's own options, when the page registers any
         (window.NV_PAGE_OPTIONS before the shell loads, or
         NVOptions.register(items) after it);
       - the shared set: the five accessibility toggles, same
         localStorage keys and semantics as the Options page,
         applied at once through applyA11yPrefs() + the toast;
       - a footer link to the full Options page.
     A page with nothing page-specific shows the shared set only,
     with a quiet "Nothing extra on this page." line. The popup is
     a settings surface only — errors and confirmations never
     appear in it (they go inline / by toast). */
  var A11Y_TOGGLES = [
    { label: 'Reduce motion', key: 'nv_a11y_motion', on: 'reduce', off: 'auto', defOn: false, pageId: 'a11yMotion' },
    { label: 'High contrast', key: 'nv_a11y_contrast', on: 'high', off: 'auto', defOn: false, pageId: 'a11yContrast' },
    { label: 'Large text', key: 'nv_a11y_text', on: 'large', off: 'auto', defOn: false, pageId: 'a11yText' },
    { label: 'Calm background', key: 'nv_a11y_bg', on: 'calm', off: 'auto', defOn: false, pageId: 'a11yBg' },
    { label: 'Screen reader announcements', key: 'nv_a11y_announce', on: 'on', off: 'off', defOn: true, pageId: 'a11yAnnounce' }
  ];
  var optBtn = null, optPop = null, optOpen = false;
  var pageOptions = (window.NV_PAGE_OPTIONS && window.NV_PAGE_OPTIONS.length) ? window.NV_PAGE_OPTIONS.slice() : [];

  /* The .nv-switch component styles live in nv-toggle.css; most
     shell pages never include it, so the shell loads it (once)
     rather than redefining the switch here. */
  function ensureStyle(url) {
    if (document.querySelector('link[href$="nv-toggle.css"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = url;
    document.head.appendChild(l);
  }

  function pageName() {
    var n = '';
    try { n = document.documentElement.getAttribute('data-nv-page-name') || ''; } catch (e) {}
    if (!n && document.body) { try { n = document.body.getAttribute('data-nv-page-name') || ''; } catch (e) {} }
    if (!n && document.title) {
      n = document.title.replace(/\s+[—-]\s+(Infinity6 Terminal|Neon Vigil).*$/, '').trim();
    }
    if (!n) {
      var seg = window.location.pathname.split('/').filter(Boolean).pop() || 'hub';
      n = seg.replace(/\.html$/, '').replace(/[-_]/g, ' ');
    }
    return n;
  }

  function storedIsOn(key, onValue, defOn) {
    var stored = null;
    try { stored = localStorage.getItem(key); } catch (e) {}
    if (stored !== null) return stored === String(onValue);
    return !!defOn;
  }

  function makeSwitchRow(label, isOn, onToggle) {
    var row = document.createElement('div');
    row.className = 'nv-opt-row';
    var lab = document.createElement('span');
    lab.className = 'nv-opt-label';
    lab.textContent = label;
    var sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'nv-switch';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', isOn ? 'true' : 'false');
    sw.setAttribute('aria-label', label);
    sw.innerHTML = '<span class="nv-switch-knob"></span>';
    sw.addEventListener('click', function () {
      var on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', on ? 'true' : 'false');
      onToggle(on);
    });
    row.appendChild(lab);
    row.appendChild(sw);
    return row;
  }

  /* If the page itself renders the same accessibility switch (the
     Options page does, with these element ids), keep it in sync so
     the two surfaces never disagree. */
  function syncPageA11ySwitch(cfg, on) {
    if (!cfg.pageId) return;
    var b = document.getElementById(cfg.pageId);
    if (b && b.classList.contains('nv-switch')) {
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      var lab = document.getElementById(cfg.pageId + 'Label');
      if (lab) lab.classList.toggle('nv-switch-row-off', !on);
    }
  }

  function onA11yToggle(cfg, on) {
    try { localStorage.setItem(cfg.key, on ? cfg.on : cfg.off); } catch (e) {}
    applyA11yPrefs();
    syncPageA11ySwitch(cfg, on);
    if (window.NVToast) NVToast.show('Saved');
  }

  function pageToggleIsOn(item) {
    if (typeof item.default === 'boolean') {
      return storedIsOn(item.key, item.on, item.default);
    }
    if (item.default != null) {
      return storedIsOn(item.key, item.on, String(item.default) === String(item.on));
    }
    return storedIsOn(item.key, item.on, false);
  }

  function firePageCallback(item, on) {
    var cb = item.onChange, fn = null;
    if (typeof cb === 'function') fn = cb;
    else if (typeof cb === 'string' && typeof window[cb] === 'function') fn = window[cb];
    if (fn) { try { fn(on, item); } catch (e) {} }
  }

  function renderPageItem(item) {
    if (!item) return document.createElement('div');
    if (item.type === 'link') {
      var a = document.createElement('a');
      a.className = 'nv-opt-link';
      a.textContent = item.label || '';
      var href = typeof item.href === 'string' ? item.href : '#';
      if (/^\s*(javascript|data):/i.test(href)) href = '#';
      a.href = href;
      a.addEventListener('click', function () { closeOptions(); });
      return a;
    }
    /* Default shape: a localStorage-backed toggle. */
    return makeSwitchRow(item.label || '', pageToggleIsOn(item), function (on) {
      try { localStorage.setItem(item.key, on ? item.on : item.off); } catch (e) {}
      firePageCallback(item, on);
    });
  }

  function renderOptions() {
    if (!optPop) return;
    optPop.innerHTML = '';
    var name = pageName();

    var heading = document.createElement('div');
    heading.className = 'nv-opt-heading';
    var title = document.createElement('span');
    title.className = 'nv-opt-title';
    title.textContent = 'Options';
    var head = document.createElement('span');
    head.className = 'nv-opt-head';
    head.textContent = name;
    heading.appendChild(title);
    heading.appendChild(head);
    optPop.appendChild(heading);

    var pageHead = document.createElement('div');
    pageHead.className = 'nv-opt-subhead';
    pageHead.textContent = name;
    optPop.appendChild(pageHead);
    if (pageOptions.length) {
      pageOptions.forEach(function (item) { optPop.appendChild(renderPageItem(item)); });
    } else {
      var empty = document.createElement('div');
      empty.className = 'nv-opt-empty';
      empty.textContent = 'Nothing extra on this page.';
      optPop.appendChild(empty);
    }

    var sharedHead = document.createElement('div');
    sharedHead.className = 'nv-opt-subhead';
    sharedHead.textContent = 'Shared';
    optPop.appendChild(sharedHead);
    A11Y_TOGGLES.forEach(function (cfg) {
      optPop.appendChild(makeSwitchRow(cfg.label, storedIsOn(cfg.key, cfg.on, cfg.defOn), function (on) {
        onA11yToggle(cfg, on);
      }));
    });

    var foot = document.createElement('div');
    foot.className = 'nv-opt-foot';
    var all = document.createElement('a');
    all.className = 'nv-opt-link';
    all.textContent = 'All options';
    all.href = base + 'options';
    foot.appendChild(all);
    optPop.appendChild(foot);
  }

  function openOptions() {
    if (!optPop) mountOptions();
    if (!optPop) return;
    renderOptions();
    optPop.hidden = false;
    optOpen = true;
    if (optBtn) optBtn.setAttribute('aria-expanded', 'true');
  }

  function closeOptions() {
    if (!optPop) return;
    optPop.hidden = true;
    optOpen = false;
    if (optBtn) optBtn.setAttribute('aria-expanded', 'false');
  }

  function registerPageOptions(items) {
    if (!items) return;
    if (Object.prototype.toString.call(items) === '[object Array]') pageOptions = pageOptions.concat(items);
    else pageOptions.push(items);
    window.NV_PAGE_OPTIONS = pageOptions;
    if (optOpen) renderOptions();
  }

  window.NVOptions = { open: openOptions, close: closeOptions, register: registerPageOptions };

  function mountOptions() {
    if (document.querySelector('.nv-opt-btn')) {
      optBtn = document.querySelector('.nv-opt-btn');
      optPop = document.querySelector('.nv-opt-pop');
      return;
    }
    ensureStyle(base + 'nv-toggle.css');
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'nv-opt-btn';
    b.setAttribute('aria-label', 'Options');
    b.setAttribute('title', 'Options');
    b.setAttribute('aria-haspopup', 'true');
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', 'nvOptionsPop');
    b.innerHTML = '<span class="nv-opt-lines" aria-hidden="true"><i></i><i></i><i></i></span>';
    b.addEventListener('click', function () {
      if (optOpen) closeOptions(); else openOptions();
    });
    document.body.appendChild(b);
    var p = document.createElement('div');
    p.className = 'nv-opt-pop';
    p.id = 'nvOptionsPop';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'Options');
    p.hidden = true;
    document.body.appendChild(p);
    optBtn = b;
    optPop = p;
    renderOptions();
  }

  /* Click-outside closes the popup. Clicks on the button itself
     are left to the button's own toggle handler. */
  document.addEventListener('pointerdown', function (e) {
    if (!optOpen || !optPop) return;
    if (optPop.contains(e.target) || (optBtn && optBtn.contains(e.target))) return;
    closeOptions();
  });

  /* Escape = back, one control (Nov 22, 2026). Bubble phase.
     Layers that own Escape themselves win first: the Commands
     palette (nv-commands.js closes it — its open marker is the
     .open class on the .palette-overlay element), any visible
     backdrop/modal layer (the page's own handler closes it), and
     NV-808, where Escape means stop playback. With focus in a
     text field, Escape just leaves the field. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var overlay = document.querySelector('.palette-overlay');
    if (overlay && overlay.classList.contains('open')) return;
    /* The unsaved-changes guard owns Escape while it is open:
       Esc = STAY (close the popup, no navigation). This sits
       after the palette check — the palette is the top layer
       and closes first — and before the options popup and the
       backdrop scan below (the guard's own backdrop would
       otherwise make the scan yield without closing it). */
    if (guardOpen) { closeGuard(); return; }
    /* The options popup owns Escape while it is open: Esc closes
       the popup ONLY and never falls through to back. This check
       sits after the palette check (the palette is the top layer,
       z-index 10, and closes itself) and before the backdrop scan
       and goBack() below. */
    if (optOpen) { closeOptions(); return; }
    var layers = document.querySelectorAll('[class*="backdrop"]');
    for (var i = 0; i < layers.length; i++) {
      var el = layers[i];
      if (el.hidden) continue;
      var cs = window.getComputedStyle ? getComputedStyle(el) : null;
      if (cs && cs.display === 'none') continue;
      /* offsetParent is null for position:fixed layers (e.g. the
         Avatar Editor's .palette-backdrop), so a visible fixed
         layer counts as open too. */
      if (el.offsetParent !== null || (cs && cs.position === 'fixed')) return;
    }
    if (window.location.pathname.indexOf('nv808') !== -1) return;
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) { a.blur(); return; }
    goBack();
  });

  function init() {
    /* Ticker + palette are shared modules; load them if the page did not
       include them directly (the shell still works if they are present).
       Phase 1 (Nov 13, 2026): pages with data-nv-no-ticker on <html>
       (the Gigas Garden game frame; My Room) get NO ticker — this module
       does not load nv-ticker.js there at all, and nv-ticker.js itself
       also refuses to render on those routes. The element is removed,
       never created — not hidden, and no replacement strip is added.
       The dock and the palette still load as normal. */
    if (!document.documentElement.hasAttribute('data-nv-no-ticker')) {
      ensureScript(base + 'nv-ticker.js', '__nvTickerLoaded');
    }
    ensureScript(base + 'nv-commands.js', '__nvCommandsLoaded');
    applyA11yPrefs();
    mountWireframe();
    mountDock();
    mountBack();
    mountOptions();
    mountGuard();
    mountToastRegion();
    mountSrStatus();
  }

  /* Back-only mode (Nov 22, 2026): pages that are not full shell
     pages (Options, Privacy, Terms, Avatar Editor) set
     data-nv-shell="back-only" on <html> and get just the back
     control, the options popup and the toast region — no ticker,
     palette, dock or wireframe. */
  function initBackOnly() {
    applyA11yPrefs();
    mountBack();
    mountOptions();
    mountGuard();
    mountToastRegion();
    mountSrStatus();
  }

  window.Infinity6Shell = { mountDock: mountDock, mountWireframe: mountWireframe, mountBack: mountBack, goBack: goBack, mountToastRegion: mountToastRegion, toast: window.NVToast, mountSrStatus: mountSrStatus, announce: window.NVAnnounce, applyA11yPrefs: applyA11yPrefs, mountOptions: mountOptions, options: window.NVOptions, mountGuard: mountGuard, guard: window.NVGuard };
  var startShell = document.documentElement.getAttribute('data-nv-shell') === 'back-only' ? initBackOnly : init;
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', startShell); }
  else { startShell(); }
})();
