/* ============================================================
   Referrals Ops Portal — shared behaviour
   Loaded by the module pages (not the self-contained playbook).
   Keep this dependency-free so it works on plain GitHub Pages.
   ============================================================ */
(function () {
  "use strict";

  // --- Highlight the active nav link by filename --------------------------
  var here = location.pathname.split("/").pop() || "index.html";
  if (here === "") here = "index.html";
  document.querySelectorAll(".pn-links a, .sb-link").forEach(function (a) {
    if (a.getAttribute("href") === here) a.classList.add("active");
  });

  // --- Copy-to-clipboard for SQL cards / any .copy button ----------------
  // A .copy button copies its data-target selector, or the nearest <pre>.
  document.querySelectorAll(".copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var sel = btn.getAttribute("data-target");
      var node = sel ? document.querySelector(sel) : null;
      if (!node) {
        var card = btn.closest(".sqlq");
        node = card ? card.querySelector("pre") : null;
      }
      if (!node) return;
      var text = node.innerText;
      var done = function () {
        var old = btn.getAttribute("data-label") || btn.textContent;
        btn.setAttribute("data-label", old);
        btn.textContent = "Copied ✓";
        btn.classList.add("done");
        setTimeout(function () {
          btn.textContent = old;
          btn.classList.remove("done");
        }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallbackCopy);
      } else {
        fallbackCopy();
      }
      function fallbackCopy() {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
  });

  // --- Guard not-yet-wired action forms ----------------------------------
  // Any <form data-wip> shows a notice instead of submitting. The fields
  // and validation are real; only the backend call is pending.
  document.querySelectorAll("form[data-wip]").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = f.getAttribute("data-wip") || "This action";
      alert(
        name +
          " isn’t wired to a backend yet (Not Wired).\n\n" +
          "The form, fields and validation are in place — the API call " +
          "and audit-log write get connected in a later phase."
      );
    });
  });
})();
