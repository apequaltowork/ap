/* ============================================================
   LEADER — a loading counter before the reel starts.

   Counts 0 → 100 behind a full-screen leader, then slips up out of the
   gate and the page is there. Two rules make it feel deliberate rather
   than like a stall:

     · it always takes at least RAMP ms, even from a warm cache, so a
       fast load does not produce a meaningless flash of "100";
     · it never SHOWS 100 until the page has genuinely finished loading.
       The ramp parks at 99 and waits. So 100 always means 100.

     LEADER.step(nowMs)   advance by hand (rAF is paused in hidden tabs)
     LEADER.skip()        end it immediately
     LEADER.done          true once the page is clear
   ============================================================ */

window.LEADER = (function () {
  "use strict";

  var RAMP = 2800;    // ms to climb 0 → 100, floor on the whole intro
  var HOLD = 420;     // beat at 100 before the wipe
  var TOTAL = RAMP + HOLD;

  var root, cv, ctx, numEl, cueEl;
  var t0 = null, raf = 0, W = 0, H = 0, dpr = 1;
  var loaded = false, shown = -1;

  var api = { done: false, step: step, skip: skip, total: TOTAL };

  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };

  function sizeCanvas() {
    if (!cv) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(pct, elapsed) {
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

    // the dial the progress runs around
    ctx.strokeStyle = "rgba(233,229,220,.16)";
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 6.2832);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.72, 0, 6.2832);
    ctx.stroke();

    // progress arc — the number and the ring are the same fact
    var a0 = -Math.PI / 2;
    var a1 = a0 + (pct / 100) * 6.2832;
    ctx.strokeStyle = "rgba(240,160,42,.9)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a1);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.lineCap = "butt";

    // a faint wedge trailing the arc, so the dial reads as swept
    ctx.fillStyle = "rgba(233,229,220,.045)";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0, a1);
    ctx.closePath();
    ctx.fill();

    // sparse dust, so the black is never dead flat
    ctx.fillStyle = "rgba(233,229,220,.05)";
    for (var d = 0; d < 26; d++) {
      var s = Math.sin(d * 12.9898 + Math.floor(elapsed / 90) * 78.233) * 43758.5453;
      var s2 = Math.sin(d * 4.1414 + Math.floor(elapsed / 90) * 12.345) * 24634.6345;
      ctx.fillRect((s - Math.floor(s)) * W, (s2 - Math.floor(s2)) * H, 1.5, 1.5);
    }
  }

  function step(now) {
    if (api.done || !root) return;
    if (t0 === null) t0 = now;
    var elapsed = now - t0;

    // The floor: the climb always takes RAMP, however fast the page was.
    var pct = Math.floor(clamp01(elapsed / RAMP) * 100);

    // The ceiling: 100 is only ever shown once loading has actually
    // finished. If the page is still working, the counter waits on 99.
    if (pct >= 100 && !loaded) pct = 99;

    if (pct !== shown) {
      shown = pct;
      numEl.textContent = pct < 10 ? "00" + pct : pct < 100 ? "0" + pct : "100";
    }
    draw(pct, elapsed);

    if (pct >= 100) {
      if (!cueEl.classList.contains("is-on")) cueEl.classList.add("is-on");
      // hold at 100 so it registers, then go
      if (elapsed >= RAMP + HOLD) finish();
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
    setTimeout(function () { if (root && root.parentNode) root.parentNode.removeChild(root); }, 1100);
  }

  function skip() { finish(); }

  function unlock() { document.documentElement.classList.remove("is-leading"); }

  function markLoaded() { loaded = true; }

  function boot() {
    // Failsafe. The leader covers the page and html.is-leading kills
    // scrolling, so if rAF never runs — a stalled frame loop, a tab that
    // loaded in the background — the whole thing has to end itself.
    setTimeout(function () { finish(); }, 9000);

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

    // what "loaded" actually means: the document is done and the webfonts
    // have resolved, since the whole page is set in them
    if (document.readyState === "complete") markLoaded();
    else addEventListener("load", markLoaded, { once: true });
    if (document.fonts && document.fonts.ready) {
      var docDone = new Promise(function (res) {
        if (document.readyState === "complete") res();
        else addEventListener("load", res, { once: true });
      });
      Promise.all([document.fonts.ready, docDone]).then(markLoaded);
    }
    // never let a stuck resource hold the counter on 99 forever
    setTimeout(markLoaded, 5000);

    sizeCanvas();
    addEventListener("resize", sizeCanvas);

    ["click", "keydown", "wheel", "touchstart"].forEach(function (ev) {
      addEventListener(ev, skip, { once: true, passive: true });
    });

    numEl.textContent = "000";
    raf = requestAnimationFrame(loop);
  }

  function safeBoot() {
    try { boot(); } catch (e) { unlock(); api.done = true; }
  }
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", safeBoot);
  else safeBoot();

  return api;
})();
