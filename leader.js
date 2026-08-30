/* ============================================================
   LEADER — an Academy countdown before the reel starts.

   The film-native version of the counter-behind-an-overlay preloader:
   a sweep hand rotates around a dial, the number steps down 8 → 2, a cue
   dot fires, then the leader slips up out of the gate and the page is
   there. Same mechanic as a 0→100 counter, but it belongs to this site.

   Canvas draws the dial, crosshair, sweep and flicker; the numeral is a
   DOM node so it uses the page's condensed face rather than a canvas
   font fallback.

     LEADER.step(nowMs)   advance by hand (rAF is paused in hidden tabs)
     LEADER.skip()        end it immediately
     LEADER.done          true once the page is clear
   ============================================================ */

window.LEADER = (function () {
  "use strict";

  var FROM = 8, TO = 2;                 // classic leader counts down to 2
  var STEP = 420;                       // ms per number
  var HOLD = 250;                       // cue dot beat before the wipe
  var COUNT_MS = (FROM - TO + 1) * STEP;
  var TOTAL = COUNT_MS + HOLD;

  var root, cv, ctx, numEl, cueEl, brandEl;
  var t0 = null, raf = 0, W = 0, H = 0, dpr = 1;

  var api = { done: false, step: step, skip: skip, total: TOTAL };

  function sizeCanvas() {
    if (!cv) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(elapsed) {
    if (!ctx || !W) return;
    var cx = W / 2, cy = H / 2;
    var R = Math.min(W, H) * 0.30;

    ctx.clearRect(0, 0, W, H);

    // full-bleed crosshair, the way a leader frame is scribed
    ctx.strokeStyle = "rgba(233,229,220,.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
    ctx.moveTo(0, cy); ctx.lineTo(W, cy);
    ctx.stroke();

    // concentric rings
    ctx.strokeStyle = "rgba(233,229,220,.18)";
    for (var i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * (1 - i * 0.28), 0, 6.2832);
      ctx.stroke();
    }

    // the sweep: one full turn per number, wiping a faint wedge behind it
    var into = (elapsed % STEP) / STEP;
    var a0 = -Math.PI / 2;
    var a1 = a0 + into * 6.2832;

    ctx.fillStyle = "rgba(233,229,220,.055)";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0, a1);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(240,160,42,.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
    ctx.stroke();

    // sparse dust, so the black is never dead flat
    ctx.fillStyle = "rgba(233,229,220,.05)";
    for (var d = 0; d < 26; d++) {
      var s = Math.sin((d * 12.9898 + Math.floor(elapsed / 90) * 78.233)) * 43758.5453;
      var rx = (s - Math.floor(s)) * W;
      var s2 = Math.sin((d * 4.1414 + Math.floor(elapsed / 90) * 12.345)) * 24634.6345;
      var ry = (s2 - Math.floor(s2)) * H;
      ctx.fillRect(rx, ry, 1.5, 1.5);
    }
  }

  function step(now) {
    if (api.done || !root) return;
    if (t0 === null) t0 = now;
    var elapsed = now - t0;

    if (elapsed < COUNT_MS) {
      var n = FROM - Math.floor(elapsed / STEP);
      if (n < TO) n = TO;
      if (numEl.textContent !== String(n)) {
        numEl.textContent = String(n);
        // retrigger the per-number punch
        numEl.classList.remove("is-tick");
        void numEl.offsetWidth;
        numEl.classList.add("is-tick");
      }
      draw(elapsed);
    } else if (elapsed < TOTAL) {
      if (!cueEl.classList.contains("is-on")) cueEl.classList.add("is-on");
      draw(elapsed);
    } else {
      finish();
    }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    step(now);
  }

  function finish() {
    if (api.done) return;
    api.done = true;
    cancelAnimationFrame(raf);
    unlock();
    if (!root) return;
    root.classList.add("is-out");
    // remove once the slip has played, so it can never trap a click
    setTimeout(function () { if (root && root.parentNode) root.parentNode.removeChild(root); }, 1100);
  }

  function skip() { finish(); }

  function unlock() { document.documentElement.classList.remove("is-leading"); }

  function boot() {
    // Failsafe. The leader covers the page and html.is-leading kills
    // scrolling, so if rAF never runs — a stalled frame loop, a tab that
    // loaded in the background — the whole thing has to end itself. It ends
    // properly rather than just unlocking: unlocking alone would leave a
    // black overlay sitting there that you could scroll uselessly behind.
    setTimeout(function () { finish(); }, 6000);

    root = document.querySelector("[data-leader]");
    if (!root) { unlock(); api.done = true; return; }

    var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var seen = false;
    try { seen = sessionStorage.getItem("leader-seen") === "1"; } catch (e) {}

    if (reduced || seen) {
      root.parentNode.removeChild(root);
      unlock();
      api.done = true;
      return;
    }
    try { sessionStorage.setItem("leader-seen", "1"); } catch (e) {}

    cv = root.querySelector("canvas");
    ctx = cv.getContext("2d");
    numEl = root.querySelector("[data-leader-n]");
    cueEl = root.querySelector("[data-leader-cue]");
    brandEl = root.querySelector("[data-leader-brand]");

    sizeCanvas();
    addEventListener("resize", sizeCanvas);

    // any intent to move on ends it
    ["click", "keydown", "wheel", "touchstart"].forEach(function (ev) {
      addEventListener(ev, skip, { once: true, passive: true });
    });

    numEl.textContent = String(FROM);
    raf = requestAnimationFrame(loop);
  }

  function safeBoot() {
    try { boot(); } catch (e) { unlock(); api.done = true; }
  }
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", safeBoot);
  else safeBoot();

  return api;
})();
