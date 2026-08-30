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
