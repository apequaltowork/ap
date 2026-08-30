/* Inline styles.css + scroll.js + main.js into single-file builds.
   node build-single.js
     dist/latent.html    standalone page — double-click it, no server
     dist/artifact.html  body-only fragment for publishing as an Artifact
*/

const fs = require("fs");
const path = require("path");

const here = __dirname;
const read = (f) => fs.readFileSync(path.join(here, f), "utf8");

let html = read("index.html");
let css = read("styles.css");
// Read the module list straight out of index.html's <script src> tags, in
// document order. Hard-coding it here desynced twice: a module was added to
// the page, the strip regex removed its tag, and the code was never inlined —
// the served page worked while the bundle silently lost a whole library.
const MODULES = (html.match(/<script src="([^"]+)"><\/script>/g) || [])
  .map((t) => t.replace(/^<script src="|"><\/script>$/g, ""));
const js = MODULES.map(read).join("\n");

// The hero photo has to travel inside the file: a single-file build has no
// server, and an Artifact's CSP blocks external hosts outright. If the asset
// is missing the rule is dropped, so the build still succeeds and the hero
// falls back to the plain ground.
const PHOTO = ["assets/hero.webp", "assets/hero.png", "assets/portrait.jpg"]
  .find((p) => fs.existsSync(path.join(here, p)));

if (PHOTO) {
  const ext = path.extname(PHOTO).slice(1).toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const b64 = fs.readFileSync(path.join(here, PHOTO)).toString("base64");
  css = css.replace(/url\(["']?assets\/(?:hero|portrait)\.[a-z]+["']?\)/g,
    () => 'url("data:' + mime + ';base64,' + b64 + '")');
  console.log("photo".padEnd(16), PHOTO + "  " + (b64.length / 1024 / 1.37).toFixed(0) + " KB raw");
} else {
  css = css.replace(/background-image:\s*url\(["']?assets\/(?:hero|portrait)\.[a-z]+["']?\);/g, "");
  console.log("photo".padEnd(16), "none — hero background rule dropped");
}

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@400;600;800&family=IBM+Plex+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,200;0,6..72,300;0,6..72,400;1,6..72,300&display=swap">';

// The developed layer is an <img src>, not a CSS url, so it needs inlining
// separately — the canvas decodes it, and a bare relative path would 404 in
// a single file or be blocked outright by an Artifact's CSP.
// This runs against `html`, BEFORE `body` is sliced out of it: patching only
// the slice leaves the standalone build still pointing at assets/ on disk.
// Every asset referenced by an <img src>, not just the hero — the work
// section adds one screenshot per project. Anything missing from disk is
// left alone and reported, rather than silently shipping a broken path.
const MIME = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml" };
// Scan with comments stripped: the Work section documents how to add a
// screenshot with a literal src="assets/work/NN.webp" example, and counting
// that as a real reference makes the build cry MISSING on every run — which
// would hide an actually-missing asset later.
const scannable = html.replace(/<!--[\s\S]*?-->/g, "");
const srcRefs = [...new Set((scannable.match(/src="assets\/[^"]+"/g) || [])
  .map((m) => m.slice(5, -1)))];

let inlined = 0;
let missing = [];
for (const ref of srcRefs) {
  const abs = path.join(here, ref);
  if (!fs.existsSync(abs)) { missing.push(ref); continue; }
  const mime = MIME[path.extname(ref).slice(1).toLowerCase()] || "application/octet-stream";
  const b64 = fs.readFileSync(abs).toString("base64");
  html = html.replace(new RegExp('src="' + ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"', "g"),
    () => 'src="data:' + mime + ';base64,' + b64 + '"');
  inlined++;
}
console.log("images".padEnd(16),
  inlined + " inlined" + (missing.length ? "  MISSING: " + missing.join(", ") : ""));

// everything between <body> and </body>
const body = html.slice(
  html.indexOf(">", html.indexOf("<body")) + 1,
  html.indexOf("</body>")
);

// drop every external <script src> tag — the code is inlined instead
const bodyNoScripts = body.replace(/\s*<script src="[^"]+"><\/script>/g, "");

const style = "<style>\n" + css + "\n</style>";
const script = "<script>\n" + js + "\n</script>";

fs.mkdirSync(path.join(here, "dist"), { recursive: true });

/* ---- standalone ----
   The replacements go through functions, not strings: a `$$` inside a
   replacement STRING is an escape for a literal `$`, which would quietly
   rewrite every `$$(...)` helper in main.js into `$(...)`. */
fs.writeFileSync(
  path.join(here, "dist", "latent.html"),
  html
    .replace('<link rel="stylesheet" href="styles.css">', () => style)
    // swap the whole run of script tags for the single inlined bundle
    .replace(/(?:\s*<script src="[^"]+"><\/script>)+/, () => "\n" + script),
  "utf8"
);

/* ---- artifact fragment: no doctype/html/head/body, title kept at the top ---- */
fs.writeFileSync(
  path.join(here, "dist", "artifact.html"),
  "<title>Latent — Motion &amp; Interface Studio</title>\n" +
    FONTS + "\n" +
    style + "\n" +
    bodyNoScripts.trim() + "\n" +
    script + "\n",
  "utf8"
);

for (const f of ["latent.html", "artifact.html"]) {
  const p = path.join(here, "dist", f);
  console.log(f.padEnd(16), (fs.statSync(p).size / 1024).toFixed(1) + " KB");
}
