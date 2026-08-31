/* Sync the shared chrome into every page, then write sitemap.xml + robots.txt.
     node build-pages.js
     node build-pages.js --check     exit 1 if anything is out of date

   Every page hand-copied the same fixed chrome — grain, vignette, film edge,
   reel index, playhead, footer, font links. At two pages that was fine. At
   fifteen it guarantees drift, so one source of truth writes into all of them.

   The chrome is written INTO the page files, between markers, rather than
   emitted to a separate output tree. That keeps every page a valid standalone
   file that opens straight from disk with no server and no <base> tag, which
   is the thing that makes this project pleasant to work on. Running the build
   twice is a no-op.

     <!-- @chrome NAME -->  ...generated...  <!-- @end NAME -->

   Links inside generated chrome are written root-relative (styles.css,
   contact.html) and prefixed with ../ per directory depth on the way in, so a
   page at work/01-x.html gets ../styles.css without anyone thinking about it.
*/

const fs = require("fs");
const path = require("path");

const here = __dirname;
const SITE = "https://apequaltowork.github.io/ap";

const read = (f) => fs.readFileSync(path.join(here, f), "utf8");
const exists = (f) => fs.existsSync(path.join(here, f));

/* ── the site, as data ─────────────────────────────────────────
   `live` is what gates the reel index and the sitemap. A page that exists on
   disk but is not finished — or is deliberately unlisted, like the case study
   demo — stays false and simply does not appear. Parts 07-09 flip flags. */

const PAGES = [
  { file: "index.html",          n: "01", name: "Reel",     nav: "acts", live: true },
  { file: "work/index.html",     n: "02", name: "Work",     live: false },
  { file: "services/index.html", n: "03", name: "Services", live: false },
  { file: "about.html",          n: "04", name: "About",    live: false },
  { file: "proof.html",          n: "05", name: "Proof",    live: false },
  { file: "writing/index.html",  n: "06", name: "Writing",  live: false },
  { file: "contact.html",        n: "07", name: "Contact",  live: true },
  { file: "colophon.html",       n: "08", name: "Colophon", live: true },
  // 404 carries the chrome but is never indexed and never listed
  { file: "404.html",            n: "--", name: "Missing",  live: false, noindex: true }
];

// the home reel's own sections — the other half of the two-mode index
const ACTS = [
  ["01", "Intro",    "r1"], ["02", "Approach", "r2"], ["03", "Services", "r3"],
  ["04", "Work",     "r4"], ["05", "Process",  "r5"], ["06", "Stack",    "r6"],
  ["07", "Contact",  "r7"]
];

/* ── path helpers ─────────────────────────────────────────── */

const depthOf = (file) => file.split("/").length - 1;

// Rewrite relative hrefs/srcs for a page's depth. Anchors, protocols and
// data: URIs are left alone — prefixing those breaks them.
function reroot(html, depth) {
  if (!depth) return html;
  const up = "../".repeat(depth);
  return html.replace(/\b(href|src)="(?!https?:|mailto:|data:|#|\/)([^"]*)"/g,
    (m, attr, val) => attr + '="' + up + val + '"');
}

/* ── region replacement ───────────────────────────────────── */

function setRegion(html, name, body) {
  const open = "<!-- @chrome " + name + " -->";
  const close = "<!-- @end " + name + " -->";
  const i = html.indexOf(open);
  if (i === -1) return html;                    // page opts out of this region
  const j = html.indexOf(close, i);
  if (j === -1) throw new Error("unclosed @chrome " + name);
  // the marker's own indentation is reused for the block, so generated
  // markup lands at the same depth as the hand-written markup around it
  const lineStart = html.lastIndexOf("\n", i) + 1;
  const indent = html.slice(lineStart, i).match(/^[ \t]*/)[0];
  const inner = body.trim().split("\n")
    .map((l) => (l.length ? indent + l : l)).join("\n");
  return html.slice(0, i + open.length) + "\n" + inner + "\n" + indent +
    html.slice(j);
}

/* ── the generated blocks ─────────────────────────────────── */

function navFor(page) {
  const items = page.nav === "acts"
    ? ACTS.map(([n, name, id]) =>
        ['<li><a class="reel" href="#', id, '"><span class="reel__n">', n,
         '</span><span class="reel__name">', name,
         '</span><i class="reel__tick"></i></a></li>'].join(""))
    : PAGES.filter((p) => p.live).map((p) => {
        // is-active is stamped here, in markup. main.js highlights the reel
        // index from an IntersectionObserver over .act ids, which cannot ever
        // resolve a cross-page href — so on inner pages the build does it.
        const self = p.file === page.file;
        return ['<li><a class="reel', self ? " is-active" : "", '" href="', p.file,
          '"><span class="reel__n">', p.n, '</span><span class="reel__name">',
          p.name, '</span><i class="reel__tick"></i></a></li>'].join("");
      });

  return ['<nav class="reels" aria-label="' +
    (page.nav === "acts" ? "Sections" : "Pages") + '">',
    '  <ol class="reels__list">',
    items.map((s) => "    " + s).join("\n"),
    "  </ol>",
    '  <p class="reels__tc"><span data-timecode>00:00:00:00</span></p>',
    "</nav>"].join("\n");
}

function footFor(page) {
  const links = PAGES.filter((p) => p.live && p.file !== page.file)
    .map((p) => '<a href="' + p.file + '">' + p.name + "</a>")
    .join("");
  return read("partials/foot.html").replace("@links", () => links);
}

/* ── colophon numbers, measured rather than guessed ───────── */

function stats() {
  const js = ["scroll.js", "main.js", "leader.js", "reveal.js", "web.js", "contact.js"];
  const have = js.filter(exists);
  const jsBytes = have.reduce((n, f) => n + fs.statSync(path.join(here, f)).size, 0);
  const cssBytes = fs.statSync(path.join(here, "styles.css")).size;
  const kb = (b) => (b / 1024).toFixed(1);
  const pages = PAGES.filter((p) => p.live).length;

  const rows = [
    ["Dependencies", "0", "no framework, no GSAP, no Lenis, nothing to install"],
    ["JavaScript", kb(jsBytes) + " KB", have.length + " hand-written modules, unminified"],
    ["CSS", kb(cssBytes) + " KB", "one stylesheet, no preprocessor"],
    ["Pages", String(pages), "static HTML, served straight off GitHub Pages"],
    ["Build step", "optional", "the site runs from source; the build only syncs chrome"]
  ];

  return ['<dl class="colo__stats">',
    rows.map(([k, v, note]) =>
      ["  <div>", "    <dt>" + k + "</dt>", "    <dd>" + v + "</dd>",
       "    <p>" + note + "</p>", "  </div>"].join("\n")).join("\n"),
    "</dl>"].join("\n");
}

/* ── run ──────────────────────────────────────────────────── */

const CHECK = process.argv.includes("--check");
let changed = 0, skipped = 0;
const stale = [];

for (const page of PAGES) {
  if (!exists(page.file)) { skipped++; continue; }
  const before = read(page.file);
  const d = depthOf(page.file);

  let html = before;
  html = setRegion(html, "head", reroot(read("partials/head.html"), d));
  html = setRegion(html, "chrome",
    reroot(read("partials/chrome.html").replace("@nav", () => navFor(page)), d));
  html = setRegion(html, "foot", reroot(footFor(page), d));
  html = setRegion(html, "stats", stats());

  if (html === before) continue;
  stale.push(page.file);
  if (!CHECK) fs.writeFileSync(path.join(here, page.file), html, "utf8");
  changed++;
}

/* sitemap + robots — part 08 exists specifically to be found */
if (!CHECK) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = PAGES.filter((p) => p.live && !p.noindex).map((p) => {
    const loc = SITE + "/" + (p.file === "index.html" ? "" : p.file);
    return ["  <url>", "    <loc>" + loc + "</loc>",
      "    <lastmod>" + today + "</lastmod>", "  </url>"].join("\n");
  });
  fs.writeFileSync(path.join(here, "sitemap.xml"),
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join("\n") + "\n</urlset>\n", "utf8");

  fs.writeFileSync(path.join(here, "robots.txt"),
    "User-agent: *\nAllow: /\n\nSitemap: " + SITE + "/sitemap.xml\n", "utf8");
}

const listed = PAGES.filter((p) => p.live).length;
console.log("pages".padEnd(12),
  (PAGES.length - skipped) + " on disk, " + listed + " listed, " + skipped + " not built yet");
console.log((CHECK ? "stale" : "written").padEnd(12),
  changed ? stale.join(", ") : "none — already in sync");

if (CHECK && changed) process.exit(1);
