/* ============================================================
   LATENT — the choreography. Every act is a function of one number:
   how far the reel has run through that section.
   ============================================================ */

(function () {
  "use strict";

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var pad2 = function (n) { return (n < 10 ? "0" : "") + n; };

  /* ── 01 · slate: title swings up on load ───────────────────── */

  var title = $("[data-chars]");
  if (title) {
    RIG.chars(title, 0.055);
    var lift = function () {
      // Force a style flush so the .ch start state is committed, then release.
      // (rAF would be the usual trick, but it never fires if the page loads in
      // a background tab — the hero would stay invisible until it was focused.)
      void title.offsetHeight;
      title.classList.add("is-in");
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(lift);
    else setTimeout(lift, 120);
  }

  // everything tagged data-rise fades up the first time it appears
  RIG.reveal($$("[data-rise]"));

  // the end card headline splits too, but waits for the scroll
  var endH = $("[data-chars-scroll]");
  if (endH) { RIG.chars(endH, 0.04); RIG.reveal([endH]); }

  /* ── 01 · slate: the pointer develops the latent image ─────── */

  var revCv = $("[data-reveal]");
  var revImg = $("[data-reveal-src]");

  // Needs hover, so fine pointers only — on touch the latent layer stands
  // alone. Reduced motion opts out of the whole effect.
  if (revCv && revImg && !RIG.reduced && !RIG.coarse) {
    var rev = REVEAL.mount(revCv, revImg, {
      radius: 132,
      decay: 0.016,
      posX: 0.54,   // must match background-position in styles.css, or the
      posY: 0.32    // developed layer sits offset from the latent one
    });

    var rbox = { left: 0, topDoc: 0 };
    var rmeasure = function () {
      var r = revCv.getBoundingClientRect();
      rbox.left = r.left;
      rbox.topDoc = r.top + window.scrollY;
      rev.resize();
    };
    rmeasure();
    addEventListener("resize", rmeasure);
    revImg.addEventListener("load", rmeasure, { once: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(rmeasure);

    var rptr = { cx: -9999, cy: -9999, on: false };
    addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      rptr.cx = e.clientX; rptr.cy = e.clientY; rptr.on = true;
    }, { passive: true });
    addEventListener("pointerleave", function () { rptr.on = false; rev.leave(); });
    addEventListener("blur", function () { rptr.on = false; rev.leave(); });

    RIG.frame(function (y) {
      // nothing to do once the hero has left, unless a trail is still fixing
      var gone = y > innerHeight * 1.1;
      if (gone && rev.idle) return;

      if (rptr.on && !gone) {
        rev.at(rptr.cx - rbox.left, rptr.cy - (rbox.topDoc - y));
      } else {
        rev.at(-9999, -9999);
      }
      rev.frame(performance.now());
    });
  }

  /* ── 02 · thesis: words come up out of the developer ───────── */

  var FAINT = [0x44, 0x4B, 0x55];
  var BONE  = [0xE9, 0xE5, 0xDC];
  var AMBER = [0xF0, 0xA0, 0x2A];

  function mix(a, b, t) {
    return "rgb(" +
      Math.round(a[0] + (b[0] - a[0]) * t) + "," +
      Math.round(a[1] + (b[1] - a[1]) * t) + "," +
      Math.round(a[2] + (b[2] - a[2]) * t) + ")";
  }

  var thesis = $("[data-thesis]");
  if (thesis) {
    var ws = RIG.words(thesis);
    var wn = ws.length;
    // The head runs past both ends so the first word is not already lit
    // at p = 0 and the last one still gets its moment at p = 1.
    RIG.track(thesis.closest(".act"), function (p) {
      var head = p * (wn + 6) - 3;
      for (var i = 0; i < wn; i++) {
        var a = RIG.clamp01((head - i) / 2.2);       // arrival, 0 → 1
        var glow = Math.sin(Math.PI * a);            // peaks mid-arrival
        var col = mix(FAINT, BONE, RIG.smoothstep(0, 1, a));
        if (glow > 0.02) col = mix(hexish(col), AMBER, glow * 0.8);
        var s = ws[i].style;
        s.color = col;
        s.transform = "translate3d(0," + ((1 - a) * 9).toFixed(2) + "px,0)";
      }
    });
  }

  // rgb() string → array, so a mixed colour can be mixed again
  function hexish(rgb) {
    var m = rgb.match(/\d+/g);
    return [+m[0], +m[1], +m[2]];
  }

  /* ── filmstrips scrubbed sideways ──────────────────────────── */

  // One per strip act — services and work each get their own. This used to be
  // a single querySelector, which silently left every strip after the first
  // completely inert: no scrub, no counter.
  $$("[data-strip]").forEach(function (strip) {
    var act = strip.closest(".act");
    var stripTrack = act && act.querySelector("[data-strip-track]");
    // the counter lives in .strip__hint, a sibling of .strip — scope the
    // lookup to the act, not to the strip
    var stripCount = act && act.querySelector("[data-strip-count]");
    if (!act || !stripTrack) return;

    var travel = 0;
    var measureStrip = function () {
      travel = Math.max(0, stripTrack.scrollWidth - strip.clientWidth);
    };
    measureStrip();
    addEventListener("resize", measureStrip);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureStrip);

    var frames = $$(".frame", stripTrack);
    RIG.track(act, function (p) {
      stripTrack.style.transform = "translate3d(" + (-p * travel).toFixed(1) + "px,0,0)";
      if (stripCount) {
        stripCount.textContent = pad2(Math.min(frames.length, Math.floor(p * frames.length) + 1));
      }
    });
  });

  /* ── 04 · work: sticky plate swaps as the dossier scrolls ──── */

  var works = $("[data-works]");
  if (works) {
    var plates = $$("[data-shot]", works);
    var panels = $$("[data-panel]", works);
    var workCount = $("[data-work-count]", works);
    // `pn`, not `wn`: this file is one IIFE and `var` is function-scoped, so
    // reusing the thesis block's `wn` silently overwrote its word count and
    // stopped the wavefront dead after the sixth word.
    var pn = Math.min(plates.length, panels.length);
    var lastShot = -1;

    RIG.track(works.closest(".act"), function (p) {
      // One project per screen of runway. The visual and its panel share a
      // single window, but the plate holds a slow push-in across its whole
      // turn while the copy cuts in tighter — so the image reads as
      // continuous and the text as a card change.
      var t = 0.5 + p * (pn - 1);
      for (var i = 0; i < pn; i++) {
        var d = t - i;

        // The plates WIPE rather than dissolve. Each one is a full-bleed
        // layer stacked in document order, so revealing plate i from the
        // left simply uncovers it over plate i-1 — both projects are legible
        // through the whole move, which a cross-fade cannot do. Runs the same
        // in reverse when scrolling back up.
        var w = RIG.clamp01(0.5 - d);              // 1 = hidden, 0 = full
        var e = RIG.smoothstep(0, 1, w);
        var ps = plates[i].style;
        ps.setProperty("--w", e.toFixed(4));
        // the leading edge only exists mid-wipe
        ps.setProperty("--edge", e > 0.001 && e < 0.999 ? "1" : "0");

        // the copy still cross-fades — wiping text would be unreadable
        var v = RIG.clamp01(1 - Math.abs(d - 0.5) / 0.78);
        var ns = panels[i].style;
        ns.opacity = RIG.smoothstep(0, 0.62, v).toFixed(3);
        ns.transform = "translate3d(0," + ((0.5 - d) * 34).toFixed(1) + "px,0)";
      }

      var idx = Math.min(pn - 1, Math.max(0, Math.round(t - 0.5)));
      if (idx !== lastShot) {
        lastShot = idx;
        if (workCount) workCount.textContent = pad2(idx + 1);
      }

      // The rail fill is pure CSS off this one variable — see .works__rail-fill
      works.style.setProperty("--progress", p.toFixed(4));
    });
  }

  /* ── 05 · process: one step at a time, cross-faded ─────────── */

  var seq = $("[data-seq]");
  if (seq) {
    var steps = $$(".step", seq);
    var railItems = $$("[data-rail] li");
    var n = steps.length;
    var lastIdx = -1;

    RIG.track(seq.closest(".act"), function (p) {
      // 0.5 → n-0.5 so the first and last steps are dead centre at the ends
      var t = 0.5 + p * (n - 1);

      for (var i = 0; i < n; i++) {
        var d = t - i;                                        // 0..1 = this step's turn
        var v = RIG.clamp01(1 - Math.abs(d - 0.5) / 0.72);
        var a = RIG.smoothstep(0, 0.42, v);
        var st = steps[i].style;
        st.opacity = a.toFixed(3);
        st.transform = "translate3d(0," + ((0.5 - d) * 64).toFixed(1) + "px,0)";
        st.filter = a > 0.985 ? "none" : "blur(" + ((1 - a) * 4.5).toFixed(2) + "px)";
        st.pointerEvents = a > 0.5 ? "auto" : "none";
      }

      var idx = Math.min(n - 1, Math.max(0, Math.round(t - 0.5)));
      if (idx !== lastIdx) {
        lastIdx = idx;
        for (var k = 0; k < railItems.length; k++) {
          railItems[k].classList.toggle("is-on", k === idx);
          railItems[k].classList.toggle("is-done", k < idx);
        }
      }
    });
  }

  /* ── fixed chrome: sprockets, playhead, timecode ───────────── */

  var sprockets = $("[data-sprockets]");
  var playhead = $("[data-playhead]");
  var timecode = $("[data-timecode]");
  var RUNTIME = 252;   // 00:04:12 — the figure printed on the slate
  var FPS = 24;

  RIG.frame(function (y, gp) {
    if (sprockets) sprockets.style.backgroundPosition = "center " + (-y * 0.42).toFixed(0) + "px";
    if (playhead) playhead.style.transform = "scaleX(" + gp.toFixed(4) + ")";
    if (timecode) {
      var f = Math.round(gp * RUNTIME * FPS);
      timecode.textContent =
        "00:" + pad2(Math.floor(f / (60 * FPS))) +
        ":" + pad2(Math.floor(f / FPS) % 60) +
        ":" + pad2(f % FPS);
    }
  });

  /* ── reel index: highlight whichever act owns the middle ───── */

  var links = $$(".reel");
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });

  var acts = $$(".act");
  if (acts.length && "IntersectionObserver" in window) {
    var navIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var link = byId[e.target.id];
        if (!link) return;
        if (e.isIntersecting) {
          links.forEach(function (l) { l.classList.remove("is-active"); });
          link.classList.add("is-active");
        }
      });
    }, { rootMargin: "-48% 0px -48% 0px", threshold: 0 });
    acts.forEach(function (a) { navIo.observe(a); });
  }

  // in-page links ride the same lerp as the wheel — no interstitial. A
  // site-wide curtain on every menu click read as ceremony around navigation
  // rather than as part of the work; the motion budget went to the portfolio
  // slider instead.
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var el = document.getElementById(a.getAttribute("href").slice(1));
      if (!el) return;
      e.preventDefault();
      RIG.to(el.getBoundingClientRect().top + window.scrollY);
    });
  });

  /* ── frame slip: a frame passes the gate on act handover ───── */

  // Turned off for now. Flip to true to bring the band back — the markup,
  // CSS and logic all stay in place, nothing was deleted.
  var SLIP_ENABLED = false;

  var slip = $("[data-slip]");
  if (SLIP_ENABLED && slip && !RIG.reduced) {
    var bounds = [];
    var lastAct = -1;
    var slipUntil = 0;

    var measureActs = function () {
      bounds = $$(".act").map(function (a) {
        return a.getBoundingClientRect().top + window.scrollY;
      });
      lastAct = -1;
    };
    measureActs();
    addEventListener("resize", measureActs);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureActs);

    RIG.frame(function (y) {
      // which act owns the middle of the screen?
      var mid = y + innerHeight * 0.5;
      var idx = 0;
      for (var i = 0; i < bounds.length; i++) if (mid >= bounds[i]) idx = i;

      if (lastAct === -1) { lastAct = idx; return; }   // no slip on first frame
      if (idx === lastAct) return;
      lastAct = idx;

      // rate-limit: one slip per handover, never a stutter on a fast scroll
      var now = performance.now();
      if (now < slipUntil) return;
      slipUntil = now + 420;

      slip.classList.remove("is-on");
      void slip.offsetWidth;
      slip.classList.add("is-on");
    });
  }
})();
