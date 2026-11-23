// ui-moments.js — Neon Vigil UI Moments behaviour (Hex OS core set)
// Adapted from UI Moments by @guanmo_ai (MIT) — see THIRD_PARTY_NOTICES.md.
// Safe on any page: every hook is guarded, nothing here blocks content.
(function () {
  'use strict';

  // Boot loader (Infinity Square Snake): hide on load, with a failsafe so
  // the overlay can never trap the page.
  var bootHidden = false;
  function hideBoot() {
    if (bootHidden) return;
    bootHidden = true;
    var boot = document.getElementById('umBoot');
    if (!boot) return;
    boot.classList.add('um-done');
    setTimeout(function () { boot.style.display = 'none'; }, 500);
  }
  window.addEventListener('load', hideBoot);
  setTimeout(hideBoot, 4000);

  // Sigil login wait (Pulse Rings): auth.js writes "Sending you to GitHub…"
  // / "Sending you to Google…" into #status while the OAuth redirect is in
  // flight — that is the wait these rings dress. Errors clear them.
  var sigilWait = document.getElementById('umSigilWait');
  var status = document.getElementById('status');
  function reflectStatus() {
    if (!sigilWait || !status) return;
    var t = status.textContent || '';
    if (/Sending you to/i.test(t)) sigilWait.classList.add('um-on');
    else sigilWait.classList.remove('um-on');
  }
  if (sigilWait && status && 'MutationObserver' in window) {
    new MutationObserver(reflectStatus).observe(status, { childList: true, characterData: true, subtree: true });
    reflectStatus();
  }
  window.NVMoments = {
    sigilWait: function (on) { if (sigilWait) sigilWait.classList.toggle('um-on', !!on); },
    hideBoot: hideBoot
  };

  // Tap feedback (Ripple) for anything carrying [data-um-ripple].
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-um-ripple]') : null;
    if (!el) return;
    var r = el.getBoundingClientRect();
    var d = Math.max(r.width, r.height);
    var s = document.createElement('span');
    s.className = 'um-rip';
    s.style.width = s.style.height = d + 'px';
    s.style.left = (e.clientX - r.left - d / 2) + 'px';
    s.style.top = (e.clientY - r.top - d / 2) + 'px';
    el.appendChild(s);
    setTimeout(function () { s.remove(); }, 650);
  });
})();
