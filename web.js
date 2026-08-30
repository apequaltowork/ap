/* ============================================================
   WEB — an intact web, a cursor that makes it ring, and a spider
   that hunts the vibration.

   The earlier version had the cursor tear the web while the spider ran
   toward it, which asked the pointer to be a threat and prey at once.
   Here there is one story: the cursor disturbs the web, the spider feels
   the disturbance and comes, and if you linger it catches you.

   · The web never breaks. The pointer sends a ripple through it — a
     radial wave falling off with distance — so it stays responsive
     without ever leaving holes, and the sheet is always at its best.
   · That ripple is also the fiction for how the spider finds you: a real
     spider reads vibration in the silk rather than seeing.
   · The catch is drawn on the canvas at the pointer. The real cursor is
     never hidden, moved or trapped — doing that reads as a broken page.
   · It will not hunt over the form. Someone aiming at a field must never
     have a spider racing at their pointer.

     WEB.mount(canvas, opts) -> {
       frame(now), at(x, y, huntable), leave(), resize(), stats()
     }
   ============================================================ */

window.WEB = (function () {
  "use strict";

  var BONE = "233,229,220";
  var AMBER = "240,160,42";

  function mount(canvas, opts) {
    opts = opts || {};
    var SPOKES = opts.spokes || 24;
    var RINGS = opts.rings || 17;

    var RIPPLE_R = opts.rippleRadius || 190;   // how far a disturbance carries
    var RIPPLE_AMP = opts.rippleAmp || 7;      // px of travel at the centre

    // The spider is deliberately slower than a moving cursor, so a catch only
    // happens if you linger. Being caught should feel like your own fault.
    var SPEED_IDLE = opts.speedIdle || 0.85;
    var SPEED_HUNT = opts.speedHunt || 2.6;
    var CATCH_R = opts.catchRadius || 26;
    // Above this pointer speed you cannot be pinned. Proximity alone was
    // enough before, so brushing past the spider at speed counted as a
    // catch — which feels arbitrary. Struggling prey gets away.
    var ESCAPE_SPEED = opts.escapeSpeed || 5.5;   // px per frame
    var CATCH_HOLD = opts.catchHold || 95;     // frames spent wrapping
    var CATCH_COOLDOWN = opts.catchCooldown || 150;

    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = 1;
    var nodes = [], edges = [], adj = [];
    var spider = null, walk = 0, now = 0;
    var px = -9999, py = -9999, on = false, huntable = false;
    var pspeed = 0;
    var caught = null, cooldown = 0;

    var api = {
      frame: frame, at: at, leave: leave, resize: resize,
      stats: function () {
        return {
          edges: edges.length, on: on, huntable: huntable,
          px: Math.round(px), py: Math.round(py), pspeed: +pspeed.toFixed(2),
          caught: caught ? { x: Math.round(caught.x), y: Math.round(caught.y), t: caught.t } : null,
          cooldown: cooldown,
          spider: spider ? {
            x: Math.round(spider.x), y: Math.round(spider.y),
            alert: +spider.alert.toFixed(2), held: spider.held
          } : null
        };
      }
    };

    function hash(i) {
      var x = Math.sin(i * 127.1) * 43758.5453;
      return x - Math.floor(x);
    }

    function build() {
      nodes = []; edges = [];
      if (!W || !H) return;

      var ax = W * 1.04, ay = -H * 0.06;
      var maxR = Math.sqrt(W * W + H * H) * 1.30;
      var a0 = Math.PI * 0.42, a1 = Math.PI * 1.10;

      for (var s = 0; s < SPOKES; s++) {
        var t = s / (SPOKES - 1);
        var ang = a0 + (a1 - a0) * t + (hash(s * 7) - 0.5) * 0.045;
        for (var r = 0; r < RINGS; r++) {
          var rt = r / (RINGS - 1);
          var rad = maxR * Math.pow(0.10 + 0.90 * rt, 1.22);
          rad *= 1 + (hash(s * 31 + r * 17) - 0.5) * 0.05;
          nodes.push({
            hx: ax + Math.cos(ang) * rad, hy: ay + Math.sin(ang) * rad,
            x: 0, y: 0, vx: 0, vy: 0, rx: 0, ry: 0
          });
        }
      }
      nodes.forEach(function (n) { n.x = n.hx; n.y = n.hy; });

      var at2 = function (s, r) { return s * RINGS + r; };
      for (var si = 0; si < SPOKES; si++) {
        for (var ri = 0; ri < RINGS; ri++) {
          if (ri < RINGS - 1) edges.push({ a: at2(si, ri), b: at2(si, ri + 1) });
          if (si < SPOKES - 1) edges.push({ a: at2(si, ri), b: at2(si + 1, ri) });
        }
      }

      adj = [];
      for (var k = 0; k < nodes.length; k++) adj.push([]);
      for (var ei = 0; ei < edges.length; ei++) {
        adj[edges[ei].a].push(edges[ei].b);
        adj[edges[ei].b].push(edges[ei].a);
      }

      var start = 0;
      for (var q = 0; q < nodes.length; q++) {
        if (nodes[q].hx > W * 0.3 && nodes[q].hx < W * 0.85 &&
            nodes[q].hy > H * 0.2 && nodes[q].hy < H * 0.65) { start = q; break; }
      }
      spider = {
        from: start, to: adj[start][0] != null ? adj[start][0] : start,
        t: 0, x: nodes[start].hx, y: nodes[start].hy, ang: 0, alert: 0, held: 0
      };
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

    function at(x, y, ok) {
      if (on) {
        var inst = Math.hypot(x - px, y - py);
        if (inst < 400) pspeed = pspeed * 0.7 + inst * 0.3;   // ignore teleports
      }
      px = x; py = y; on = true; huntable = ok !== false;
    }
    function leave() { on = false; huntable = false; px = py = -9999; pspeed = 0; }

    /* ── the spider ─────────────────────────────────────────── */

    function nextNode(sp, hunting) {
      var here = sp.to, options = adj[here] || [];
      var best = -1, bestScore = Infinity;
      for (var i = 0; i < options.length; i++) {
        var c = options[i], score;
        if (hunting) {
          var dx = nodes[c].x - px, dy = nodes[c].y - py;
          score = dx * dx + dy * dy;
          if (c === sp.from) score *= 1.6;
        } else {
          score = Math.random() * 100;
          if (c === sp.from) score += 140;
        }
        if (score < bestScore) { bestScore = score; best = c; }
      }
      return best === -1 ? here : best;
    }

    function stepSpider(hunting) {
      var sp = spider;
      if (!sp || !nodes.length) return;

      // sitting on a catch: stays put and keeps working at it
      if (sp.held > 0) {
        sp.held--;
        walk += 0.42;
        if (sp.held === 0) cooldown = CATCH_COOLDOWN;
        return;
      }

      sp.alert += ((hunting ? 1 : 0) - sp.alert) * 0.06;

      var A = nodes[sp.from], B = nodes[sp.to];
      var len = Math.max(1, Math.hypot(B.x - A.x, B.y - A.y));
      sp.t += (hunting ? SPEED_HUNT : SPEED_IDLE) / len;
      walk += hunting ? 0.34 : 0.16;

      while (sp.t >= 1) {
        sp.t -= 1;
        var nxt = nextNode(sp, hunting);
        sp.from = sp.to; sp.to = nxt;
        A = nodes[sp.from]; B = nodes[sp.to];
      }

      sp.x = A.x + (B.x - A.x) * sp.t;
      sp.y = A.y + (B.y - A.y) * sp.t;
      var ta = Math.atan2(B.y - A.y, B.x - A.x);
      var da = ((ta - sp.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      sp.ang += da * 0.18;

      if (hunting && cooldown === 0 && pspeed < ESCAPE_SPEED &&
          Math.hypot(sp.x - px, sp.y - py) < CATCH_R) {
        caught = { x: px, y: py, t: 0 };
        sp.held = CATCH_HOLD;
      }
    }

    var LEGS = [
      { a: 0.62, f: 8.6, t: 9.4, bend: 0.62 },
      { a: 1.16, f: 9.4, t: 10.2, bend: 0.50 },
      { a: 1.86, f: 9.0, t: 9.8, bend: -0.46 },
      { a: 2.42, f: 8.0, t: 8.8, bend: -0.60 }
    ];

    function drawSpider() {
      var sp = spider;
      if (!sp) return;
      if (sp.x < -60 || sp.x > W + 60 || sp.y < -60 || sp.y > H + 60) return;

      var tone = (sp.alert > 0.5 || sp.held > 0) ? AMBER : BONE;
      var a = 0.55 + sp.alert * 0.35;

      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(sp.ang);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (var side = -1; side <= 1; side += 2) {
        for (var i = 0; i < 4; i++) {
          var L = LEGS[i];
          var phase = walk + i * 1.9 + (side > 0 ? Math.PI : 0);
          var swing = Math.sin(phase);
          var ang = L.a + swing * 0.13;
          var reach = 1 + swing * 0.06;

          var lx = 1.3, ly = side * 1.5;
          var kx = lx + Math.cos(ang) * L.f * reach;
          var ky = ly + side * Math.sin(ang) * L.f * reach;
          var fx = kx + Math.cos(ang + L.bend) * L.t * reach;
          var fy = ky + side * Math.sin(ang + L.bend) * L.t * reach;

          ctx.strokeStyle = "rgba(" + tone + "," + a.toFixed(2) + ")";
          ctx.lineWidth = 1.15;
          ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(kx, ky); ctx.stroke();
          ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
        }
      }

      ctx.lineWidth = 0.8;
      ctx.strokeStyle = "rgba(" + tone + "," + (a * 0.85).toFixed(2) + ")";
      for (var p = -1; p <= 1; p += 2) {
        ctx.beginPath(); ctx.moveTo(2.4, p * 0.9); ctx.lineTo(5.6, p * 2.2); ctx.stroke();
      }

      ctx.fillStyle = "rgba(" + tone + "," + Math.min(1, a + 0.32).toFixed(2) + ")";
      ctx.beginPath(); ctx.ellipse(-4.4, 0, 5.2, 4.1, 0, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.ellipse(1.1, 0, 2.9, 2.4, 0, 0, 6.2832); ctx.fill();

      ctx.strokeStyle = "rgba(11,13,17,.55)";
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(-7.6, 0); ctx.lineTo(-2.4, 0); ctx.stroke();

      ctx.restore();
    }

    /* ── the catch: drawn AT the pointer, never ON it ────────── */

    function drawCaught() {
      if (!caught) return;
      caught.t++;
      var life = caught.t / (CATCH_HOLD + 40);
      if (life >= 1) { caught = null; return; }

      var fade = life < 0.12 ? life / 0.12 : (life > 0.75 ? (1 - life) / 0.25 : 1);
      var x = caught.x, y = caught.y;

      // strands snapping taut toward the catch
      ctx.strokeStyle = "rgba(" + AMBER + "," + (0.5 * fade).toFixed(3) + ")";
      ctx.lineWidth = 0.9;
      for (var i = 0; i < 9; i++) {
        var a = (i / 9) * 6.2832 + caught.t * 0.004;
        var r0 = 15 + Math.sin(caught.t * 0.09 + i) * 2;
        var r1 = 46 + Math.sin(i * 2.1) * 12;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
        ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
        ctx.stroke();
      }

      // silk, wound tighter as it works
      var wind = Math.min(1, caught.t / 45);
      ctx.strokeStyle = "rgba(" + BONE + "," + (0.55 * fade).toFixed(3) + ")";
      ctx.lineWidth = 1.1;
      for (var k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.ellipse(x, y, 8 + k * 3.5, (5.5 + k * 2.6) * (1 - wind * 0.22),
                    caught.t * 0.02 + k, 0, 6.2832);
        ctx.stroke();
      }

      ctx.font = '500 9px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillStyle = "rgba(" + AMBER + "," + (0.9 * fade).toFixed(3) + ")";
      ctx.fillText("CAUGHT", x + 18, y - 13);
    }

    /* ── frame ──────────────────────────────────────────────── */

    function frame(t) {
      if (!W || !nodes.length) return;
      now = t || (now + 16);
      ctx.clearRect(0, 0, W, H);
      if (cooldown > 0) cooldown--;

      var inCanvas = on && px > -120 && px < W + 120 && py > -120 && py < H + 120;
      var hunting = inCanvas && huntable && !caught;
      var i, n;

      // Ripple: a radial wave off the pointer, falling away with distance. The
      // web bends and rings but never breaks — and this is what the spider is
      // notionally feeling when it comes for you.
      var rr2 = RIPPLE_R * RIPPLE_R;
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        n.vx = (n.vx + (n.hx - n.x) * 0.055) * 0.86;
        n.vy = (n.vy + (n.hy - n.y) * 0.055) * 0.86;
        n.x += n.vx; n.y += n.vy;

        n.rx = n.ry = 0;
        if (!inCanvas) continue;
        var dx = n.x - px, dy = n.y - py;
        var d2 = dx * dx + dy * dy;
        if (d2 > rr2 || d2 < 0.01) continue;
        var d = Math.sqrt(d2);
        var falloff = 1 - d / RIPPLE_R;
        var s = Math.sin(now * 0.009 - d * 0.055) * falloff * falloff * RIPPLE_AMP;
        n.rx = (dx / d) * s;
        n.ry = (dy / d) * s;
      }

      // Every strand in one path. 775 separate strokes was the old cost; a
      // single path with 775 segments is a fraction of it, and nothing here
      // needs per-strand colour any more now that they never break.
      ctx.strokeStyle = "rgba(" + BONE + ",.40)";
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      for (i = 0; i < edges.length; i++) {
        var A = nodes[edges[i].a], B = nodes[edges[i].b];
        ctx.moveTo(A.x + A.rx, A.y + A.ry);
        ctx.lineTo(B.x + B.rx, B.y + B.ry);
      }
      ctx.stroke();

      ctx.fillStyle = "rgba(" + BONE + ",.30)";
      for (i = 0; i < nodes.length; i += 2) {
        n = nodes[i];
        var nx = n.x + n.rx, ny = n.y + n.ry;
        if (nx < -20 || nx > W + 20 || ny < -20 || ny > H + 20) continue;
        ctx.fillRect(nx - 0.9, ny - 0.9, 1.8, 1.8);
      }

      stepSpider(hunting);
      drawCaught();
      drawSpider();
    }

    resize();
    return api;
  }

  return { mount: mount };
})();
