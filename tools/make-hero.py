"""Bake the hero photo so it merges into the page black.

    python tools/make-hero.py [--lo 42] [--hi 130] [--gamma 1.0] [--preview]

CSS blend modes cannot do this job: `screen` against a near-black ground is
almost a no-op, so the photograph stays a visible rectangle. Instead the
merge is baked into the asset as real alpha derived from the image's own
luminance — the unlit room falls to fully transparent, the lit side of the
subject stays opaque, and everything between ramps. The result sits on the
page black with no edge at all, at any size, with no blend mode.

Writes assets/hero.webp (alpha). With --preview also writes tools/_preview.png
showing it composited into the hero at 1440x900 with the type blocks marked.
"""

import math
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "assets", "portrait-source.png")
OUT = os.path.join(ROOT, "assets", "hero.webp")   # overridden by --out
INK = (11, 13, 17)


def arg(name, default):
    if name in sys.argv:
        return float(sys.argv[sys.argv.index(name) + 1])
    return default


LO = arg("--lo", 42.0)        # luminance that is fully transparent
HI = arg("--hi", 130.0)       # luminance that is fully opaque
GAMMA = arg("--gamma", 1.0)   # >1 holds more of the image back
FADE_L = arg("--fade", 0.34)  # left share that fades out for the type
STRENGTH = arg("--strength", 1.0)  # global alpha — how far back it sits
WIDTH = int(arg("--width", 1500))
POS_X = arg("--pos", 0.54)         # background-position-x, to match styles.css
R_PLATEAU = arg("--rplateau", 0.84)  # where the right-edge feather begins
BRIGHT = arg("--bright", 1.0)      # tone, for the developed layer
SAT = arg("--sat", 1.0)
CONTRAST = arg("--contrast", 1.0)


def smoothstep(t):
    t = 0.0 if t < 0 else 1.0 if t > 1 else t
    return t * t * (3 - 2 * t)


def ramp(stops, x):
    """Linear interpolation between (position, value) stops, like a CSS gradient."""
    if x <= stops[0][0]:
        return stops[0][1]
    for i in range(1, len(stops)):
        p0, v0 = stops[i - 1]
        p1, v1 = stops[i]
        if x <= p1:
            t = 0.0 if p1 == p0 else (x - p0) / (p1 - p0)
            return v0 + (v1 - v0) * t
    return stops[-1][1]


def build():
    global OUT
    if "--out" in sys.argv:
        OUT = os.path.join(ROOT, "assets", sys.argv[sys.argv.index("--out") + 1])
    src = Image.open(SRC).convert("RGB")
    w, h = src.size
    if w > WIDTH:
        src = src.resize((WIDTH, round(h * WIDTH / w)), Image.LANCZOS)
        w, h = src.size

    # luminance -> alpha, softened so the ramp does not band
    lum = src.convert("L").filter(ImageFilter.GaussianBlur(1.1))

    lut = []
    for v in range(256):
        a = smoothstep((v - LO) / max(1e-6, HI - LO))
        if GAMMA != 1.0:
            a = a ** GAMMA
        lut.append(int(255 * a))
    alpha = lum.point(lut)

    # fade the left away so the headline sits on clean black, and pull the
    # outer edges down so the frame never reads as a rectangle
    ap = alpha.load()
    for x in range(w):
        fx = smoothstep(x / (w * FADE_L)) if FADE_L > 0 else 1.0
        rx = smoothstep((w - 1 - x) / (w * 0.10))
        for y in range(h):
            fy = smoothstep(y / (h * 0.07)) * smoothstep((h - 1 - y) / (h * 0.16))
            ap[x, y] = int(ap[x, y] * fx * rx * fy * STRENGTH)

    # Tone, for the developed layer. Without this the reveal is invisible:
    # the two layers differ mostly in the *dark* parts of the frame, so
    # bringing them up on a black page is dark-on-dark. Lifting exposure and
    # saturation is what makes the swab read as a print coming up.
    if BRIGHT != 1.0:
        src = ImageEnhance.Brightness(src).enhance(BRIGHT)
    if SAT != 1.0:
        src = ImageEnhance.Color(src).enhance(SAT)
    if CONTRAST != 1.0:
        src = ImageEnhance.Contrast(src).enhance(CONTRAST)

    out = src.convert("RGBA")
    out.putalpha(alpha)
    out.save(OUT, "WEBP", quality=88, method=6)
    print("wrote %s  %dx%d  %.0f KB  (lo=%g hi=%g gamma=%g fade=%g)"
          % (OUT, w, h, os.path.getsize(OUT) / 1024, LO, HI, GAMMA, FADE_L))
    return out


def preview(img):
    """Composite the hero exactly as the browser lays it out.

    Every number here was measured off the live page at a 1440x900 window
    (see the table in the README) rather than estimated, because the whole
    point is judging where the headline lands against the face."""
    W, H = 1425, 900
    SLAB_X, SLAB_W, SLAB_H = 560, 865, 982
    TITLE = (144, 196, 865, 444)     # the glyph box of "LATENT", not the block
    LEDE = (144, 598, 509, 693)
    CARD = (681, 598, 1169, 803)

    canvas = Image.new("RGB", (W, H), INK)

    slab_w, slab_x = SLAB_W, SLAB_X
    iw, ih = img.size
    scale = max(slab_w / iw, SLAB_H / ih)
    dw, dh = round(iw * scale), round(ih * scale)
    big = img.resize((dw, dh), Image.LANCZOS)
    ox = slab_x + round((slab_w - dw) * POS_X)
    oy = round((SLAB_H - dh) * 0.32)
    H_slab = SLAB_H

    # the element-space edge mask from styles.css, applied to the slab so the
    # preview shows the real edges rather than the asset's cropped-off ones
    slab = Image.new("RGBA", (slab_w, H_slab), (0, 0, 0, 0))
    slab.paste(big, (ox - slab_x, oy), big)

    hstops = [(0.0, 0.0), (0.10, 0.50), (0.26, 1.0), (R_PLATEAU, 1.0), (1.0, 0.0)]
    vstops = [(0.0, 0.0), (0.10, 1.0), (0.76, 1.0), (1.0, 0.0)]
    hrow = [ramp(hstops, x / slab_w) for x in range(slab_w)]
    vcol = [ramp(vstops, y / H_slab) for y in range(H_slab)]

    sp = slab.load()
    for y in range(H_slab):
        vy = vcol[y]
        for x in range(slab_w):
            m = hrow[x] * vy          # mask-composite: intersect
            if m >= 0.999:
                continue
            r, g, b, a = sp[x, y]
            sp[x, y] = (r, g, b, int(a * m))

    canvas.paste(slab, (slab_x, 0), slab)

    # --reveal: paint a sample swab stroke and bring the developed layer up
    # through it, the way reveal.js does at runtime
    if "--reveal" in sys.argv:
        dev_path = os.path.join(ROOT, "assets", "hero-dev.webp")
        if os.path.exists(dev_path):
            dev = Image.open(dev_path).convert("RGBA")
            dbig = dev.resize((dw, dh), Image.LANCZOS)
            dslab = Image.new("RGBA", (slab_w, H_slab), (0, 0, 0, 0))
            dslab.paste(dbig, (ox - slab_x, oy), dbig)

            # the trail: a curved stroke of soft lobes, decaying along its length
            # Stamps accumulate with `lighter`, reaching full alpha at the
            # centre — the runtime mask measures 254 there, so a trail that
            # topped out near 46% would make the preview lie about how
            # strong the effect is.
            trail = Image.new("L", (slab_w, H_slab), 0)
            n = 46
            for i in range(n):
                t = i / (n - 1.0)
                cx = slab_w * (0.12 + 0.66 * t)
                cy = H_slab * (0.62 - 0.30 * math.sin(t * 2.4))
                rad = 132 * 0.78
                strength = 255 * (0.30 + 0.70 * t)          # older = fainter
                stamp = Image.new("L", (slab_w, H_slab), 0)
                sd = ImageDraw.Draw(stamp)
                for k in range(12, 0, -1):
                    rr = rad * k / 12.0
                    v = int(strength * (1 - (k / 12.0) ** 2))
                    sd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr],
                               fill=max(0, min(255, v)))
                trail = ImageChops.lighter(trail, stamp)
            trail = trail.filter(ImageFilter.GaussianBlur(12))

            # mix-blend-mode: screen, weighted by the trail and the edge mask
            dp, tp = dslab.load(), trail.load()
            cp = canvas.load()
            for y in range(min(H, H_slab)):
                vy = vcol[y]
                for x in range(slab_w):
                    m = hrow[x] * vy * (tp[x, y] / 255.0)
                    if m <= 0.004:
                        continue
                    r_, g_, b_, a_ = dp[x, y]
                    k = m * (a_ / 255.0)
                    br, bg_, bb = cp[slab_x + x, y]
                    sr = 255 - (255 - br) * (255 - r_) // 255
                    sg = 255 - (255 - bg_) * (255 - g_) // 255
                    sb = 255 - (255 - bb) * (255 - b_) // 255
                    cp[slab_x + x, y] = (int(br + (sr - br) * k),
                                         int(bg_ + (sg - bg_) * k),
                                         int(bb + (sb - bb) * k))

    # the real type, drawn where it actually sits
    d = ImageDraw.Draw(canvas)
    d.rectangle(TITLE, outline=(240, 160, 42), width=2)
    d.text((TITLE[0] + 6, TITLE[1] - 16), "LATENT glyphs", fill=(240, 160, 42))
    for box, lab in ((LEDE, "lede"), (CARD, "slate card")):
        d.rectangle(box, outline=(110, 117, 128), width=1)
        d.text((box[0] + 6, box[1] - 15), lab, fill=(110, 117, 128))

    p = os.path.join(HERE, "_preview.png")
    canvas.save(p)
    print("preview ->", p)


if __name__ == "__main__":
    img = build()
    if "--preview" in sys.argv:
        preview(img)
