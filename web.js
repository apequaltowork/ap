/* ============================================================
   WEB — a spider web the pointer tears, and that re-spins itself.

   Anchored just outside the top-right corner, so the spokes fan down
   and left across the panel the way a real web sits in a corner. Radial
   spokes, chords between them, and a slight per-node jitter so nothing
   reads as machined.

   Every strand carries `health` 0..1. The pointer cuts health fast
   wherever it passes; health then regrows slowly, and a strand still
   below full strength is drawn amber — so you can see the web being
   re-spun rather than just fading back.

   Nodes are sprung: the pointer pushes them aside and they settle back,
   which makes the whole sheet elastic rather than a static drawing.

     WEB.mount(canvas, opts) -> { frame(now), at(x, y), leave(), resize() }
   ============================================================ */

window.WEB = (function () {
  "use strict";

  var BONE = "233,229,220";
  var AMBER = "240,160,42";

  function mount(canvas, opts) {
    opts = opts || {};
    // Density for a full-screen span. The strand count has to rise with the
    // area or the spacing opens up and it reads as a wireframe, not a web.
    var SPOKES = opts.spokes || 21;
    var RINGS = opts.rings || 14;
    var CUT = opts.cut || 118;         // pointer radius, CSS px
    var CUT_RATE = opts.cutRate || 0.5;   // wipes to nothing in a few frames
    var HEAL = opts.heal || 0.003;     // ~5.5s to re-spin: the hole must last
    var PUSH = opts.push || 26;        // how far a strand is shoved aside

    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = 1;
    var nodes = [], edges = [], nodeHealth = [];
    var px = -9999, py = -9999, on = false;

    var api = {
      frame: frame, at: at, leave: leave, resize: resize,
      // strand health at a glance — the effect is invisible to the DOM, so
      // without this the only way to check it is counting canvas pixels
      stats: function () {
        var min = 1, cut = 0, mending = 0;
        for (var i = 0; i < edges.length; i++) {
          if (edges[i].h < min) min = edges[i].h;
          if (edges[i].h <= 0.02) cut++;
          else if (edges[i].h < 0.92) mending++;
        }
        return { edges: edges.length, min: +min.toFixed(3), cut: cut, mending: mending, on: on, px: Math.round(px), py: Math.round(py) };
      }
    };

    // deterministic jitter — the web must not reshuffle on every resize
    function hash(i) {
      var x = Math.sin(i * 127.1) * 43758.5453;
      return x - Math.floor(x);
    }

    function build() {
      nodes = [];
      edges = [];
      if (!W || !H) return;

      // anchor just off the top-right corner
      var ax = W * 1.04, ay = -H * 0.06;
      var maxR = Math.sqrt(W * W + H * H) * 1.12;
      var a0 = Math.PI * 0.52;          // pointing down
      var a1 = Math.PI * 1.02;          // round to pointing left

      for (var s = 0; s < SPOKES; s++) {
        var t = s / (SPOKES - 1);
        var ang = a0 + (a1 - a0) * t + (hash(s * 7) - 0.5) * 0.045;
        for (var r = 0; r < RINGS; r++) {
          var rt = r / (RINGS - 1);
          // tighter near the anchor, like a real capture spiral
          var rad = maxR * Math.pow(0.10 + 0.90 * rt, 1.22);
          rad *= 1 + (hash(s * 31 + r * 17) - 0.5) * 0.05;
          nodes.push({
            hx: ax + Math.cos(ang) * rad,
            hy: ay + Math.sin(ang) * rad,
            x: 0, y: 0, vx: 0, vy: 0, s: s, r: r
          });
        }
      }
      nodes.forEach(function (n) { n.x = n.hx; n.y = n.hy; });
      nodeHealth = new Array(nodes.length).fill(1);

      var at2 = function (s, r) { return s * RINGS + r; };
      for (var si = 0; si < SPOKES; si++) {
        for (var ri = 0; ri < RINGS; ri++) {
          // radial strand, outward along the spoke
          if (ri < RINGS - 1) edges.push({ a: at2(si, ri), b: at2(si, ri + 1), h: 1 });
          // chord to the next spoke — the capture spiral
          if (si < SPOKES - 1) edges.push({ a: at2(si, ri), b: at2(si + 1, ri), h: 1 });
        }
      }
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = rect.width; H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function at(x, y) { px = x; py = y; on = true; }
    function leave() { on = false; px = py = -9999; }

    function frame() {
      if (!W || !nodes.length) return;
      ctx.clearRect(0, 0, W, H);

      var cut2 = CUT * CUT;
      var i, n;

      // Only cut where the web is actually drawn. The geometry runs well
      // outside the canvas — spokes reach hundreds of px to the left — so a
      // pointer on the far side of the screen still maps inside the web and
      // was quietly shredding strands nobody can see, which then never healed
      // because it kept re-cutting them.
      var active = on &&
        px > -CUT && px < W + CUT &&
        py > -CUT && py < H + CUT;

      // nodes: shoved by the pointer, sprung back to where they were spun
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        var ax = (n.hx - n.x) * 0.055;
        var ay = (n.hy - n.y) * 0.055;
        if (active) {
          var dx = n.x - px, dy = n.y - py;
          var d2 = dx * dx + dy * dy;
          if (d2 < cut2 * 2.2 && d2 > 0.01) {
            var d = Math.sqrt(d2);
            var f = (1 - d / (CUT * 1.48)) * PUSH * 0.06;
            if (f > 0) { ax += (dx / d) * f; ay += (dy / d) * f; }
          }
        }
        n.vx = (n.vx + ax) * 0.86;
        n.vy = (n.vy + ay) * 0.86;
        n.x += n.vx;
        n.y += n.vy;
      }

      for (i = 0; i < nodes.length; i++) nodeHealth[i] = 0;

      // strands: cut on contact, then re-spin
      for (i = 0; i < edges.length; i++) {
        var e = edges[i];
        var A = nodes[e.a], B = nodes[e.b];
        var mx = (A.x + B.x) * 0.5, my = (A.y + B.y) * 0.5;

        if (active) {
          var ex = mx - px, ey = my - py;
          var ed2 = ex * ex + ey * ey;
          if (ed2 < cut2) {
            e.h -= CUT_RATE * (1 - Math.sqrt(ed2) / CUT);
            if (e.h < 0) e.h = 0;
          }
        }
        if (e.h < 1) {
          e.h += HEAL;
          if (e.h > 1) e.h = 1;
        }
        if (e.h > nodeHealth[e.a]) nodeHealth[e.a] = e.h;
        if (e.h > nodeHealth[e.b]) nodeHealth[e.b] = e.h;
        if (e.h <= 0.02) continue;

        // Brightness tracks health, so a cut area is genuinely dark. The
        // amber only marks a strand as being re-spun; it must never make a
        // half-cut strand brighter than a whole one, or dragging the pointer
        // lights the web up instead of erasing it.
        var mending = e.h < 0.92;
        var alpha = e.h * (mending ? 0.55 : 0.42);
        ctx.strokeStyle = "rgba(" + (mending ? AMBER : BONE) + "," + alpha.toFixed(3) + ")";
        ctx.lineWidth = mending ? 1.05 : 0.85;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.stroke();
      }

      // junction dots, brightest where the web is whole
      // junction dots fade with the strands meeting there, so a wiped patch
      // loses its nodes too rather than leaving a grid of orphan specks
      for (i = 0; i < nodes.length; i += 2) {
        n = nodes[i];
        if (n.x < -20 || n.x > W + 20 || n.y < -20 || n.y > H + 20) continue;
        var nh = nodeHealth[i] || 0;
        if (nh <= 0.05) continue;
        ctx.fillStyle = "rgba(" + BONE + "," + (nh * 0.34).toFixed(3) + ")";
        ctx.fillRect(n.x - 0.9, n.y - 0.9, 1.8, 1.8);
      }
    }

    resize();
    return api;
  }

  return { mount: mount };
})();
