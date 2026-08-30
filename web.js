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
    var SPOKES = opts.spokes || 24;
    var RINGS = opts.rings || 17;
    var CUT = opts.cut || 118;         // pointer radius, CSS px
    var CUT_RATE = opts.cutRate || 0.5;   // wipes to nothing in a few frames
    var HEAL = opts.heal || 0.003;     // ~5.5s to re-spin: the hole must last
    var PUSH = opts.push || 26;        // how far a strand is shoved aside

    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = 1;
    var nodes = [], edges = [], nodeHealth = [];
    var adj = [], edgeAt = null;      // adjacency, for walking the strands
    var spider = null, walk = 0;
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
        return {
          edges: edges.length, min: +min.toFixed(3), cut: cut, mending: mending,
          on: on, px: Math.round(px), py: Math.round(py),
          spider: spider ? { x: Math.round(spider.x), y: Math.round(spider.y),
                             from: spider.from, to: spider.to,
                             alert: +spider.alert.toFixed(2) } : null
        };
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
      var maxR = Math.sqrt(W * W + H * H) * 1.30;
      // a wider fan than a quarter turn, so the sheet wraps past the corner
      // and reaches the bottom-left rather than stopping on the diagonal
      var a0 = Math.PI * 0.42;          // above the downward vertical
      var a1 = Math.PI * 1.10;          // past the leftward horizontal

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

      // adjacency + an edge lookup, so the spider can only travel along real
      // strands and can be stopped by a cut one
      adj = [];
      for (var k = 0; k < nodes.length; k++) adj.push([]);
      edgeAt = new Map();
      for (var ei = 0; ei < edges.length; ei++) {
        var ed = edges[ei];
        adj[ed.a].push(ed.b);
        adj[ed.b].push(ed.a);
        edgeAt.set(ed.a * nodes.length + ed.b, ei);
        edgeAt.set(ed.b * nodes.length + ed.a, ei);
      }

      // drop the spider somewhere on-canvas
      var start = 0;
      for (var q = 0; q < nodes.length; q++) {
        if (nodes[q].hx > W * 0.25 && nodes[q].hx < W * 0.9 &&
            nodes[q].hy > H * 0.15 && nodes[q].hy < H * 0.7) { start = q; break; }
      }
      spider = { from: start, to: adj[start][0] != null ? adj[start][0] : start,
                 t: 0, x: nodes[start].hx, y: nodes[start].hy, ang: 0, alert: 0 };
    }

    function strandHealth(a, b) {
      var i = edgeAt ? edgeAt.get(a * nodes.length + b) : undefined;
      return i === undefined ? 0 : edges[i].h;
    }

    // Idle it ambles to a random neighbour. When the pointer is on the web it
    // heads for it, one strand at a time, always choosing the neighbour that
    // closes the distance — a real spider runs at a disturbance, and here the
    // pointer IS the disturbance, since it is what tears the web.
    function nextNode(sp, active) {
      var here = sp.to;
      var options = adj[here] || [];
      var best = -1, bestScore = Infinity;
      for (var i = 0; i < options.length; i++) {
        var cand = options[i];
        if (strandHealth(here, cand) < 0.25) continue;   // cut: cannot cross
        var score;
        if (active) {
          var dx = nodes[cand].x - px, dy = nodes[cand].y - py;
          score = dx * dx + dy * dy;
          if (cand === sp.from) score *= 1.6;            // prefer not to backtrack
        } else {
          score = Math.random() * 100;
          if (cand === sp.from) score += 140;
        }
        if (score < bestScore) { bestScore = score; best = cand; }
      }
      if (best === -1) return here;                      // hemmed in by cuts
      return best;
    }

    function stepSpider(active) {
      if (!spider || !nodes.length) return;
      var sp = spider;
      sp.alert += ((active ? 1 : 0) - sp.alert) * 0.06;

      var A = nodes[sp.from], B = nodes[sp.to];
      var len = Math.max(1, Math.hypot(B.x - A.x, B.y - A.y));
      var speed = (active ? 2.35 : 0.85) / len;          // px/frame, normalised
      sp.t += speed;
      walk += active ? 0.34 : 0.16;

      while (sp.t >= 1) {
        sp.t -= 1;
        var nxt = nextNode(sp, active);
        sp.from = sp.to;
        sp.to = nxt;
        A = nodes[sp.from]; B = nodes[sp.to];
      }

      var nx = A.x + (B.x - A.x) * sp.t;
      var ny = A.y + (B.y - A.y) * sp.t;
      var ta = Math.atan2(B.y - A.y, B.x - A.x);
      // turn smoothly rather than snapping at each junction
      var da = ((ta - sp.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      sp.ang += da * 0.18;
      sp.x = nx; sp.y = ny;
    }

    // Anatomy, roughly: a small cephalothorax in front, a larger rounder
    // abdomen behind, and four pairs of legs fanning from forward-out to
    // back-out. Each leg bends at a knee and the tarsus curls further out
    // and back, which is what gives a spider its shallow arched silhouette
    // from above. Legs taper — a femur drawn at the tarsus's width reads
    // like a stick insect.
    var LEGS = [
      { a: 0.62, f: 8.6, t: 9.4, bend: 0.62 },   // front pair, reaching
      { a: 1.16, f: 9.4, t: 10.2, bend: 0.50 },
      { a: 1.86, f: 9.0, t: 9.8, bend: -0.46 },
      { a: 2.42, f: 8.0, t: 8.8, bend: -0.60 }   // rear pair, trailing
    ];

    function drawSpider() {
      var sp = spider;
      if (!sp) return;
      if (sp.x < -60 || sp.x > W + 60 || sp.y < -60 || sp.y > H + 60) return;

      var tone = sp.alert > 0.5 ? AMBER : BONE;
      var a = 0.55 + sp.alert * 0.35;

      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(sp.ang);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (var side = -1; side <= 1; side += 2) {
        for (var i = 0; i < 4; i++) {
          var L = LEGS[i];
          // alternating tetrapod: 1 and 3 swing with the other side's 2 and 4
          var phase = walk + i * 1.9 + (side > 0 ? Math.PI : 0);
          var swing = Math.sin(phase);
          var ang = L.a + swing * 0.13;
          var reach = 1 + swing * 0.06;      // steps out a little as it swings

          var ax = 1.3, ay = side * 1.5;     // attachment on the cephalothorax
          var kx = ax + Math.cos(ang) * L.f * reach;
          var ky = ay + side * Math.sin(ang) * L.f * reach;
          var fx = kx + Math.cos(ang + L.bend) * L.t * reach;
          var fy = ky + side * Math.sin(ang + L.bend) * L.t * reach;

          ctx.strokeStyle = "rgba(" + tone + "," + a.toFixed(2) + ")";
          ctx.lineWidth = 1.15;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(kx, ky);
          ctx.stroke();

          ctx.lineWidth = 0.7;               // tarsus is thinner than the femur
          ctx.beginPath();
          ctx.moveTo(kx, ky);
          ctx.lineTo(fx, fy);
          ctx.stroke();
        }
      }

      // pedipalps — the short pair at the front that reads as "head end"
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = "rgba(" + tone + "," + (a * 0.85).toFixed(2) + ")";
      for (var p = -1; p <= 1; p += 2) {
        ctx.beginPath();
        ctx.moveTo(2.4, p * 0.9);
        ctx.lineTo(5.6, p * 2.2);
        ctx.stroke();
      }

      // abdomen, then cephalothorax over it
      ctx.fillStyle = "rgba(" + tone + "," + Math.min(1, a + 0.32).toFixed(2) + ")";
      ctx.beginPath();
      ctx.ellipse(-4.4, 0, 5.2, 4.1, 0, 0, 6.2832);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(1.1, 0, 2.9, 2.4, 0, 0, 6.2832);
      ctx.fill();

      // a darker seam down the abdomen so it is not a flat blob
      ctx.strokeStyle = "rgba(11,13,17,.55)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-7.6, 0);
      ctx.lineTo(-2.4, 0);
      ctx.stroke();

      ctx.restore();
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

      // the spider rides on top of its own web
      stepSpider(active);
      drawSpider();
    }

    resize();
    return api;
  }

  return { mount: mount };
})();
