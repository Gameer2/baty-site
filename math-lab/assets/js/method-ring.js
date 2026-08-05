/* Floating rings on a single category's method page. Each .method-ring holds a set
   of .ring-card elements; --quantity/--index (needed for the rotateY placement math
   in engine.css) are computed here from the DOM, so adding/removing a method is just
   adding/removing a card.

   Clicking a card never flips it in place — a card nested inside the ring's spinning,
   tilted 3D space can't reliably "face the camera" on its own (it inherits whatever
   rotation the ring happens to be frozen at when clicked). Instead the ring just
   pauses and a single flat, centered #methodDetail popup (outside the 3D transform
   tree entirely) is filled in from the card's data-* attributes. */
(function () {
  "use strict";

  var currentRing = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function openDetail(card, ring) {
    var overlay = document.getElementById("methodDetail");
    var body = document.getElementById("detailBody");
    if (!overlay || !body) return;
    var tags = (card.dataset.tags || "").split("|").filter(Boolean)
      .map(function (t) { return '<span class="tag">' + escapeHtml(t) + "</span>"; })
      .join("");
    body.innerHTML =
      '<span class="eyebrow">' + escapeHtml(card.dataset.eyebrow || "") + "</span>" +
      "<h4>" + escapeHtml(card.dataset.title || "") + "</h4>" +
      "<p>" + escapeHtml(card.dataset.desc || "") + "</p>" +
      '<div class="method-tags">' + tags + "</div>" +
      '<a href="' + escapeHtml(card.dataset.href || "#") + '" class="btn btn--ghost btn--sm">Open →</a>';
    ring.classList.add("is-paused");
    overlay.hidden = false;
    currentRing = ring;
  }

  function closeDetail() {
    var overlay = document.getElementById("methodDetail");
    if (overlay) overlay.hidden = true;
    if (currentRing) currentRing.classList.remove("is-paused");
    currentRing = null;
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDetail();
  });

  function initDetailOverlay() {
    var overlay = document.getElementById("methodDetail");
    if (!overlay) return;
    var closeBtn = document.getElementById("detailClose");
    var backdrop = overlay.querySelector(".method-detail-backdrop");
    if (closeBtn) closeBtn.addEventListener("click", closeDetail);
    if (backdrop) backdrop.addEventListener("click", closeDetail);
  }

  function initRing(ring) {
    var inner = ring.querySelector(".ring-inner");
    var cards = Array.prototype.slice.call(ring.querySelectorAll(".ring-card"));
    if (!inner || !cards.length) return;
    var n = cards.length;

    // Keep card spacing consistent whether a category has 4 methods or 7: radius
    // scales with card count instead of using one fixed distance for every ring.
    var w = parseFloat(getComputedStyle(ring).getPropertyValue("--w")) || 120;
    var radius = Math.round(w / (2 * Math.sin(Math.PI / n)) * 1.35);
    inner.style.setProperty("--quantity", n);
    inner.style.setProperty("--translateZ", radius + "px");
    cards.forEach(function (card, i) { card.style.setProperty("--index", i); });

    ring.addEventListener("click", function (e) {
      var card = e.target.closest(".ring-card");
      if (!card || !ring.contains(card)) return;
      openDetail(card, ring);
    });
  }

  function init() {
    document.querySelectorAll(".method-ring").forEach(initRing);
    initDetailOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
