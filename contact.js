/* ============================================================
   CONTACT — the slate, filled in.

   There is no backend: GitHub Pages serves static files, so a POST has
   nowhere to land. Rather than showing a success message and quietly
   dropping the message — which is worse than having no form at all —
   the slate is composed into a mailto and handed to the visitor's mail
   app. It genuinely delivers, with nothing to host.

   To move to a real endpoint later, set ENDPOINT to a Formspree (or
   similar) URL. Everything else here already works: the same validation
   runs, and the same stamp shows on success.
   ============================================================ */

(function () {
  "use strict";

  /* ── the web in the right column ──────────────────────────── */

  var webCv = document.querySelector("[data-web]");
  // Needs hover to tear, so fine pointers only. On touch there is no cursor
  // to cut with, and an untouched web is just a static drawing costing a
  // frame budget — so it is not mounted at all.
  if (webCv && window.WEB && !RIG.reduced && !RIG.coarse) {
    var web = WEB.mount(webCv);
    window.__web = web;   // handle for verification
    // the canvas is position:fixed, so its rect does not move with scroll —
    // no scroll compensation needed when mapping the pointer into it
    var wbox = { left: 0, top: 0 };

    var wmeasure = function () {
      var r = webCv.getBoundingClientRect();
      wbox.left = r.left;
      wbox.top = r.top;
      web.resize();
    };
    wmeasure();
    addEventListener("resize", wmeasure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(wmeasure);

    // The spider must never chase a pointer that is aiming at a form field.
    // Rects are cached rather than using elementFromPoint, which is a layout
    // read and pointermove fires far too often for that.
    var noHunt = [];
    var mapZones = function () {
      // Only what someone actually aims at. The header is plain text — a
      // spider crossing it costs nothing, and including it swallowed most of
      // the open web, leaving almost nowhere for the chase to happen.
      noHunt = [".slate-form", ".cform__aside"]
        .map(function (sel) { return document.querySelector(sel); })
        .filter(Boolean)
        .map(function (el) {
          var r = el.getBoundingClientRect();
          return { l: r.left - 14, t: r.top - 14, r: r.right + 14, b: r.bottom + 14 };
        });
    };
    var overContent = function (cx, cy) {
      for (var i = 0; i < noHunt.length; i++) {
        var z = noHunt[i];
        if (cx >= z.l && cx <= z.r && cy >= z.t && cy <= z.b) return true;
      }
      return false;
    };
    mapZones();
    addEventListener("resize", mapZones);
    addEventListener("scroll", mapZones, { passive: true });

    var wptr = { cx: -9999, cy: -9999, on: false };
    addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      wptr.cx = e.clientX; wptr.cy = e.clientY; wptr.on = true;
    }, { passive: true });
    addEventListener("pointerleave", function () { wptr.on = false; web.leave(); });
    addEventListener("blur", function () { wptr.on = false; web.leave(); });

    RIG.frame(function () {
      if (wptr.on) {
        // the web still ripples everywhere; only the hunt is gated
        web.at(wptr.cx - wbox.left, wptr.cy - wbox.top, !overContent(wptr.cx, wptr.cy));
      } else {
        web.leave();
      }
      web.frame(performance.now());
    });
  }

  /* ── the form ─────────────────────────────────────────────── */

  var ENDPOINT = "";                       // e.g. "https://formspree.io/f/xxxxxxx"
  var TO = "apequaltowork@gmail.com";

  var form = document.querySelector("[data-cform]");
  if (!form) return;

  var errEl = form.querySelector("[data-cform-err]");
  var okEl = form.querySelector("[data-cform-ok]");

  function val(name) {
    var el = form.elements[name];
    return el ? el.value.trim() : "";
  }

  function fail(msg, focusName) {
    errEl.textContent = msg;
    errEl.hidden = false;
    var el = form.elements[focusName];
    if (el) { el.classList.add("is-bad"); el.focus(); }
  }

  function clearErrors() {
    errEl.hidden = true;
    Array.prototype.forEach.call(form.querySelectorAll(".is-bad"), function (el) {
      el.classList.remove("is-bad");
    });
  }

  // Deliberately loose: the only thing worth rejecting is an address that
  // obviously cannot work. Over-strict email regexes turn away real people.
  function looksLikeEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  function compose() {
    var lines = [
      "Name:      " + val("name"),
      "Email:     " + val("email"),
      "Company:   " + (val("company") || "—"),
      "Project:   " + val("project"),
      "Budget:    " + val("budget"),
      "Timeline:  " + val("timeline"),
      "",
      "Brief",
      "-----",
      val("brief")
    ];
    return {
      subject: "Project enquiry — " + (val("company") || val("name")),
      body: lines.join("\n")
    };
  }

  function succeed() {
    form.classList.add("is-sent");
    okEl.hidden = false;
    okEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearErrors();

    if (!val("name")) return fail("Add a name so I know who I am replying to.", "name");
    if (!looksLikeEmail(val("email"))) return fail("That email address does not look right — I need a working one to reply to.", "email");
    if (val("brief").length < 20) return fail("Tell me a little more in the brief — a sentence or two is enough to start.", "brief");

    var msg = compose();

    if (ENDPOINT) {
      var data = new FormData(form);
      fetch(ENDPOINT, { method: "POST", body: data, headers: { Accept: "application/json" } })
        .then(function (r) {
          if (r.ok) succeed();
          else fail("That did not send. Email " + TO + " directly and I will pick it up.", "name");
        })
        .catch(function () {
          fail("That did not send — you may be offline. Email " + TO + " directly.", "name");
        });
      return;
    }

    // no endpoint: hand the composed slate to the visitor's mail app
    window.location.href = "mailto:" + TO +
      "?subject=" + encodeURIComponent(msg.subject) +
      "&body=" + encodeURIComponent(msg.body);
    succeed();
  });

  // clear a field's error state as soon as it is touched again
  form.addEventListener("input", function (e) {
    if (e.target.classList.contains("is-bad")) {
      e.target.classList.remove("is-bad");
      errEl.hidden = true;
    }
  });
})();
