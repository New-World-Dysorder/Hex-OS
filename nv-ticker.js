/* nv-ticker.js — Shared ticker for the Neon Vigil web app.
   Infinity 6 Terminal / Hex OS. One module; the hub ticker, extracted whole
   (time + date + location + weather). Full width across the entire
   top, 30s seamless scroll once location is accepted and the content is real.
   Before location resolves it sits still — it never scrolls empty/loading
   content. Location chain: browser location → IP fallback → Oakland default.
   Weather: Open-Meteo, refreshed every 15 min; clock every 1s.
   Content lock (Nov 20, 2026, carried by the Nov 22, 2026 Hex OS port):
   time + date in NUMBERS ONLY, then location, then weather; items are
   separated by a horizontal line (an em dash); NO tide item; no labels;
   no STANDBY or placeholder filler — an item with no data shows nothing.
   This module creates its own DOM — pages only include nv-ticker.css +
   this file. Safe to include once per page; a second include is a no-op. */
(function () {
  if (window.__nvTickerLoaded) return;
  window.__nvTickerLoaded = true;

  /* Phase 1 (Nov 13, 2026) — ticker REMOVAL routes. The game (Gigas Garden
     frame page) and My Room get no ticker at all: this module returns
     before any element is created, so no .ticker node ever exists on
     those routes (removal, not hidden text, and no replacement strip).
     A page opts out with data-nv-no-ticker on <html>; the game path is
     also matched directly so the frame page is covered even if its
     attribute is lost in a later edit. nv-shell.js mirrors this check
     and refuses to load this module on opted-out pages. */
  var NV_NO_TICKER_PATHS = ['/gigas-garden'];
  var nvPath = (window.location && window.location.pathname) || '';
  var nvNoTicker = document.documentElement.hasAttribute('data-nv-no-ticker');
  for (var nvI = 0; nvI < NV_NO_TICKER_PATHS.length && !nvNoTicker; nvI++) {
    var nvP = NV_NO_TICKER_PATHS[nvI];
    if (nvPath === nvP || nvPath.indexOf(nvP + '/') === 0) nvNoTicker = true;
  }
  if (nvNoTicker) return;
  var tickerState = { weather: '', place: '', coords: null, requested: false };
  function tickerLocale() { return (navigator.languages && navigator.languages[0]) || navigator.language || 'en-US'; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function tickerDateTime() {
    /* Numbers only: MM/DD/YYYY and 24-hour HH:MM:SS. */
    var d = new Date();
    var date = pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + '/' + d.getFullYear();
    var time = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
    return date + ' — ' + time;
  }
  var WMO = [[0, 'CLEAR'], [1, 'MOSTLY CLEAR'], [2, 'PARTLY CLOUDY'], [3, 'OVERCAST'], [48, 'FOG'], [57, 'DRIZZLE'], [67, 'RAIN'], [77, 'SNOW'], [82, 'SHOWERS'], [86, 'SNOW SHOWERS'], [99, 'THUNDERSTORM']];
  function wxCondition(code) { for (var i = 0; i < WMO.length; i++) if (code <= WMO[i][0]) return WMO[i][1]; return 'SKY UNKNOWN'; }
  function useFahrenheit() {
    var region = '';
    try { region = new Intl.Locale(tickerLocale()).maximize().region || ''; } catch (e) { region = (tickerLocale().split('-')[1] || '').toUpperCase(); }
    return ['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH'].indexOf(region) !== -1;
  }
  function renderTicker() {
    var el = document.getElementById('tickerInfo');
    if (!el) return;
    /* Only items with real data appear — no placeholders, no filler. */
    var parts = [tickerDateTime(), tickerState.place, tickerState.weather].filter(function (p) { return !!p; });
    /* Trailing delimiter: the ticker loops two identical copies for the
       seamless scroll, so each copy ends with the same separator —
       otherwise the seam reads back-to-back with no delimiter
       (audit fix, Nov 8, 2026). Separator is a horizontal line (em dash),
       per the Nov 20, 2026 ticker lock. */
    var text = parts.join(' — ') + ' — ';
    el.textContent = text;
    var el2 = document.getElementById('tickerInfo2');
    if (el2) el2.textContent = text;
  }
  function fetchWeather() {
    var c = tickerState.coords;
    if (!c) return;
    var f = useFahrenheit();
    var lat = c.latitude.toFixed(3), lon = c.longitude.toFixed(3);
    fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current=temperature_2m,weather_code&temperature_unit=' + (f ? 'fahrenheit' : 'celsius'))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var cur = d && d.current;
        if (!cur || typeof cur.temperature_2m !== 'number') throw new Error('no weather');
        tickerState.weather = Math.round(cur.temperature_2m) + '°' + (f ? 'F' : 'C') + ' ' + wxCondition(cur.weather_code);
        renderTicker();
      }).catch(function () { tickerState.weather = ''; renderTicker(); });
    if (!tickerState.place) {
      fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat + '&longitude=' + lon + '&localityLanguage=' + encodeURIComponent(tickerLocale().split('-')[0] || 'en'))
        .then(function (r) { return r.json(); })
        .then(function (g) { var nm = g.city || g.locality || g.principalSubdivision || ''; if (nm) { tickerState.place = String(nm).toUpperCase(); renderTicker(); } })
        .catch(function () {});
    }
    /* No tide item: removed by the Nov 20, 2026 ticker lock (carried by
       the Nov 22, 2026 port) — the ticker carries time, date, location,
       and weather only. */
  }
  function useCoords(lat, lon, place) {
    tickerState.coords = { latitude: lat, longitude: lon };
    if (place) tickerState.place = String(place).toUpperCase();
    /* Location accepted (browser, IP fallback, or Oakland default) — the
       ticker now has real time/date/location/weather to show, so
       start it scrolling across the top. Before this it sits still. */
    var ticker = document.querySelector('.ticker');
    if (ticker) ticker.classList.add('scrolling');
    fetchWeather();
    setInterval(fetchWeather, 15 * 60 * 1000);
  }
  function requestTickerLocation() {
    if (tickerState.requested) return; tickerState.requested = true;
    function fallback() {
      /* Browser location blocked or timed out: try IP location, then Oakland as home default. */
      fetch('https://ipwho.is/')
        .then(function (r) { return r.json(); })
        .then(function (g) {
          if (g && g.success && g.latitude && g.longitude) useCoords(g.latitude, g.longitude, g.city || '');
          else useCoords(37.8207, -122.2716, 'Oakland');
        })
        .catch(function () { useCoords(37.8207, -122.2716, 'Oakland'); });
    }
    try {
      if (!navigator.geolocation || !window.fetch) { fallback(); return; }
      var done = false;
      var hard = setTimeout(function () { if (!done) { done = true; fallback(); } }, 8000);
      navigator.geolocation.getCurrentPosition(function (pos) {
        if (done) return; done = true; clearTimeout(hard);
        useCoords(pos.coords.latitude, pos.coords.longitude, '');
      }, function () {
        if (done) return; done = true; clearTimeout(hard); fallback();
      }, { enableHighAccuracy: false, timeout: 7000, maximumAge: 15 * 60 * 1000 });
    } catch (e) { fallback(); }
  }
  function init() {
    var ticker = document.createElement('div');
    ticker.className = 'ticker';
    ticker.innerHTML = '<div class="ticker-track"><span id="tickerInfo"></span><span id="tickerInfo2" aria-hidden="true"></span></div>';
    document.body.insertBefore(ticker, document.body.firstChild);
    renderTicker();
    setInterval(renderTicker, 1000);
    requestTickerLocation();
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }
})();
