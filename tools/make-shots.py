"""Normalise project screenshots for the full-bleed Work stage.

    python tools/make-shots.py                 # process assets/work/_raw/*
    python tools/make-shots.py --width 1400

Drop raw screenshots into `assets/work/_raw/` named 01.*, 02.* … 06.* (any
common format). This writes `assets/work/NN.webp` at one consistent size,
cropped to the 16:9 the full-bleed stage uses, slightly darkened and desaturated so a
bright white UI screenshot does not punch a hole in the page's black, and
feathered at the edges so it sits in the frame rather than fighting it.

Then add the <img> to that project's plate in index.html:

    <div class="work__plate" data-shot style="--a:…;--b:…">
      <span>01</span>
      <img class="work__shot" src="assets/work/01.webp" alt="">
    </div>

The plate's gradient stays underneath, so a project with no screenshot still
renders correctly — the number on the gradient is the fallback.
"""

import os
import sys

from PIL import Image, ImageEnhance, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, "assets", "work", "_raw")
OUT = os.path.join(ROOT, "assets", "work")

EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp")


def arg(name, default):
    if name in sys.argv:
        return float(sys.argv[sys.argv.index(name) + 1])
    return default


WIDTH = int(arg("--width", 1400))
ASPECT = arg("--aspect", 16 / 9)
BRIGHT = arg("--bright", 0.88)   # keep bright UI shots from blowing out the page
SAT = arg("--sat", 0.92)
FEATHER = arg("--feather", 0.0)   # off: the stage scrim already handles edges


def smoothstep(t):
    t = 0.0 if t < 0 else 1.0 if t > 1 else t
    return t * t * (3 - 2 * t)


def process(src_path, dest_path):
    im = Image.open(src_path).convert("RGB")
    w, h = im.size

    # centre-crop to the frame's aspect, then resize
    target = ASPECT
    if w / h > target:
        nw = int(h * target)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / target)
        # bias the crop upward — screenshots carry their subject near the top
        top = int((h - nh) * 0.25)
        im = im.crop((0, top, w, top + nh))

    im = im.resize((WIDTH, int(WIDTH / target)), Image.LANCZOS)
    im = ImageEnhance.Brightness(im).enhance(BRIGHT)
    im = ImageEnhance.Color(im).enhance(SAT)

    if FEATHER <= 0:
        im.save(dest_path, "WEBP", quality=82, method=6)
        return os.path.getsize(dest_path)

    # optional feather, for when a shot is used outside the scrimmed stage
    w2, h2 = im.size
    band = max(2, int(min(w2, h2) * FEATHER))
    mask = Image.new("L", (w2, h2), 255)
    mp = mask.load()
    for x in range(w2):
        fx = smoothstep(min(x, w2 - 1 - x) / band)
        for y in range(h2):
            fy = smoothstep(min(y, h2 - 1 - y) / band)
            v = min(fx, fy)
            if v < 1.0:
                mp[x, y] = int(255 * v)
    out = im.convert("RGBA")
    out.putalpha(mask)
    out.save(dest_path, "WEBP", quality=82, method=6)
    return os.path.getsize(dest_path)


def main():
    if not os.path.isdir(RAW):
        print("no raw folder — create %s and drop 01.png, 02.png … in it" % RAW)
        return
    os.makedirs(OUT, exist_ok=True)
    found = 0
    for f in sorted(os.listdir(RAW)):
        stem, ext = os.path.splitext(f)
        if ext.lower() not in EXTS:
            continue
        dest = os.path.join(OUT, stem + ".webp")
        size = process(os.path.join(RAW, f), dest)
        print("  %-12s -> assets/work/%-12s %6.0f KB" % (f, stem + ".webp", size / 1024))
        found += 1
    print("processed %d screenshot(s) at %dpx wide" % (found, WIDTH))
    if found:
        print("now add the <img class=\"works__img\"> to each plate in index.html")


if __name__ == "__main__":
    main()
