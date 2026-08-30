/* ============================================================
   LEADER — a countdown before the reel starts.

   Counts 10 → 0 behind a full-screen leader, then slips up out of the
   gate and the page is there. Two rules make it feel deliberate rather
   than like a stall:

     · it always takes at least RAMP ms, even from a warm cache, so a
       fast load does not produce a meaningless flash of "0";
     · it never SHOWS 0 until the page has genuinely finished loading.
       The count parks on 1 and waits. So 0 always means ready.

     LEADER.step(nowMs)   advance by hand (rAF is paused in hidden tabs)
     LEADER.skip()        end it immediately
     LEADER.done          true once the page is clear
   ============================================================ */

window.LEADER = (function () {
  "use strict";

  var FROM = 10, TO = 0;
  var SLOTS = FROM - TO + 1;   // 11 numbers, each gets an equal share
  var RAMP = 2800;    // ms to count all the way down; floor on the intro
  var HOLD = 420;     // beat on 0 before the wipe
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

  // `frac` is how much of the dial is still filled: 1 at the start of the
  // count, 0 when it reaches zero.
  function draw(frac, elapsed) {
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

    // the arc — the number and the ring are the same fact
    var a0 = -Math.PI / 2;
    var a1 = a0 + frac * 6.2832;
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

    // The floor: the count always takes RAMP, however fast the page was.
    var ramp = clamp01(elapsed / RAMP);
    var n = FROM - Math.min(FROM - TO, Math.floor(ramp * SLOTS));

    // The ceiling: 0 is only ever shown once loading has actually
    // finished. If the page is still working, the count waits on 1.
    if (n <= TO && !loaded) n = TO + 1;

    if (n !== shown) {
      shown = n;
      numEl.textContent = n < 10 ? "0" + n : String(n);
    }
    // the arc empties as the number falls — same fact, drawn twice
    draw(1 - ramp, elapsed);

    if (n <= TO) {
      if (!cueEl.classList.contains("is-on")) cueEl.classList.add("is-on");
      // hold on zero so it registers, then go
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

    // Plays on EVERY load, not once per session — the loader is part of the
    // site, and a returning visitor should see it too. Reduced motion is the
    // only opt-out, and that one is not negotiable.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.parentNode.removeChild(root);
      unlock();
      api.done = true;
      return;
    }

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
    // never let a stuck resource hold the count on 1 forever
    setTimeout(markLoaded, 5000);

    sizeCanvas();
    addEventListener("resize", sizeCanvas);

    // Deliberately no skip-on-interaction. It used to end on any click,
    // key, wheel or touch — and a wheel fires the moment someone rests a
    // finger on the trackpad, so the count was routinely cut off partway.
    // It counts to zero and finishes on its own. LEADER.skip() still exists
    // for the console, and the failsafe above still covers a stalled loop.

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
