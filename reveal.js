/* ============================================================
   REVEAL — the cursor as a developer swab.

   The hero shows the latent image: a ghost, most of the room gone. Where
   the pointer travels, the fully developed photograph comes up — the wall,
   the shirt, the room — and then slowly fixes back to latent behind you.

   Two canvases. One holds the trail as pure alpha, painted by the pointer
   and faded a little every frame. The other draws the developed photo and
   then keeps only the part the trail covers, via `destination-in`. That is
   the whole trick: the mask is a texture, not a CSS gradient, so it can
   hold an arbitrary painted shape and decay over time.

     REVEAL.mount(canvas, img, opts) -> instance
       .frame(now)     draw one frame
       .resize()       re-measure
       .at(x, y)       pointer position in canvas CSS pixels
       .idle           true once the trail has fully faded
   ============================================================ */

window.REVEAL = (function () {
  "use strict";

  function mount(canvas, img, opts) {
    opts = opts || {};

    var SCALE = opts.scale || 0.6;          // backing store vs CSS pixels
    var RADIUS = opts.radius || 132;        // swab radius, CSS px
    var DECAY = opts.decay == null ? 0.016 : opts.decay;
    var POS_X = opts.posX == null ? 0.54 : opts.posX;   // must match styles.css
    var POS_Y = opts.posY == null ? 0.32 : opts.posY;

    var ctx = canvas.getContext("2d");
    var mask = document.createElement("canvas");
    var mctx = mask.getContext("2d");

    var W = 0, H = 0, cssW = 0, cssH = 0;
    var px = -9999, py = -9999;      // current pointer, backing-store px
    var lx = -9999, ly = -9999;      // previous, for interpolation
    var painted = false;             // anything on the mask at all?
    var live = 0;                    // frames since last paint
    var moved = false;               // has the pointer actually moved?

    var api = {
      idle: true,
      frame: frame,
      resize: resize,
      at: at,
      leave: leave
    };

    function resize() {
      var r = canvas.getBoundingClientRect();
      cssW = r.width; cssH = r.height;
      if (!cssW || !cssH) return;
      W = Math.max(1, Math.round(cssW * SCALE));
      H = Math.max(1, Math.round(cssH * SCALE));
      canvas.width = W; canvas.height = H;
      mask.width = W; mask.height = H;
      mctx.clearRect(0, 0, W, H);
      painted = false;
      lx = ly = -9999;
    }

    // Only a real move paints. A resting pointer must not keep re-stamping
    // its blob — that exactly cancels the decay and burns a spot that never
    // fixes back.
    function at(x, y) {
      var nx = x * SCALE, ny = y * SCALE;
      if (Math.abs(nx - px) > 0.5 || Math.abs(ny - py) > 0.5) moved = true;
      px = nx;
      py = ny;
    }

    function leave() { lx = ly = -9999; }

    // an organic swab rather than a perfect circle: three offset lobes
    // whose offsets drift, so the edge never reads as a stamped disc
    function blob(x, y, r, t) {
      for (var i = 0; i < 3; i++) {
        var a = t * 0.0011 + i * 2.1;
        var ox = Math.cos(a) * r * 0.20;
        var oy = Math.sin(a * 1.3) * r * 0.20;
        var rr = r * (0.74 + 0.16 * i);
        var g = mctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr);
        g.addColorStop(0, "rgba(255,255,255,.55)");
        g.addColorStop(0.55, "rgba(255,255,255,.28)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        mctx.fillStyle = g;
        mctx.beginPath();
        mctx.arc(x + ox, y + oy, rr, 0, 6.2832);
        mctx.fill();
      }
    }

    function frame(now) {
      if (!W || !img.complete || !img.naturalWidth) return;

      // Fade the whole trail down a touch — the print fixing itself again.
      // The fade accelerates the longer the pointer has been still. It has
      // to: `destination-out` is multiplicative on 8-bit alpha, so a fixed
      // rate stalls once `alpha * DECAY` rounds to zero (~23/255 at 0.016)
      // and leaves a ghost that would then pop when the canvas is cleared.
      if (painted) {
        mctx.globalCompositeOperation = "destination-out";
        mctx.fillStyle = "rgba(0,0,0," + (DECAY * (1 + live * 0.05)) + ")";
        mctx.fillRect(0, 0, W, H);
        mctx.globalCompositeOperation = "source-over";
      }

      var r = RADIUS * SCALE;
      if (px > -9998 && moved) {
        if (lx > -9998) {
          // interpolate along the move so a fast flick has no gaps
          var dx = px - lx, dy = py - ly;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var steps = Math.min(48, Math.max(1, Math.round(dist / (r * 0.28))));
          for (var s = 1; s <= steps; s++) {
            blob(lx + dx * (s / steps), ly + dy * (s / steps), r, now + s * 7);
          }
        } else {
          blob(px, py, r, now);
        }
        lx = px; ly = py;
        painted = true;
        moved = false;
        live = 0;
      } else if (painted) {
        moved = false;
        live++;
      }

      if (!painted) { api.idle = true; return; }

      // Has the trail faded to nothing? Stop compositing once it has, so an
      // untouched hero costs no per-frame work. The decay is multiplicative,
      // so this has to wait until alpha is genuinely invisible — cutting at
      // 1/DECAY frames still leaves ~37/255 on screen and snaps it off.
      if (live > 0 && live * DECAY > 4.5) {
        mctx.clearRect(0, 0, W, H);
        ctx.clearRect(0, 0, W, H);
        painted = false;
        api.idle = true;
        return;
      }
      api.idle = false;

      // cover-crop the developed photo exactly as the CSS does for the
      // latent layer, or the reveal would sit offset from what it replaces
      var iw = img.naturalWidth, ih = img.naturalHeight;
      var scale = Math.max(W / iw, H / ih);
      var dw = iw * scale, dh = ih * scale;
      var ox = (W - dw) * POS_X;
      var oy = (H - dh) * POS_Y;

      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, ox, oy, dw, dh);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    }

    resize();
    if (!img.complete) img.addEventListener("load", resize, { once: true });
    return api;
  }

  return { mount: mount };
})();
