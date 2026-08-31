# Cinematic scroll — a scroll-choreographed landing page

Same technique family as [shivduttkarwa.github.io/sdk](https://shivduttkarwa.github.io/sdk/#/about)
— pinned sections, scrubbed sequences, marquee rows, per-character reveals, a
live section index — but with **no dependencies**. The reference runs GSAP +
ScrollTrigger + Lenis (~90 KB of library). This runs ~200 lines of vanilla JS.

The site is Ashish Pitroda's developer portfolio — senior full-stack, 10+ years,
Wagtail CMS specialist. All copy lives in `index.html`; nothing in the engine
knows about it, so the content and the animation stay independent.

> **Before publishing:** act 04 (Work) ships six **placeholder** cards. They are
> not real projects. Replace every `h3`/`meta`/`note` in that section with actual
> work first — see the `TODO` comment above it in `index.html`.

---

## Run it

```bash
python -m http.server 5179 --directory .
```

Or build the single-file version and double-click it:

```bash
node build-single.js
```

| Output | What it is |
| --- | --- |
| `dist/latent.html` | Standalone page, everything inlined. No server, no build. |
| `dist/artifact.html` | Body-only fragment for publishing as a Claude Artifact. |

---

## Layout

```
index.html          the home reel — seven acts
about.html          who, how, what I know by depth, and what I am not for
contact.html        the brief, plus the spider web
colophon.html       how the site is built, with its numbers measured at build time
proof.html          HELD — built, but holds no reviews yet. Unlisted.
404.html            served by GitHub Pages; the count that never reaches zero
services/
  index.html          the hub
  wagtail-cms.html    …and five siblings. The site's search surface.
work/
  01-example.html   HELD — the case study template, carrying example content
writing/
  index.html        HELD — empty archive; goes live with the first post
  _template.html    copy this to a slug to write one
styles.css          the visual identity
scroll.js           the engine — smooth scroll + scroll triggers + text splitting
main.js             the choreography — what each act does with its progress value
reveal.js           the pointer-driven develop effect (home only)
web.js              the orb web and the spider (contact only)
contact.js          the form, and the web's pointer wiring
partials/           the chrome every page shares: head, fixed layers, footer
build-pages.js      writes partials/ into every page, and emits sitemap + robots
build-single.js     inlines the home reel (and the photo) into dist/
assets/
  portrait-source.png  the original photograph — the source of truth
  hero.webp            generated: the same photo with baked alpha
tools/
  make-hero.py         bakes hero.webp, and previews the hero offline
  make-shots.py        normalises project screenshots
  drop.py              a paste/drag box for getting an image onto disk
v1/ … v5/           version snapshots, untouched
```

### Adding a page

1. Copy `404.html` as a starting point — it is the smallest page that still
   carries the full chrome.
2. Give it the three markers it needs. They are inert on their own; the build
   fills them:

   ```html
   <!-- @chrome head --><!-- @end head -->      inside <head>
   <!-- @chrome chrome --><!-- @end chrome -->  first thing in <body>
   <!-- @chrome foot --><!-- @end foot -->      wherever the footer belongs
   ```

3. Add it to `PAGES` in `build-pages.js`. `live: true` puts it in the reel
   index and the sitemap; `live: false` builds it but lists it nowhere, which
   is how an unfinished page stays off the site while still being editable.
4. Set `<body data-runtime="N">` — seconds of runtime the timecode counts
   across that page. The home reel is 252 because its own slate says 00:04:12.
5. Run `node build-pages.js`. Running it twice is a no-op; `--check` exits 1
   if any page has drifted, which is what CI would run.

Pages in subdirectories work without any thought: the build prefixes `../` to
every relative link it writes, per directory depth.

---

## The engine (`scroll.js`)

One `requestAnimationFrame` loop, no per-frame layout reads.

```js
RIG.track(el, p => {})     // p = 0→1 while el is pinned
RIG.through(el, p => {})   // p = 0→1 as el crosses the viewport
RIG.frame((y, gp) => {})   // every frame: scroll position, whole-page progress
RIG.reveal(nodes)          // add .is-in the first time each node appears
RIG.chars(el)              // split into per-character spans, each with a --d delay
RIG.words(el)              // split into per-word spans
RIG.to(y)                  // scroll somewhere, riding the same lerp
RIG.tick()                 // step the loop once by hand (testing / hidden tabs)
```

**Smooth scroll.** Wheel events are intercepted and fed into a lerped target,
which is written back with `scrollTo`. The native scroll position stays
authoritative — which is the whole reason to do it this way instead of
transforming a wrapper element. `position: sticky`, anchors, find-in-page and
scrollbar dragging all keep working; if something else moves the page, the rig
adopts that position rather than fighting it.

It turns itself off for `prefers-reduced-motion` and for coarse pointers, where
native scrolling is already better than anything JS can do.

**Pinning is CSS, not JS.** A pinned act is `(len + 1)` screens tall and its
`.pin` child is `position: sticky; top: 0`. No JS ever writes to layout, so
there is nothing to get out of sync:

```html
<section class="act act--pin" style="--len:5">
  <div class="pin"> … </div>
</section>
```

`--len` is how many extra screens of scroll the act gets — the only knob for
how long an act lasts.

---

## The acts (`main.js`)

Each one is a pure function of a single number.

| Act | Effect | How |
| --- | --- | --- |
| **01 Intro** | Name swings up out of a mask, one character at a time | `RIG.chars`, CSS transition with a `--d` stagger |
| **02 Approach** | A wavefront runs through the sentence: dim → amber → bone | `RIG.track`, per-word colour mixed in JS each frame |
| **03 Services** | Filmstrip scrubs sideways | `RIG.track` → `translate3d` on the track |
| **04 Work** | Full-bleed stage: one project per screen, image + overlaid panel | sticky stage, `RIG.track` cross-fades plate and panel; rail fill is pure CSS off `--progress` |
| **05 Process** | Steps cross-fade one at a time, rail follows | `RIG.track`, per-step opacity/offset/blur from distance-to-centre |
| **06 Stack** | Marquee rows, alternating directions | Pure CSS `@keyframes`, duplicated group, `translateX(-50%)` |
| **07 Contact** | Headline splits and reveals on entry | `RIG.chars` + `RIG.reveal` |

**The Work stage.** Act 04 is a sticky, full-bleed stage — the visual fills the
viewport and the copy rides over it, one project per screen of runway. It
breaks out of the body's rail padding with negative margins to reach the true
viewport edges. The progress rail underneath takes **no per-frame style write**:
`main.js` sets a single `--progress` custom property on the runway and
`.works__rail-fill` is `width: calc(var(--progress) * 100%)`.

Screenshots go in via `tools/make-shots.py` (16:9, darkened so a white UI does
not punch a hole in the page). A project without one keeps its gradient plate,
so mixed coverage degrades cleanly.

**One filmstrip, one component.** The strip block iterates
`$$("[data-strip]")` and scopes its track and counter lookups to
`strip.closest(".act")` — the counter sits in `.strip__hint`, a sibling of
`.strip`. This was a single `querySelector` until act 04 existed, which left
every strip after the first completely inert: no scrub, no counter. Add a third
strip and it just works; each gets its own `travel` and resize listener.

**Counts the CSS depends on.** The thesis is exactly 3 lines
(`nth-child(2|3)` carry the indents), Process is 5 steps *and* 5 rail items,
Stack is exactly 4 marquee rows (`nth-child(2|3|4)` set the speeds, and each
row's two spans must stay identical or the loop jumps), and the slate card needs
an even number of rows. The headline is 6 characters at the current type size.

Fixed chrome — sprocket strip, playhead, timecode — all hang off one
`RIG.frame` callback. The timecode is real information: page progress mapped
onto the runtime printed on the slate, so it reads `00:04:12:00` exactly at the
bottom.

### The cross-fade, specifically

The one piece worth reading. `d` is how far the current position is past step
`i`; `v` is a triangular window peaking when that step owns the screen:

```js
var t = 0.5 + p * (n - 1);        // first and last step land dead centre
var d = t - i;
var v = RIG.clamp01(1 - Math.abs(d - 0.5) / 0.72);   // 0.72 = overlap
var a = RIG.smoothstep(0, 0.42, v);                  // reach full, then hold
```

Widen `0.72` for a longer dissolve between steps; narrow it for a hard cut.

---

## The hero photograph (v2)

The portrait behind the headline has to *merge* with the page black — no
visible photo rectangle, no edge where the picture starts and stops. Two
things do that, and it matters which does which.

**The subject merges via baked alpha, not a CSS blend.** `mix-blend-mode:
screen` is the obvious reach and it does not work here: screen against a
ground that is already near-black (`#0B0D11`) is close to a no-op, so the
photo just sits there as a rectangle with the whole room visible in it.
Instead `tools/make-hero.py` derives an alpha channel from the photograph's
own luminance — the unlit room and the shadow side fall to fully
transparent, the tungsten-lit side stays opaque, everything between ramps:

```bash
python tools/make-hero.py --lo 38 --hi 168 --gamma 1.18 \
                          --fade 0.30 --strength 0.95 --preview
```

| Flag | What it does |
| --- | --- |
| `--lo` / `--hi` | luminance that is fully transparent / fully opaque |
| `--gamma` | `>1` holds the midtones further back |
| `--fade` | left share of the asset that fades out |
| `--strength` | global alpha — how far behind the type it sits |
| `--preview` | writes `tools/_preview.png`, the hero composited offline |

Edit `assets/portrait-source.png` (or replace it) and re-run. `hero.webp` is
generated — never edit it by hand.

**The frame edges feather in CSS, not in the asset.** This is the part that
is easy to get wrong. `background-size: cover` scales the asset up and crops
roughly 45% of its width away, and it crops off exactly the soft edges baked
into the file — the left arrives mid-fade, the right is cut square. So the
frame is feathered by a mask on `.hero-bg`, in *element* space, where the
visible edges actually are; it multiplies with the luminance alpha. The
stops there and the `hstops`/`vstops` in `make-hero.py`'s preview describe
the same mask and must be kept in step.

`background-position: 54%` is load-bearing too, and was measured rather than
guessed. At a 1440 window the "LATENT" glyphs run to x=865 while the image
slab starts at x=560, so the headline overlaps the picture by ~305px. 54%
puts the face clear of that overlap and still inside the right-edge feather;
46% pushes it into the feather, and 76% laid the title across his eye. Pass
`--pos` to the preview to check any other value against the real type.

Use `--preview` to judge any of this — it composites the hero offline, so a
change can be checked without opening the site.

---

## The pointer reveal (v3)

The cursor is a developer swab. Where it travels, the fully developed print
comes up out of the latent ghost, then fixes back over about five seconds.
`reveal.js`, ~130 lines, two canvases.

**How.** One canvas holds the trail as pure alpha — soft lobes stamped along
the pointer's path, interpolated so a fast flick leaves no gaps, and faded a
little every frame. The other draws `hero-dev.webp` and then keeps only what
the trail covers, via `destination-in`. The mask is a texture rather than a
CSS gradient, which is the whole point: it can hold an arbitrary painted
shape and decay over time, which no gradient can.

**Three things that had to be right, each of which was wrong first:**

*It is added, not swapped.* Cross-fading the developed layer over the latent
one was nearly invisible — the two differ most in the **dark** parts of the
frame, and bringing those up on a black page is dark-on-dark. `.hero-reveal`
uses `mix-blend-mode: screen`, so the swab reads as light falling on the
print: against the black room it shows the developed pixels outright, and on
the already-lit face it lifts. `hero-dev.webp` is also generated with
`--bright 1.5 --sat 1.3 --contrast 1.12` so there is something to lift.

*A resting pointer must not paint.* `at()` only flags a move when the
position actually changes. Re-stamping the blob every frame exactly cancels
the decay, burning a bright spot that never fixes back.

*The decay has to accelerate.* `destination-out` is multiplicative on 8-bit
alpha, so a fixed rate stalls once `alpha × DECAY` rounds to zero — it parks
at about 23/255 and then pops when the canvas is cleared. Scaling the rate by
how long the pointer has been still brings the residue to 2/255 before the
clear, which is invisible.

Once the trail has fully faded the canvas clears and compositing stops, so an
untouched hero costs nothing per frame. Fine pointers only — it needs hover,
so touch gets the latent layer alone — and `prefers-reduced-motion` opts out.

`tools/make-hero.py --preview --reveal` paints a sample stroke and composites
it the same way, to judge the effect offline.

The `posX`/`posY` passed to `REVEAL.mount` in `main.js` **must** match
`background-position` on `.hero-bg`, or the developed layer sits offset from
the latent one it is lifting.

## Making it yours

- **Copy** — all of it is in `index.html`.
- **Palette and type** — the `:root` block at the top of `styles.css`. One
  accent (`--amber`) does all the work; everything else is the blue-black
  ground and bone text.
- **Act length** — `--len` on each pinned section.
- **Scroll feel** — `SS.ease` in `scroll.js` (0.11). Lower is heavier.
- **Adding an act** — add the section, then one `RIG.track` call. That is the
  whole extension story.

Single dark theme by design: it is a cutting room. Every colour is painted
explicitly, so the page never borrows a host background.
