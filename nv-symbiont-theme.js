/* nv-symbiont-theme.js — apply the IA Symbiont's color to the system.
   Reads localStorage 'nv_symbiont_base' ('hexa' / 'cyphr' / 'helix' /
   'warden') and sets data-symbiont on the root element, so
   nv-symbiont-theme.css recolors the containers, radio, and other
   system elements to the pick (Hexa cyan, Cyphr indigo, Helix pink,
   Warden green — added Nov 13, 2026, Phase 2). Listens for changes so
   the theme follows the pick live, across tabs. Defaults to Cyphr
   (the current indigo/purple look) when nothing is picked. */
(function () {
  function base() {
    try {
      var b = localStorage.getItem('nv_symbiont_base') || '';
      if (b === 'hexa' || b === 'cyphr' || b === 'helix' || b === 'warden') return b;
    } catch (e) {}
    return 'cyphr';
  }
  function apply() {
    document.documentElement.setAttribute('data-symbiont', base());
  }
  apply();
  /* Exposed so a picker on this page can recolor the system the
     moment the pick is made (the storage event only fires in other
     tabs, so the picker's own page needs a direct call). */
  window.NVSymbiontTheme = { apply: apply };
  window.addEventListener('storage', function (e) {
    if (e.key === 'nv_symbiont_base') apply();
  });
  /* The pick can change on this page (IA picker, Avatar Editor) —
     re-apply when the page regains focus, so the theme follows. */
  window.addEventListener('focus', apply);
})();

/* Shared symbiont chime — the Web Audio two-note chime (660 Hz then
   880 Hz, sine, short fade) that the IA pickers used to carry inline.
   The pick handlers in ia-symbiont/index.html and
   settings/avatar-editor/index.html delegate to this helper, and the
   roaming symbiont sprite (nv-sprite.js) plays it when touched, so
   the chime sounds any time the user touches their symbiont anywhere
   on the web. No audio file is involved. */
(function () {
  var chimeCtx = null;
  window.NVSymbiontChime = function () {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!chimeCtx) chimeCtx = new AC();
      if (chimeCtx.state === 'suspended') chimeCtx.resume();
      var t = chimeCtx.currentTime;
      [[660, 0], [880, 0.09]].forEach(function (n) {
        var o = chimeCtx.createOscillator(), g = chimeCtx.createGain();
        o.type = 'sine'; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t + n[1]);
        g.gain.exponentialRampToValueAtTime(0.12, t + n[1] + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + 0.35);
        o.connect(g); g.connect(chimeCtx.destination);
        o.start(t + n[1]); o.stop(t + n[1] + 0.4);
      });
    } catch (e) {}
  };
})();
