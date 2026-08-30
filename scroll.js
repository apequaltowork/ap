/* ============================================================
   RIG — a tiny dependency-free stand-in for Lenis + ScrollTrigger.
   ~200 lines, one rAF loop, no layout writes during scroll.

     RIG.track(el, fn)    fn(progress 0..1) while el is pinned
     RIG.through(el, fn)  fn(progress 0..1) as el crosses the viewport
     RIG.frame(fn)        fn(scrollY, pageProgress) every frame
     RIG.reveal(sel)      add .is-in when the element first appears
     RIG.chars(el)        split text into per-character spans
     RIG.words(el)        split text into per-word spans
     RIG.to(y)            smooth-scroll to a document position
   ============================================================ */

window.RIG = (function () {
  "use strict";

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var clamp01 = function (v) { return clamp(v, 0, 1); };

  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = matchMedia("(pointer: coarse)").matches;

  /* ── smooth scroll ────────────────────────────────────────
     Wheel is intercepted and fed into a lerped target, then written
     back with scrollTo. Native scroll position stays authoritative,
     so `position: sticky` and anchors keep working — which is the
     whole reason to do it this way rather than transforming a wrapper.
     ──────────────────────────────────────────────────────── */

  var SS = {
    on: !reduced && !coarse,
    target: 0,
    current: 0,
    applied: 0,
    ease: 0.11,

    max: function () {
      return Math.max(0, document.documentElement.scrollHeight - innerHeight);
    },

    init: function () {
      this.target = this.current = this.applied = window.scrollY;
      if (!this.on) return;
      document.documentElement.classList.add("has-smooth");

      var self = this;

      addEventListener("wheel", function (e) {
        if (e.ctrlKey) return;              // pinch-zoom belongs to the browser
        e.preventDefault();
        var d = e.deltaY;
        if (e.deltaMode === 1) d *= 16;     // lines
        else if (e.deltaMode === 2) d *= innerHeight;
        self.target = clamp(self.target + d, 0, self.max());
      }, { passive: false });

      addEventListener("keydown", function (e) {
        var t = e.target;
        if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
        if (t && t.isContentEditable) return;
        var page = innerHeight * 0.88;
        var d = null;
        if (e.key === "PageDown" || (e.key === " " && !e.shiftKey)) d = page;
        else if (e.key === "PageUp" || (e.key === " " && e.shiftKey)) d = -page;
        else if (e.key === "ArrowDown") d = 120;
        else if (e.key === "ArrowUp") d = -120;
        else if (e.key === "Home") d = -self.max();
        else if (e.key === "End") d = self.max();
        if (d === null) return;
        e.preventDefault();
        self.target = clamp(self.target + d, 0, self.max());
      });
    },

    update: function () {
      if (!this.on) return;
      // Something outside us moved the page (scrollbar drag, find-in-page,
      // focus jump). Adopt it instead of fighting it.
      if (Math.abs(window.scrollY - this.applied) > 2) {
        this.target = this.current = this.applied = window.scrollY;
        return;
      }
      var max = this.max();
      if (this.target > max) this.target = max;
      if (this.target < 0) this.target = 0;

      var d = this.target - this.current;
      if (Math.abs(d) < 0.08) this.current = this.target;
      else this.current += d * this.ease;

      if (Math.abs(this.current - this.applied) >= 0.05) {
        this.applied = this.current;
        window.scrollTo(0, this.current);
      }
    },

    to: function (y) {
      y = clamp(y, 0, this.max());
      if (this.on) this.target = y;
      else window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
    },

    // Instant, no lerp — for landing a position that must not be seen being
    // eased into (behind an overlay, or when restoring a saved position).
    // Nothing calls it today; it is the counterpart to `to` and costs 5 lines.
    jump: function (y) {
      y = clamp(y, 0, this.max());
      this.target = this.current = this.applied = y;
      window.scrollTo(0, y);
    }
  };

  /* ── trigger registry ─────────────────────────────────────
     Geometry is measured once per resize, never per frame — reading
     getBoundingClientRect inside the loop is what makes hand-rolled
     scroll rigs stutter.
     ──────────────────────────────────────────────────────── */

  var tracks = [];
  var frames = [];
  var vh = innerHeight;
  var pageMax = 0;

  function measure() {
    vh = innerHeight;
    pageMax = SS.max();
    for (var i = 0; i < tracks.length; i++) {
      var t = tracks[i];
      var r = t.el.getBoundingClientRect();
      t.top = r.top + window.scrollY;
      t.h = r.height;
      // Measure the sticky child rather than assuming innerHeight: on mobile
      // svh and innerHeight diverge as the browser chrome hides, and the
      // scrub would never quite reach 0 or 1.
      var pin = t.el.querySelector(".pin");
      t.pinH = pin ? pin.offsetHeight : vh;
      t.last = -1;
    }
  }

  function progressOf(t, y) {
    if (t.mode === "through") {
      // 0 when the element's top hits the bottom edge, 1 when its
      // bottom clears the top edge.
      return clamp01((y + vh - t.top) / (t.h + vh));
    }
    // pinned: the section is (len + 1) screens tall, one screen is the pin
    var span = t.h - (t.pinH || vh);
    return span <= 0 ? 0 : clamp01((y - t.top) / span);
  }

  function loop() {
    requestAnimationFrame(loop);
    tick();
  }

  // One frame of work, callable by hand — the rAF loop is paused whenever
  // the tab is hidden, so tests and debugging need a way to step it.
  function tick() {
    SS.update();

    var y = window.scrollY;
    var i, t, p;

    for (i = 0; i < tracks.length; i++) {
      t = tracks[i];
      p = progressOf(t, y);
      if (p !== t.last) { t.last = p; t.fn(p, t.el); }
    }

    var gp = pageMax > 0 ? clamp01(y / pageMax) : 0;
    for (i = 0; i < frames.length; i++) frames[i](y, gp);
  }

  /* ── text splitting ───────────────────────────────────────── */

  function chars(el, stagger) {
    stagger = stagger == null ? 0.035 : stagger;
    var text = el.textContent;
    el.textContent = "";
    var n = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === " ") { el.appendChild(document.createTextNode(" ")); continue; }
      var mask = document.createElement("span");
      mask.className = "chline";
      var span = document.createElement("span");
      span.className = "ch";
      span.textContent = c;
      span.style.setProperty("--d", (n * stagger).toFixed(3) + "s");
      mask.appendChild(span);
      el.appendChild(mask);
      n++;
    }
    return el;
  }

  function words(el) {
    var out = [];
    var lines = el.querySelectorAll("[data-line], p");
    var targets = lines.length ? lines : [el];
    for (var i = 0; i < targets.length; i++) {
      var node = targets[i];
      var parts = node.textContent.trim().split(/\s+/);
      node.textContent = "";
      for (var j = 0; j < parts.length; j++) {
        var w = document.createElement("span");
        w.className = "w";
        w.textContent = parts[j];
        node.appendChild(w);
        if (j < parts.length - 1) node.appendChild(document.createTextNode(" "));
        out.push(w);
      }
    }
    return out;
  }

  /* ── reveal on first appearance ───────────────────────────── */

  var io = null;
  function reveal(nodes) {
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            entries[i].target.classList.add("is-in");
            io.unobserve(entries[i].target);
          }
        }
      }, { rootMargin: "0px 0px -12% 0px", threshold: 0.15 });
    }
    for (var i = 0; i < nodes.length; i++) io.observe(nodes[i]);
  }

  /* ── boot ─────────────────────────────────────────────────── */

  var API = {
    reduced: reduced,
    coarse: coarse,
    clamp: clamp,
    clamp01: clamp01,
    lerp: function (a, b, t) { return a + (b - a) * t; },
    smoothstep: function (e0, e1, x) {
      var t = clamp01((x - e0) / (e1 - e0));
      return t * t * (3 - 2 * t);
    },
    track: function (el, fn) { if (el) { tracks.push({ el: el, fn: fn, mode: "pin", last: -1 }); } return API; },
    through: function (el, fn) { if (el) { tracks.push({ el: el, fn: fn, mode: "through", last: -1 }); } return API; },
    frame: function (fn) { frames.push(fn); return API; },
    reveal: reveal,
    chars: chars,
    words: words,
    to: function (y) { SS.to(y); },
    jump: function (y) { SS.jump(y); },
    measure: measure,
    tick: tick
  };

  function boot() {
    SS.init();
    measure();
    loop();

    var t = null;
    addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(measure, 120);
    });
    // Web fonts change every measurement on this page.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    addEventListener("load", measure);
  }

  if (document.readyState === "loading") addEventListener("DOMContentLoaded", boot);
  else boot();

  return API;
})();
