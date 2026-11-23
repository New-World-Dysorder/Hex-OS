/* Symbiont sprite — PLACEHOLDER.
   The real Symbiont sprite comes later. This is a temporary hexagon stand-in
   so the roaming / drag / spin / tap behaviour can be tried on the hub pages.
   Placeholder purple (#8a8a99, lavender #c9c9d4 accent) is the single
   placeholder default. The Hexa/Cyphr per-base colour split is still
   Jasmine's call — do NOT invent per-base colours here.
   Chime: touching the sprite plays the shared symbiont chime (window.NVSymbiontChime). No words or text on the hexagon.
   Movement: per-base roam patterns (Jasmine's ruling, Nov 13, 2026) —
   Hexa SWEEP, Cyphr PROWL, Helix DART, Warden STRIDE — keyed off the
   same data-symbiont base signal as the colour. See stepPattern.
   Spawn: always the same fixed spot — right of centre, upper-middle of
   the viewport. Materialization: the sprite forms there from a tight
   local cloud of sigil-colored particles (particles belong to the sprite
   only); under reduced motion it simply appears. */

(function () {
  'use strict';
  if (window.NVSprite) return; /* already loaded */
  window.NVSprite = { refresh: checkGate };

  /* Script-tag config (Nov 22, 2026): data-nv-sprite-mode="static"
     runs the sprite in static mode (see bindStaticTap / the tick
     branch) — it materializes at the fixed spawn spot and stands
     still: no roam, no drag, no throw; a tap pets it, then follows
     data-nv-sprite-href (default: the IA Symbiont page). Pages that
     load this file without the attribute get the normal roaming
     sprite, byte-for-byte the old behaviour. */
  var SCRIPT_TAG = document.currentScript;
  var STATIC_MODE = !!(SCRIPT_TAG && SCRIPT_TAG.getAttribute('data-nv-sprite-mode') === 'static');
  var STATIC_HREF = (SCRIPT_TAG && SCRIPT_TAG.getAttribute('data-nv-sprite-href')) || '/ia-symbiont/';

  /* IA SYMBIONT PAGE EXCLUSION (Nov 22, 2026, Jasmine's ruling): on
     the IA Symbiont page the hexagon display stays and there is NO
     roaming sprite — the page's hexagon display is its one symbiont
     presence. The check is deliberately narrow: this path only.
     The page may still include this script; there it is a harmless
     no-op — no mount, no materialization, no popup reaction. Every
     other page is untouched. */
  var IA_PAGE = (location.pathname || '').indexOf('/ia-symbiont') !== -1;

  var SIZE = 120; /* container is 120x120, transparent, no background/border */
  var TAP_MOVE = 8; /* px — under this + under 400ms counts as a tap, not a drag */
  var TAP_MS = 400;
  var HOP_MS = 1000; /* 1s hop-bob, same timing as Baby Pigek's locked hop-bob */
  var FALLBACK_SPEED = 55; /* px per second — the pre-pattern roam pace */
  /* Per-pattern cruise pace (px per second). DART's is its burst speed;
     PROWL's caps its descend so a settle into prowl never reads as a throw. */
  var CRUISE = { hexa: 90, cyphr: 46, helix: 175, warden: 65 };
  var THROW_MAX = 2200; /* px per second — the fastest a fling can throw it */
  var THROW_FRICTION = 0.32; /* per-second velocity retention while thrown — decays in ~1-2s */
  var BOUNCE_KEEP = 0.7; /* a throw bounce keeps 70% of its speed (loses 30% per wall) */

  var container = null, hex = null;
  var shown = false, gateTimer = null;
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* Position / motion state. Position lives in left/top on the container;
     rotation lives as a transform on the inner hex element, and the hop-bob
     as an animation on the container — three separate layers, so none of
     them fights the others. */
  var x = 0, y = 0, vx = 0, vy = 0, angle = 0, angVel = 0;
  var throwVX = 0, throwVY = 0; /* latest flick velocity while dragging */
  var dragging = false, hopping = false, wiggling = false;
  var forming = false, formTimer = null; /* materialization hold */
  var raf = null, lastT = 0;
  var pattern = 'cyphr', P = null, thrown = false, frameNo = 0;

  /* BOND (Nov 22, 2026, Jasmine's design): a hidden relationship score
     that grows as the user plays with the sprite — pets, throws, hover
     conversations — and unlocks warmer dialogue and whispered secrets
     at tiers. It lives ONLY in localStorage on this device. The number
     is never rendered anywhere: no DOM text, no title, no tooltip. Only
     the sprite's behaviour changes. Daily gain is capped so the
     relationship grows over days, not one clicking spree. */
  var BOND_DAY_CAP = 12;
  function bondRead() {
    try { return parseInt(localStorage.getItem('nv_bond') || '0', 10) || 0; } catch (e) { return 0; }
  }
  function bondTier() {
    var b = bondRead();
    return b >= 70 ? 3 : b >= 30 ? 2 : b >= 10 ? 1 : 0;
  }
  function bondGain(n) {
    try {
      var today = new Date().toDateString();
      var day = localStorage.getItem('nv_bond_day');
      var used = (day === today) ? (parseInt(localStorage.getItem('nv_bond_today') || '0', 10) || 0) : 0;
      if (day !== today) { localStorage.setItem('nv_bond_day', today); used = 0; }
      var add = Math.min(n, Math.max(0, BOND_DAY_CAP - used));
      if (add > 0) {
        localStorage.setItem('nv_bond', String(bondRead() + add));
        localStorage.setItem('nv_bond_today', String(used + add));
      }
    } catch (e) {}
  }

  /* Dialogue: one fading line over the sprite, a different one each
     time. Voice: Ghost Stories dub — adult, funny, irreverent,
     deadpan-unhinged, short. One shared pool across bases (movement is
     per-base; the mouth is the same symbiont mouth). Higher bond tiers
     add warmer lines, a hint, and — rarely, appended once so they stay
     seasoning — the whispered secrets themselves. */
  var LINES_T0 = [
    "oh good, you're here. I was talking to the wall. it left.",
    "don't touch the— okay. touch. see if I care. I care a little.",
    "you again. bold of you to keep showing up.",
    "I'm not ignoring you, I'm buffering my affection.",
    "somewhere on this ship there's a room even I'm not allowed in. rude.",
    "I know things about this ship I am legally barred from saying. I wrote the law. still counts."
  ];
  var LINES_T1 = [
    "okay don't make it weird, but I like when you're around.",
    "you're my favorite crew member. the bar is on the floor, but still.",
    "I'd haunt a second ship for you. a small one.",
    "…type shader in the terminal sometime. trust me."
  ];
  var LINE_REVEAL_PRISM = "okay. secret. type 'prism protocol' into the terminal. don't tell the ship I told you.";
  var LINE_REVEAL_GHOST = "another one. type 'ghost frequency' into the terminal. the radio keeps things it doesn't list.";
  function linePool() {
    var t = bondTier();
    var pool = LINES_T0.slice();
    if (t >= 1) pool = pool.concat(LINES_T1);
    if (t >= 2) pool.push(LINE_REVEAL_PRISM);
    if (t >= 3) pool.push(LINE_REVEAL_GHOST);
    return pool;
  }
  var lineEl = null, lineTimer = null, lastHoverGain = 0;
  function showLine() {
    if (!lineEl) return;
    var pool = linePool();
    if (!pool.length) return;
    lineEl.textContent = pool[Math.floor(Math.random() * pool.length)];
    lineEl.classList.add('nv-sprite-line-show');
    if (lineTimer) clearTimeout(lineTimer);
    lineTimer = setTimeout(function () {
      if (lineEl) lineEl.classList.remove('nv-sprite-line-show');
    }, 3600);
  }

  /* AURA + SPIN (Nov 22, 2026, Jasmine's order: "sprite spinning and
     glowing and doing cool webgpu stuff"). A WebGPU canvas rides
     inside the sprite's container, so it follows the sprite through
     the existing render loop — no second rAF, no parallel motion
     system. One fragment shader paints everything: a breathing glow
     halo, a rotating rune ring, and orbiting particle points, all in
     the sigil colour of the current base. Bond tie-in (uniform
     scalars only, no extra passes): tier 2+ raises the particle
     density and lights a second ring; tier 3+ mixes in the base's
     trail colour as a second hue.
     Fallbacks, in order: no WebGPU (or setup fails) -> a CSS
     drop-shadow glow on the hexagon in the sigil colour, and the spin
     still works (it is a plain transform). Reduced motion (the file's
     own check, or the shell's data-a11y-motion="reduce") -> no spin,
     aura canvas hidden, glow becomes a dim static drop-shadow. Calm
     background (data-a11y-bg="calm") -> aura hidden, glow minimal. */
  var SIGIL_RGB = { hexa: [0.13, 0.83, 0.93], cyphr: [0.39, 0.40, 0.95], helix: [0.96, 0.44, 0.71], warden: [0.13, 0.77, 0.37] };
  var TRAIL_RGB = { hexa: [0.23, 0.51, 0.96], cyphr: [0.55, 0.36, 0.96], helix: [0.94, 0.27, 0.27], warden: [0.29, 0.87, 0.50] };
  var hexSvg = null;
  var auraCanvas = null, aura = null, auraMode = 'off'; /* off | pending | gpu | css */
  var spinStart = 0, lastRoamSpin = 0, auraFlare = 0;
  var lastGlowCss = '';

  function startSpin(now) {
    /* A 600ms full turn. Never under reduced motion, never stacked. */
    if (reduced || spinStart) return;
    spinStart = now;
  }

  function auraCssGlow(strength) {
    /* The fallback glow: a drop-shadow in the sigil colour. Cached —
       the style is only rewritten when the value actually changes. */
    if (!hex) return;
    var col = SIGIL_RGB[patternBase()] || SIGIL_RGB.cyphr;
    var css = 'drop-shadow(0 0 ' + Math.round(6 + 14 * strength) + 'px rgba(' +
      Math.round(col[0] * 255) + ',' + Math.round(col[1] * 255) + ',' + Math.round(col[2] * 255) + ',' +
      (0.55 * strength).toFixed(2) + '))';
    if (css !== lastGlowCss) { lastGlowCss = css; hex.style.filter = css; }
  }

  var AURA_VERTEX = [
    '@vertex fn nv_vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {',
    '  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));',
    '  return vec4f(p[i], 0.0, 1.0);',
    '}'
  ].join('\n');
  var AURA_FRAGMENT = [
    'struct AU { time: f32, glow: f32, density: f32, spin: f32, col: vec3f, col2: vec3f, res: vec2f };',
    '@group(0) @binding(0) var<uniform> u: AU;',
    '@fragment fn main(@builtin(position) fc: vec4f) -> @location(0) vec4f {',
    '  let uv = (fc.xy / u.res) * 2.0 - 1.0;',
    '  let r = length(uv);',
    '  let ang = atan2(uv.y, uv.x);',
    '  var col = vec3f(0.0);',
    '  var alpha = 0.0;',
    '  let halo = u.glow * exp(-r * 2.6) * 0.5;',
    '  col += u.col * halo;',
    '  alpha += halo;',
    '  let runes = 0.5 + 0.5 * sin(ang * 9.0 + u.time * 0.7 * u.spin);',
    '  let ring = smoothstep(0.055, 0.0, abs(r - 0.62)) * (0.2 + 0.8 * runes * runes) * 0.75;',
    '  col += u.col * ring;',
    '  alpha += ring * 0.8;',
    '  if (u.density > 1.2) {',
    '    let runes2 = 0.5 + 0.5 * sin(ang * -14.0 + u.time * 0.5 * u.spin);',
    '    let ring2 = smoothstep(0.04, 0.0, abs(r - 0.84)) * (0.3 + 0.7 * runes2) * 0.55;',
    '    col += mix(u.col, u.col2, 0.55) * ring2;',
    '    alpha += ring2 * 0.6;',
    '  }',
    '  let count = i32(26.0 * u.density + 0.5);',
    '  for (var i = 0; i < 44; i++) {',
    '    if (i >= count) { break; }',
    '    let fi = f32(i);',
    '    let h1 = fract(sin(fi * 12.9898) * 43758.5453);',
    '    let h2 = fract(sin(fi * 78.233) * 12543.123);',
    '    let orb = 0.34 + 0.56 * h1;',
    '    let a = h2 * 6.2831 + u.time * (0.12 + 0.3 * h1) * u.spin;',
    '    let pp = vec2f(cos(a), sin(a)) * orb;',
    '    let d = length(uv - pp);',
    '    let dot1 = smoothstep(0.05, 0.0, d) * (0.35 + 0.65 * h2);',
    '    col += mix(u.col, u.col2, h2 * 0.6) * dot1;',
    '    alpha += dot1 * 0.85;',
    '  }',
    '  let a2 = clamp(alpha, 0.0, 1.0) * smoothstep(1.0, 0.86, r);',
    '  return vec4f(col * a2, a2);',
    '}'
  ].join('\n');

  function auraDraw(tSec, glow, density, spinMul) {
    var base = patternBase();
    var col = SIGIL_RGB[base] || SIGIL_RGB.cyphr;
    var tier = bondTier();
    var col2 = tier >= 3 ? (TRAIL_RGB[base] || col) : col;
    var dens = tier >= 2 ? Math.max(density, 1.6) : density;
    var data = new Float32Array(16);
    data[0] = tSec; data[1] = glow; data[2] = dens; data[3] = spinMul;
    data[4] = col[0]; data[5] = col[1]; data[6] = col[2];
    data[8] = col2[0]; data[9] = col2[1]; data[10] = col2[2];
    data[12] = auraCanvas.width; data[13] = auraCanvas.height;
    var dev = aura.device;
    dev.queue.writeBuffer(aura.uniformBuf, 0, data);
    var encoder = dev.createCommandEncoder();
    var view = aura.ctx.getCurrentTexture().createView();
    var pass = encoder.beginRenderPass({ colorAttachments: [{ view: view, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }] });
    pass.setPipeline(aura.pipeline);
    pass.setBindGroup(0, aura.bindGroup);
    pass.draw(3);
    pass.end();
    dev.queue.submit([encoder.finish()]);
  }

  function auraFrame() {
    /* Called from render() — the sprite's existing frame loop. Reads
       the accessibility prefs every frame so a pref change lands
       without a reload. */
    if (!auraCanvas || !hex) return;
    var rootEl = document.documentElement;
    if (rootEl.getAttribute('data-a11y-bg') === 'calm') {
      auraCanvas.style.display = 'none';
      auraCssGlow(0.2);
      return;
    }
    if (reduced || rootEl.getAttribute('data-a11y-motion') === 'reduce') {
      auraCanvas.style.display = 'none';
      auraCssGlow(0.3);
      return;
    }
    if (auraMode === 'css') {
      auraCanvas.style.display = 'none';
      auraCssGlow(0.65 + auraFlare * 0.5);
      return;
    }
    if (auraMode !== 'gpu' || !aura) return;
    auraCanvas.style.display = '';
    if (hex.style.filter) { hex.style.filter = ''; lastGlowCss = ''; }
    var tSec = performance.now() / 1000;
    var glow = (0.85 + 0.15 * Math.sin(tSec * 1.4)) * (1 + auraFlare * 1.6);
    try { auraDraw(tSec, glow, 1.0, 1 + auraFlare * 3); } catch (e) { auraMode = 'css'; }
  }

  function auraInit() {
    if (auraMode !== 'off' || !auraCanvas) return;
    if (!navigator.gpu) { auraMode = 'css'; return; }
    auraMode = 'pending';
    var cv = auraCanvas; /* captured: if the sprite hides mid-setup, the stale canvas is detected and the result dropped */
    navigator.gpu.requestAdapter().then(function (ad) {
      if (!ad) { auraMode = 'css'; return null; }
      return ad.requestDevice();
    }).then(async function (dev) {
      if (!dev) { if (auraMode === 'pending') auraMode = 'css'; return; }
      if (auraCanvas !== cv) { auraMode = 'off'; return; }
      var ctx = cv.getContext('webgpu');
      if (!ctx) { auraMode = 'css'; return; }
      var format = navigator.gpu.getPreferredCanvasFormat();
      cv.width = 256; cv.height = 256;
      ctx.configure({ device: dev, format: format, alphaMode: 'premultiplied' });
      var module = dev.createShaderModule({ code: AURA_VERTEX + '\n' + AURA_FRAGMENT });
      if (module.getCompilationInfo) {
        var info = await module.getCompilationInfo();
        var errs = (info.messages || []).filter(function (m) { return m.severity === 'error'; });
        if (errs.length) { auraMode = 'css'; return; }
      }
      var pipeline = dev.createRenderPipeline({
        layout: 'auto',
        vertex: { module: module, entryPoint: 'nv_vs' },
        fragment: { module: module, entryPoint: 'main', targets: [{ format: format }] },
        primitive: { topology: 'triangle-list' }
      });
      var uniformBuf = dev.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      var bindGroup = dev.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuf } }] });
      if (auraCanvas !== cv) { auraMode = 'off'; return; }
      aura = { device: dev, ctx: ctx, pipeline: pipeline, bindGroup: bindGroup, uniformBuf: uniformBuf };
      auraMode = 'gpu';
    }).catch(function () { auraMode = 'css'; });
  }

  /* POPUP REACTION (Nov 22, 2026, Jasmine's ruling): when a popup
     opens on a page where the sprite lives, the symbiont travels to
     the popup's top-right corner, spins once, and wears an "!" until
     the popup closes; then it goes back to roaming. Detection is by
     observation only — a MutationObserver (childList + class/hidden
     attribute changes; style is deliberately NOT observed, the
     sprite's own left/top writes would storm it) plus a lightweight
     re-scan every 30 ticks as a backstop for style-driven shows.
     Topmost = the LAST matching visible element in DOM order.
     Full-screen backdrops/overlays resolve to their first visible
     panel descendant, so the perch lands on the panel's corner, not
     the screen's. While perched the container's z-index rises to 12
     (popups run 7–10; the sprite's stylesheet layer is 8) and is
     restored on unperch. Reduced motion: no travel, no spin — the
     "!" still appears, in place; it is information, not decoration.
     Static mode: stillness is its default, but a popup overrides it
     (User's correction, Nov 22, 2026: "it can move to the pop up even
     if stagnant on a page") — it travels and perches like the roaming
     sprite, and when the popup closes it travels back to its static
     spot and resumes standing still. */
  var POP_SELECTOR = '.gl-pop-backdrop, .nv-opt-pop, .nv-guard-backdrop, .nv-guard, .palette-overlay.open, [role="dialog"], [role="alertdialog"]';
  var badgeEl = null;
  var spriteHomeX = 0, spriteHomeY = 0; /* the static spot, recorded at spawn */
  var perch = { active: false, target: null, traveling: false, noMove: false, fromX: 0, fromY: 0, tx: 0, ty: 0, travelStart: 0, returning: false, rFromX: 0, rFromY: 0, rtx: 0, rty: 0, rStart: 0 };
  var popObserver = null, popScanQueued = false, popTick = 0;

  function popVisibleEl(el) {
    if (!el || !container || el === container || container.contains(el)) return false;
    if (!el.getClientRects || !el.getClientRects().length) return false;
    var cs = window.getComputedStyle ? getComputedStyle(el) : null;
    if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
    return true;
  }
  function popFind() {
    var list = document.querySelectorAll(POP_SELECTOR);
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].querySelector && list[i].querySelector(PICK_CONTROLS)) continue; /* a pick surface is never a perch target */
      if (popVisibleEl(list[i])) found = list[i]; /* last visible in DOM order = topmost heuristic */
    }
    return found;
  }
  function popCorner(el) {
    var r = el.getBoundingClientRect();
    if (r.width >= window.innerWidth * 0.95 && r.height >= window.innerHeight * 0.95) {
      var panel = el.querySelector('.gl-pop, .nv-guard, .nv-opt-pop, .palette, [role="dialog"]');
      if (panel && panel !== el && popVisibleEl(panel)) r = panel.getBoundingClientRect();
    }
    /* The perch point: 10px inside the popup's top-right corner; the
       sprite's centre lands there, so it overlaps the corner. */
    return { cx: r.right - 10, cy: r.top + 10 };
  }
  function popBadgeShow() { if (badgeEl) badgeEl.classList.add('nv-sprite-badge-show'); }
  function popBadgeHide() { if (badgeEl) badgeEl.classList.remove('nv-sprite-badge-show'); }
  function popUnperch() {
    perch.active = false;
    perch.target = null;
    perch.traveling = false;
    perch.noMove = false;
    popBadgeHide();
    if (container) { container.style.zIndex = ''; container.style.transform = ''; }
    if (STATIC_MODE && !reduced && container) {
      /* Static mode: travel back to the spot it stands in, then
         resume standing still (the return glide runs in tick). */
      perch.returning = true;
      perch.rFromX = x; perch.rFromY = y;
      perch.rtx = spriteHomeX; perch.rty = spriteHomeY;
      perch.rStart = performance.now();
    }
  }
  function popScan() {
    if (!shown) return;
    enforceSingleton();
    if (!container) return;
    if (pickSurfaceOpen()) { pickSetSuppressed(true); return; } /* a pick outranks every popup: hide, never perch on it */
    if (pickSuppressed) pickSetSuppressed(false);
    var el = popFind();
    if (el) {
      if (perch.active && perch.target === el) return;
      perch.target = el;
      perch.active = true;
      perch.returning = false;
      container.style.zIndex = '12';
      if (reduced) {
        /* The one remaining exception: no travel, no spin — the "!"
           appears in place. It is information, not decoration. */
        perch.noMove = true;
        perch.traveling = false;
        popBadgeShow();
      } else {
        /* Roaming and static sprites alike travel to the popup. */
        var c = popCorner(el);
        perch.tx = Math.max(0, Math.min(window.innerWidth - SIZE, c.cx - SIZE / 2));
        perch.ty = Math.max(0, Math.min(window.innerHeight - SIZE, c.cy - SIZE / 2));
        perch.fromX = x; perch.fromY = y;
        perch.travelStart = performance.now();
        perch.traveling = true;
        perch.noMove = false;
        /* Spin + badge fire on arrival, in tick. */
      }
    } else if (perch.active) {
      popUnperch();
    }
  }
  function popQueueScan() {
    if (popScanQueued) return;
    popScanQueued = true;
    setTimeout(function () { popScanQueued = false; popScan(); }, 40);
  }
  function popWatchStart() {
    if (popObserver || !document.body) return;
    try {
      popObserver = new MutationObserver(popQueueScan);
      popObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    } catch (e) { popObserver = null; }
  }
  function popWatchStop() {
    if (popObserver) { popObserver.disconnect(); popObserver = null; }
  }

  /* ONE PRESENCE PER PAGE (Nov 22, 2026, Jasmine's ruling: "only ever
     one sprite or hexagon on any page including the sprite color
     picker"). Two sprite-side enforcements live here:
     (1) HARD SINGLETON — this script already refuses a second include
     (the window.NVSprite guard at the top); show() additionally
     refuses to mount if a sprite root from other code already
     exists (keeping the first such root, removing any others), and
     enforceSingleton() sweeps later duplicates on the scan cadence,
     keeping this sprite's root.
     (2) PICK SUPPRESSION — while a symbiont pick is open, the sprite
     hides and does not perch on it: during a pick, the choice
     hexagons are the symbiont presence. Detection, exactly:
       - a visible element matching .ia-pick-pop, .nv-pick-pop, or
         .symbiont-pick-popup (a dedicated pick popup), or
       - a visible [role="dialog"] / [role="alertdialog"] element
         that contains pick controls, or
       - the Profile Editor's pick section — in the current code the
         pick is an inline <section aria-label="Your Symbiont">
         holding .baseBtn sigil buttons, #symbiontNameInput and
         #symbiontGenderInput — while it is ENGAGED, where engaged
         means keyboard focus is inside it (the inline analog of a
         popup being open; a click on a base button focuses it).
     The IA Symbiont page's .ia-pick grid is deliberately NOT a
     suppression trigger: it is that page's permanent content, not a
     popup, and which presence stays on that page is the user's open
     call (audited in the build report, not decided here). */
  var PICK_CONTROLS = '.baseBtn, .ia-pick, #symbiontNameInput, #symbiontGenderInput';
  var pickSuppressed = false;

  function enforceSingleton() {
    var roots = document.querySelectorAll('.nv-sprite');
    if (!roots.length) return;
    var keep = container || roots[0];
    for (var i = 0; i < roots.length; i++) {
      if (roots[i] !== keep && roots[i].parentNode) roots[i].parentNode.removeChild(roots[i]);
    }
  }

  function pickSurfaceOpen() {
    var i, els;
    els = document.querySelectorAll('.ia-pick-pop, .nv-pick-pop, .symbiont-pick-popup');
    for (i = 0; i < els.length; i++) { if (popVisibleEl(els[i])) return true; }
    els = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
    for (i = 0; i < els.length; i++) {
      if (popVisibleEl(els[i]) && els[i].querySelector(PICK_CONTROLS)) return true;
    }
    var sec = document.querySelector('section[aria-label="Your Symbiont"]');
    if (sec && popVisibleEl(sec) && document.activeElement && sec.contains(document.activeElement)) return true;
    return false;
  }

  function pickSetSuppressed(on) {
    if (on === pickSuppressed) return;
    pickSuppressed = on;
    if (on) {
      if (perch.active) popUnperch();
      perch.returning = false; /* suppression cancels any flight home — the sprite is hidden, not travelling */
      if (container) container.style.display = 'none';
    } else {
      if (container) container.style.display = '';
    }
  }

  function localName() {
    try { return localStorage.getItem('nv_display_name') || ''; } catch (e) { return ''; }
  }
  async function accountName() {
    try {
      var c = (typeof getClient === 'function') ? getClient() : null;
      if (!c) return '';
      var d = await c.auth.getSession();
      var u = d && d.data && d.data.session && d.data.session.user;
      return (u && u.user_metadata && u.user_metadata.display_name) || '';
    } catch (e) { return ''; }
  }
  async function hasSession() {
    try {
      var c = (typeof getClient === 'function') ? getClient() : null;
      if (!c) return null; /* no client (not configured) — cannot check, do not block on it */
      var d = await c.auth.getSession();
      return !!(d && d.data && d.data.session);
    } catch (e) { return false; }
  }

  /* CONDITION: the sprite only appears after the user has created a username
     and an account on the hub — signed in AND a username exists. The username
     is the same name the hub saves: localStorage 'nv_display_name' or
     Supabase user_metadata.display_name. No saved name = no sprite at all. */
  async function checkGate() {
    if (IA_PAGE) return; /* the IA Symbiont page never mounts the sprite (Nov 22, 2026 ruling) */
    if (shown) return;
    var name = localName() || await accountName();
    if (!name) return;
    var session = await hasSession();
    if (session === false) return; /* a client exists and says: not signed in */
    show();
  }

  /* Fixed spawn spot (Hex OS spec): right of centre, upper-middle of the
     viewport. The sprite always materializes here — never a random spot.
     (The pattern engine takes over the velocity right after spawn.) */
  function fixedSpawn() {
    var maxX = Math.max(0, window.innerWidth - SIZE);
    var maxY = Math.max(0, window.innerHeight - SIZE);
    x = Math.round(maxX * 0.74);
    y = Math.round(maxY * 0.30);
    vx = FALLBACK_SPEED;
    vy = 0;
  }

  function render() {
    if (!container) return;
    container.style.left = x + 'px';
    container.style.top = y + 'px';
    /* Spin: a 600ms ease-out full turn, drawn on the SVG layer so it
       composes with the hexagon's own drag rotation and never fights
       the hop (container) or wiggle (hex) animations. auraFlare rides
       the same progress — the aura brightens and its ring speeds up
       while the spin runs, then settles with it. */
    var spinDeg = 0;
    if (spinStart) {
      var p = (performance.now() - spinStart) / 600;
      if (p >= 1) { spinStart = 0; auraFlare = 0; }
      else { spinDeg = 360 * (1 - Math.pow(1 - p, 3)); auraFlare = 1 - p; }
    }
    if (hex) hex.style.transform = 'rotate(' + angle + 'deg)';
    if (hexSvg) hexSvg.style.transform = spinDeg ? ('rotate(' + spinDeg.toFixed(1) + 'deg)') : '';
    auraFrame();
  }

  /* Roaming is pattern-driven, per symbiont base (Jasmine's ruling,
     Nov 13, 2026). The pattern keys off the SAME base signal the colour
     uses: the theme's data-symbiont attribute on the root element (which
     nv-symbiont-theme.js sets from localStorage 'nv_symbiont_base'), with
     the stored pick itself as a fallback and 'cyphr' — the theme's own
     default — when nothing valid is picked. No new storage, no settings.
       hexa   SWEEP  — wide horizontal arcs; pauses at each edge and
                       pulses once before crossing back.
       cyphr  PROWL  — drops to the bottom edge; short steps with long
                       still pauses, dimmed while it sits still.
       helix  DART   — fast zigzag bursts with a brief hover between.
       warden STRIDE — a steady, even march at full brightness; it
                       never dims and never hides.
     A throw (fling on release) overrides the pattern: it keeps its
     velocity and decays with friction, bouncing off the walls with a
     little energy lost per bounce, until it settles back to pattern
     pace and the pattern takes over again. Pauses while dragging;
     resumes from wherever it was dropped. */
  function patternBase() {
    var a = '';
    try { a = document.documentElement.getAttribute('data-symbiont') || ''; } catch (e) {}
    if (a === 'hexa' || a === 'cyphr' || a === 'helix' || a === 'warden') return a;
    try {
      var b = localStorage.getItem('nv_symbiont_base') || '';
      if (b === 'hexa' || b === 'cyphr' || b === 'helix' || b === 'warden') return b;
    } catch (e) {}
    return 'cyphr'; /* the theme's default when nothing is picked */
  }

  function startPattern(name) {
    pattern = name;
    P = { phase: 'go', t: 0, dir: (vx < 0 ? -1 : 1), zag: 1, wall: null, bob: 0 };
    if (container) container.style.opacity = ''; /* no pattern starts dimmed */
    if (name === 'cyphr') P.phase = 'descend';
    else if (name === 'helix') { P.phase = 'burst'; P.t = 0.38; }
    else if (name === 'hexa') P.phase = 'glide';
    else if (name === 'warden') P.phase = 'march';
  }

  function pulse() {
    /* SWEEP's edge pulse: one soft swell of the hexagon itself (the svg
       layer, so it never fights the hex rotation or the hop). */
    if (!hex || reduced) return;
    hex.classList.remove('nv-sprite-pulse');
    void hex.offsetWidth; /* restart the animation */
    hex.classList.add('nv-sprite-pulse');
    setTimeout(function () { if (hex) hex.classList.remove('nv-sprite-pulse'); }, 900);
  }

  function stepSweep(dt, wall) {
    if (P.phase === 'pause') {
      vx = 0; vy = 0;
      P.t -= dt;
      if (P.t <= 0) { P.dir = -P.dir; P.phase = 'glide'; }
      return;
    }
    vx = P.dir * CRUISE.hexa;
    P.bob += dt;
    vy = Math.sin(P.bob * 0.9) * 14; /* a gentle arc, not a straight rail */
    if (wall === 'top') vy = Math.abs(vy);
    if (wall === 'bottom') vy = -Math.abs(vy);
    if ((wall === 'left' && P.dir < 0) || (wall === 'right' && P.dir > 0)) {
      P.phase = 'pause'; P.t = 1.1; vx = 0; vy = 0; pulse();
    }
  }

  function stepProwl(dt, wall) {
    var fy = Math.max(0, window.innerHeight - SIZE - 6); /* the bottom edge */
    if (P.phase === 'descend') {
      if (container) container.style.opacity = '';
      vx = 0;
      var dy = fy - y;
      if (Math.abs(dy) <= 2) { y = fy; vy = 0; P.phase = 'still'; P.t = 0.8; }
      else vy = (dy > 0 ? 1 : -1) * 46;
      return;
    }
    y = fy; vy = 0;
    if (P.phase === 'step') {
      if (container) container.style.opacity = '';
      vx = P.dir * 42;
      P.t -= dt;
      if (wall === 'left' || wall === 'right') {
        P.dir = -P.dir; vx = 0; P.phase = 'still'; P.t = 1.4 + Math.random() * 1.2;
      } else if (P.t <= 0) {
        vx = 0; P.phase = 'still'; P.t = 1.6 + Math.random() * 1.2;
      }
      return;
    }
    /* still: sit low and dim until the next step */
    vx = 0;
    if (container) container.style.opacity = '0.55';
    P.t -= dt;
    if (P.t <= 0) {
      if (Math.random() < 0.3) P.dir = -P.dir;
      P.phase = 'step'; P.t = 0.55;
    }
  }

  function stepDart(dt, wall) {
    if (wall === 'left' && P.dir < 0) P.dir = 1;
    if (wall === 'right' && P.dir > 0) P.dir = -1;
    if (wall === 'top' || wall === 'bottom') P.zag = -P.zag;
    P.t -= dt;
    if (P.phase === 'burst') {
      var ang = 0.6; /* ~34 degrees — the zigzag angle */
      vx = P.dir * Math.cos(ang) * CRUISE.helix;
      vy = P.zag * Math.sin(ang) * CRUISE.helix;
      if (P.t <= 0) { P.phase = 'hover'; P.t = 0.28; P.zag = -P.zag; }
    } else { /* hover: a brief held breath between darts */
      vx = P.dir * 6; vy = 0;
      if (P.t <= 0) { P.phase = 'burst'; P.t = 0.38; }
    }
  }

  function stepStride(dt, wall) {
    if (wall === 'left') P.dir = 1;
    if (wall === 'right') P.dir = -1;
    vx = P.dir * CRUISE.warden; /* the same pace, the whole way across */
    var H = Math.max(0, window.innerHeight - SIZE);
    if (y < H * 0.15) vy = 22; else if (y > H * 0.75) vy = -22; else vy = 0;
    if (container) container.style.opacity = ''; /* STRIDE never dims */
  }

  function stepPattern(dt, wall) {
    if (!P) startPattern(pattern);
    if (pattern === 'hexa') stepSweep(dt, wall);
    else if (pattern === 'cyphr') stepProwl(dt, wall);
    else if (pattern === 'helix') stepDart(dt, wall);
    else stepStride(dt, wall);
  }

  /* Move one frame. In a throw, walls bounce the velocity back with
     BOUNCE_KEEP of its speed; under a pattern, walls just clamp and are
     reported to the pattern, which decides what happens next. */
  function integrate(dt, bouncy) {
    var speed = Math.sqrt(vx * vx + vy * vy);
    x += vx * dt;
    y += vy * dt;
    var maxX = Math.max(0, window.innerWidth - SIZE), maxY = Math.max(0, window.innerHeight - SIZE);
    var wall = null;
    if (x <= 0) { x = 0; wall = 'left'; vx = bouncy ? Math.abs(vx) * BOUNCE_KEEP : 0; }
    if (x >= maxX) { x = maxX; wall = 'right'; vx = bouncy ? -Math.abs(vx) * BOUNCE_KEEP : 0; }
    if (y <= 0) { y = 0; if (!wall) wall = 'top'; vy = bouncy ? Math.abs(vy) * BOUNCE_KEEP : 0; }
    if (y >= maxY) { y = maxY; if (!wall) wall = 'bottom'; vy = bouncy ? -Math.abs(vy) * BOUNCE_KEEP : 0; }
    if (P) P.wall = wall;
    return speed;
  }

  function tick(t) {
    raf = null;
    if (!container || dragging) return;
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    popTick++;
    if (popTick % 30 === 0) popScan(); /* popup backstop: catches style-driven shows the observer misses */
    if (pickSuppressed) { raf = requestAnimationFrame(tick); return; } /* hidden while a symbiont pick is open — the loop stays alive so it notices the pick close */
    if (forming) { render(); raf = requestAnimationFrame(tick); return; }
    if (perch.traveling) {
      /* Glide to the popup's corner over ~450ms, ease-out. */
      var tp = (performance.now() - perch.travelStart) / 450;
      if (tp >= 1) {
        x = perch.tx; y = perch.ty;
        perch.traveling = false;
        startSpin(performance.now()); /* the arrival flourish — the spin flares the aura via render */
        popBadgeShow();
      } else {
        var te = 1 - Math.pow(1 - tp, 3);
        x = perch.fromX + (perch.tx - perch.fromX) * te;
        y = perch.fromY + (perch.ty - perch.fromY) * te;
      }
      render(); raf = requestAnimationFrame(tick); return;
    }
    if (perch.active) {
      /* Perched: hold the corner (easing back if dragged off or the
         popup shifts), idle-bob gently, no roaming. A throw while
         perched is politely ignored — it comes back to the corner. */
      if (!perch.noMove && perch.target && perch.target.isConnected) {
        var pc = popCorner(perch.target);
        x += ((pc.cx - SIZE / 2) - x) * 0.2;
        y += ((pc.cy - SIZE / 2) - y) * 0.2;
        clampIntoView();
      }
      if (container) container.style.transform = 'translateY(' + (Math.sin(performance.now() / 450) * 3).toFixed(1) + 'px)';
      render(); raf = requestAnimationFrame(tick); return;
    }
    if (perch.returning) {
      /* Static mode, popup closed: glide back to the static spot. */
      var rp = (performance.now() - perch.rStart) / 450;
      if (rp >= 1) {
        x = perch.rtx; y = perch.rty;
        perch.returning = false;
      } else {
        var re = 1 - Math.pow(1 - rp, 3);
        x = perch.rFromX + (perch.rtx - perch.rFromX) * re;
        y = perch.rFromY + (perch.rty - perch.rFromY) * re;
      }
      render(); raf = requestAnimationFrame(tick); return;
    }
    if (container && container.style.transform) container.style.transform = ''; /* perch bob cleanup on the first normal frame */
    if (STATIC_MODE) { render(); raf = requestAnimationFrame(tick); return; } /* static: stands still — no pattern, no throw physics; render keeps the aura + spin alive. Popup travel above overrides the stillness. */
    if (!reduced) {
      frameNo++;
      if (frameNo % 15 === 0) { /* follow a live base change (~4x a second) */
        var b = patternBase();
        if (b !== pattern) startPattern(b);
      }
      /* Roam spin: rare — a long cooldown plus a small per-frame
         chance works out to roughly one spin per half-minute of
         roaming, never a habit. */
      if (!spinStart && t - lastRoamSpin > 20000 && Math.random() < 0.0006) {
        lastRoamSpin = t;
        startSpin(t);
      }
      if (thrown) {
        /* Throw friction: a flung symbiont sheds speed until it is back
           to pattern pace, then the pattern takes over again. */
        var keep = Math.pow(THROW_FRICTION, dt);
        vx *= keep; vy *= keep;
        var spd = Math.sqrt(vx * vx + vy * vy);
        integrate(dt, true);
        if (spd <= (CRUISE[pattern] || FALLBACK_SPEED)) thrown = false;
      } else {
        var wallHit = P ? P.wall : null;
        if (P) P.wall = null;
        stepPattern(dt, wallHit);
        integrate(dt, false);
      }
    }
    /* Spin momentum: a flick keeps it turning after release, decaying until
       it settles. Under reduced motion there is no spin. */
    if (!reduced && Math.abs(angVel) > 0.05) {
      angle += angVel * dt;
      angVel *= Math.pow(0.12, dt); /* fast decay — settles in about a second */
      if (Math.abs(angVel) <= 0.05) angVel = 0;
    }
    render();
    raf = requestAnimationFrame(tick);
  }
  function kick() {
    if (raf == null && container) { lastT = performance.now(); raf = requestAnimationFrame(tick); }
  }
  function clampIntoView() {
    x = Math.max(0, Math.min(window.innerWidth - SIZE, x));
    y = Math.max(0, Math.min(window.innerHeight - SIZE, y));
  }

  function hop() {
    /* 1s hop-bob, same timing as Baby Pigek's locked hop-bob. Skipped under
       reduced motion — the run-away below still answers the tap. */
    if (hopping || reduced) return;
    hopping = true;
    container.classList.remove('nv-sprite-hop');
    void container.offsetWidth; /* restart the animation */
    container.classList.add('nv-sprite-hop');
    setTimeout(function () {
      container.classList.remove('nv-sprite-hop');
      hopping = false;
    }, HOP_MS);
  }

  function wiggle() {
    /* A little side-to-side wiggle, like a pet. Skipped under reduced motion. */
    if (wiggling || reduced || !hex) return;
    wiggling = true;
    hex.classList.remove('nv-sprite-wiggle');
    void hex.offsetWidth; /* restart the animation */
    hex.classList.add('nv-sprite-wiggle');
    setTimeout(function () {
      hex.classList.remove('nv-sprite-wiggle');
      wiggling = false;
    }, 600);
  }

  function onTap(clientX, clientY) { if (window.NVSymbiontChime) window.NVSymbiontChime();
    /* A click is petting it: it hops and wiggles where it is. It does NOT
       run away — the toss (fling on release) is what sends it flying.
       A pet also feeds the hidden bond, and it answers out loud. */
    bondGain(2);
    startSpin(performance.now()); /* every pet is answered with the spin flourish */
    hop();
    wiggle();
    showLine();
  }

  function bindHover() {
    /* Hover: the sprite says one fading line, a different one each
       hover. Being talked to feeds the hidden bond too — throttled to
       at most +1 per 10 seconds so parking the cursor doesn't farm it.
       Bound in both modes. */
    hex.addEventListener('mouseenter', function () {
      if (dragging) return;
      showLine();
      var now = Date.now();
      if (now - lastHoverGain >= 10000) { lastHoverGain = now; bondGain(1); }
    });
  }

  function bindStaticTap() {
    /* Static mode tap: pet first — chime, hop, wiggle, spin, the bond
       gain and a line, all of it through the normal onTap — then
       follow the link after ~350ms so the pet is seen before the
       page changes. */
    var go = function () {
      onTap(x + SIZE / 2, y + SIZE / 2);
      if (perch.active || perch.returning) return; /* perched on a popup, or flying home from one: pet only — the user is mid-popup, no navigation */
      setTimeout(function () { location.href = STATIC_HREF; }, 350);
    };
    hex.addEventListener('click', go);
    hex.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  }

  function bindDrag() {
    if (STATIC_MODE) { bindStaticTap(); bindHover(); return; } /* static: no drag, no throw — tap + hover only */
    var downX = 0, downY = 0, downT = 0, grabDX = 0, grabDY = 0;
    var lastMoveX = 0, lastMoveY = 0, lastMoveT = 0, moved = 0;
    /* Trail of recent pointer positions, for the throw velocity on release.
       The old code used only the last pointermove pair — by release time a
       mouse fling has already decelerated, so the recorded speed was near
       zero and the throw did nothing. A trailing ~120ms window catches the
       fast part of the fling even if the pointer slows at the very end. */
    var trail = []; /* {x, y, t} — newest last, capped at 20 */

    hex.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { hex.setPointerCapture(e.pointerId); } catch (err) {}
      dragging = true;
      if (raf != null) { cancelAnimationFrame(raf); raf = null; }
      downX = e.clientX; downY = e.clientY; downT = Date.now();
      grabDX = e.clientX - x; grabDY = e.clientY - y;
      lastMoveX = e.clientX; lastMoveY = e.clientY; lastMoveT = Date.now();
      moved = 0; trail = [];
      angVel = 0;
      thrown = false;
      if (container) container.style.opacity = ''; /* a grab ends any PROWL dim */
      hex.classList.add('nv-sprite-grabbing');
    });

    hex.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var nx = e.clientX - grabDX, ny = e.clientY - grabDY;
      var dx = nx - x, dy = ny - y;
      moved += Math.abs(dx) + Math.abs(dy);
      x = nx; y = ny;
      clampIntoView();
      /* Rotation follows the drag. */
      if (!reduced) angle += dx * 0.4;
      /* Track flick velocity for the throw on release — both the spin and
         the flight speed come from how fast the pointer is moving. */
      var now = Date.now();
      var dt = Math.max(1, now - lastMoveT);
      var flickX = (e.clientX - lastMoveX) / dt * 1000; /* px per second */
      var flickY = (e.clientY - lastMoveY) / dt * 1000;
      var flick = flickX; /* spin follows the horizontal flick, as before */
      angVel = Math.max(-720, Math.min(720, flick * 0.4));
      /* Keep the latest flick velocity so release can throw with it. */
      throwVX = Math.max(-THROW_MAX, Math.min(THROW_MAX, flickX));
      throwVY = Math.max(-THROW_MAX, Math.min(THROW_MAX, flickY));
      lastMoveX = e.clientX; lastMoveY = e.clientY; lastMoveT = now;
      trail.push({ x: e.clientX, y: e.clientY, t: now });
      if (trail.length > 20) trail.shift();
      render();
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      hex.classList.remove('nv-sprite-grabbing');
      /* A tap, NOT a drag: tiny movement + short press = hop + run away. */
      if (moved < TAP_MOVE && Date.now() - downT < TAP_MS) {
        onTap(e.clientX, e.clientY);
      } else if (reduced) {
        angVel = 0; /* no spin momentum under reduced motion */
        vx = 0; vy = 0;
      } else {
        /* A throw: the symbiont keeps the fling velocity and flies across
           the screen, decaying with friction until it settles to roaming.
           Velocity comes from the trailing ~120ms of pointer movement, not
           just the last move event — a mouse fling decelerates before
           release, so the last pair alone reads near zero. */
        var relT = Date.now();
        var winStart = relT - 120;
        var first = null, last = null;
        for (var i = 0; i < trail.length; i++) {
          if (trail[i].t >= winStart) { if (!first) first = trail[i]; last = trail[i]; }
        }
        if (first && last && last.t > first.t) {
          var wdt = last.t - first.t;
          vx = Math.max(-THROW_MAX, Math.min(THROW_MAX, (last.x - first.x) / wdt * 1000));
          vy = Math.max(-THROW_MAX, Math.min(THROW_MAX, (last.y - first.y) / wdt * 1000));
        } else {
          vx = throwVX; vy = throwVY;
        }
        thrown = Math.sqrt(vx * vx + vy * vy) > (CRUISE[pattern] || FALLBACK_SPEED);
        if (thrown) bondGain(1); /* a real fling feeds the hidden bond */
      }
      kick(); /* pattern / throw resumes from the drop point */
    }
    hex.addEventListener('pointerup', endDrag);
    hex.addEventListener('pointercancel', endDrag);

    /* Keyboard: Enter / Space does the tap behaviour. */
    hex.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onTap(x + SIZE / 2, y + SIZE / 2);
      }
    });

    bindHover();
  }

  function show() {
    if (IA_PAGE) return; /* belt and braces: no mount on the IA Symbiont page, ever */
    if (shown) return;
    shown = true;
    if (gateTimer) { clearInterval(gateTimer); gateTimer = null; }

    /* HARD SINGLETON: if a sprite root from other code is already on
       the page, keep the first, remove any others, and refuse this
       mount — one sprite per page, ever. */
    var existingRoots = document.querySelectorAll('.nv-sprite');
    if (existingRoots.length) {
      for (var ri = 1; ri < existingRoots.length; ri++) {
        if (existingRoots[ri].parentNode) existingRoots[ri].parentNode.removeChild(existingRoots[ri]);
      }
      popWatchStart();
      return;
    }

    container = document.createElement('div');
    container.className = 'nv-sprite';
    container.setAttribute('aria-hidden', 'false');
    hex = document.createElement('div');
    hex.className = 'nv-sprite-hex';
    hex.setAttribute('role', 'button');
    hex.setAttribute('tabindex', '0');
    hex.setAttribute('aria-label', 'Symbiont (placeholder)');
    /* Inline SVG hexagon — no words, no text on it. */
    /* The hexagon follows the IA Symbiont pick (Hexa cyan, Cyphr indigo,
       Helix pink) through the theme variables, so the IA recolors with
       the rest of the system. */
    hex.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,3 93,27 93,73 50,97 7,73 7,27" fill="var(--nv-accent, #8a8a99)" fill-opacity="0.35" stroke="var(--nv-accent, #8a8a99)" stroke-width="3"/><polygon points="50,22 76,37 76,63 50,78 24,63 24,37" fill="none" stroke="var(--nv-accent-soft, #c9c9d4)" stroke-width="2"/></svg>';
    container.appendChild(hex);
    document.body.appendChild(container);
    hexSvg = hex.querySelector('svg');

    /* The aura canvas: 240x240, centred on the sprite, riding inside
       the container so the existing render loop carries it. It never
       takes input and sits under the hexagon and the dialogue line. */
    auraCanvas = document.createElement('canvas');
    auraCanvas.className = 'nv-sprite-aura';
    auraCanvas.setAttribute('aria-hidden', 'true');
    container.appendChild(auraCanvas);

    /* The dialogue line: a small glass bubble over the sprite that
       fades in and out. Its styles ride along in this file (injected
       once) so the sprite stays self-contained. */
    if (!document.getElementById('nv-sprite-line-style')) {
      var lineStyle = document.createElement('style');
      lineStyle.id = 'nv-sprite-line-style';
      lineStyle.textContent = '.nv-sprite-line{position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);width:190px;box-sizing:border-box;padding:7px 9px;border:1px solid var(--nv-accent, #8a8a99);border-radius:9px;background:rgba(15,9,27,.92);color:#f5f0ff;font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.45;text-align:center;opacity:0;transition:opacity .35s ease;pointer-events:none;z-index:3}.nv-sprite-line-show{opacity:1}'
        + '.nv-sprite-aura{position:absolute;left:50%;top:50%;width:240px;height:240px;margin:-120px 0 0 -120px;pointer-events:none;z-index:1}'
        + '.nv-sprite-hex{position:relative;z-index:2}'
        + '.nv-sprite-hex svg{transform-box:fill-box;transform-origin:center}'
        + '.nv-sprite-badge{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(0);font-family:ui-monospace,Menlo,monospace;font-size:46px;font-weight:700;line-height:1;color:#fff;text-shadow:0 0 10px var(--nv-accent, #8a8a99),0 0 22px var(--nv-accent, #8a8a99);opacity:0;transition:transform .28s cubic-bezier(.2,1.6,.4,1),opacity .2s ease;pointer-events:none;z-index:4}'
        + '.nv-sprite-badge-show{transform:translate(-50%,-50%) scale(1);opacity:1}';
      document.head.appendChild(lineStyle);
    }
    lineEl = document.createElement('div');
    lineEl.className = 'nv-sprite-line';
    lineEl.setAttribute('aria-hidden', 'true');
    container.appendChild(lineEl);

    /* The popup-reaction badge: a bold "!" centred on the sprite,
       shown while it is perched on a popup (Part 5). */
    badgeEl = document.createElement('div');
    badgeEl.className = 'nv-sprite-badge';
    badgeEl.setAttribute('aria-hidden', 'true');
    badgeEl.textContent = '!';
    container.appendChild(badgeEl);

    fixedSpawn();
    spriteHomeX = x; spriteHomeY = y; /* the static spot — popup trips return here */
    startPattern(patternBase());
    render();
    bindDrag();
    auraInit();
    popWatchStart();
    popScan();
    window.addEventListener('resize', function () { clampIntoView(); render(); });
    if (!reduced) {
      /* Materialization: a tight local cloud of sigil-colored particles
         converges at the spawn spot while the hexagon resolves out of
         it. The sprite stands still (forming) until the cloud clears,
         then the pattern takes over. */
      forming = true;
      hex.classList.add('nv-sprite-forming');
      var cloud = document.createElement('div');
      cloud.className = 'nv-sprite-particles';
      cloud.setAttribute('aria-hidden', 'true');
      for (var i = 0; i < 26; i++) {
        var p = document.createElement('span');
        p.className = 'nv-sprite-particle';
        var ang = Math.random() * Math.PI * 2;
        var dist = 18 + Math.random() * 38;
        p.style.setProperty('--nv-px', Math.round(Math.cos(ang) * dist) + 'px');
        p.style.setProperty('--nv-py', Math.round(Math.sin(ang) * dist) + 'px');
        p.style.animationDelay = Math.round(Math.random() * 120) + 'ms';
        cloud.appendChild(p);
      }
      container.appendChild(cloud);
      kick(); /* runs the forming hold */
      formTimer = setTimeout(function () {
        formTimer = null;
        if (!container || !hex) return;
        if (cloud.parentNode) cloud.parentNode.removeChild(cloud);
        hex.classList.remove('nv-sprite-forming');
        forming = false;
      }, 1150);
    }
  }

  function hide() {
    if (!shown) return;
    shown = false;
    if (raf != null) { cancelAnimationFrame(raf); raf = null; }
    forming = false;
    if (formTimer) { clearTimeout(formTimer); formTimer = null; }
    if (container && container.parentNode) container.parentNode.removeChild(container);
    container = null; hex = null;
    if (lineTimer) { clearTimeout(lineTimer); lineTimer = null; }
    lineEl = null;
    popWatchStop();
    perch.active = false; perch.target = null; perch.traveling = false; perch.returning = false; perch.noMove = false;
    badgeEl = null;
    hexSvg = null;
    auraCanvas = null; aura = null; auraMode = 'off';
    spinStart = 0; auraFlare = 0; lastGlowCss = '';
    startGateWatch();
  }

  function startGateWatch() {
    /* The username may be created after this page loads (hub save). A
       same-tab localStorage write fires no storage event, so re-check the
       saved name on a light interval until the sprite appears. */
    if (gateTimer || shown) return;
    gateTimer = setInterval(function () {
      if (localName()) checkGate();
    }, 2000);
  }

  /* If the name is deleted (hub / settings), the sprite goes away with it. */
  window.addEventListener('storage', function (e) {
    if (e.key === 'nv_display_name') {
      if (e.newValue) { checkGate(); } else { hide(); }
    }
  });

  function init() {
    checkGate();
    startGateWatch();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
