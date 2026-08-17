/* Schools lesson-page shared shell (JS half). See DESIGN_SYSTEM.md §14.
   Loaded after GSAP and KaTeX. Provides: numeral helpers, the i18n engine, the KaTeX
   equation-bar helper, and the generic "Explain this" tour engine. The bespoke scene
   (drag interaction, render(), scene-specific markup) is NOT here — every lesson writes
   its own, per §14.3. */
(function (global) {
  "use strict";

  // ---------------- numerals ----------------
  // Eastern Arabic-Indic digits for prose/labels. NEVER feed these into KaTeX — confirmed
  // by direct test that it corrupts the whole expression's layout, not just the digits
  // (see DESIGN_SYSTEM.md §14.3.5). The equation bar stays Western-digit always.
  const EASTERN_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

  function digits(n, lang) {
    const s = String(Math.trunc(n));
    if (lang !== "ar") return s;
    return s.replace(/-/g, "−").replace(/[0-9]/g, d => EASTERN_DIGITS[+d]);
  }

  // Decimal-aware version — deliberately stays Western-digit (plain "." and "-") in BOTH
  // languages. Resolved per DESIGN_SYSTEM.md §14.4: Eastern Arabic-Indic ٠ and ٥ are too
  // easy to confuse at UI sizes (confirmed by direct test), and Unit 6+ is decimal-heavy
  // enough that this isn't an edge case worth a size-floor patch. Same precedent as the
  // KaTeX equation bar (§14.3.5): Western digits, always, whenever a decimal is shown.
  // Any element that displays this still needs `direction:ltr; unicode-bidi:isolate` — a
  // sign can visually reorder to the wrong end of the number even in Western digits inside
  // an RTL paragraph (confirmed by direct test).
  function digitsDecimal(value, lang, fixed) {
    return typeof fixed === "number" ? value.toFixed(fixed) : String(value);
  }

  // ---------------- i18n ----------------
  // T = { en: {...strings, tour:[...]}, ar: {...strings, tour:[...]} }
  // Drives: dir/lang attribute, .lang-pill active state, title-primary/secondary swap
  // (elements #titleEn/#titleAr if present), [data-role] -> .ar-display/.ar-body/.ar-ui,
  // [data-i18n] text swap, and nav pill text (#navPrevText/#navNextText/#navNextLabel/
  // #navPrevLabel if present). Calls opts.onLangChange(lang) last so the lesson can
  // re-render its scene's dynamic text/numerals.
  function initI18n(T, opts) {
    opts = opts || {};
    let lang = "en";

    function applyLang(newLang) {
      lang = newLang;
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
      document.querySelectorAll(".lang-pill button").forEach(b => {
        b.classList.toggle("active", b.dataset.lang === lang);
      });

      const titleEn = document.getElementById("titleEn");
      const titleAr = document.getElementById("titleAr");
      if (titleEn && titleAr) {
        titleEn.classList.toggle("title-primary", lang === "en");
        titleEn.classList.toggle("title-secondary", lang === "ar");
        titleAr.classList.toggle("title-primary", lang === "ar");
        titleAr.classList.toggle("title-secondary", lang === "en");
      }

      document.querySelectorAll("[data-role]").forEach(el => {
        const role = el.dataset.role;
        el.classList.toggle("ar-display", lang === "ar" && role === "display");
        el.classList.toggle("ar-body", lang === "ar" && role === "body");
        el.classList.toggle("ar-ui", lang === "ar" && role === "ui");
      });

      document.querySelectorAll("[data-i18n]").forEach(el => {
        const val = T[lang][el.dataset.i18n];
        if (val !== undefined) el.textContent = val;
      });

      const map = {
        navPrevText: "navPrev", navNextText: "navNext",
        navNextLabel: "navNextLabel", navPrevLabel: "navPrevLabel"
      };
      Object.keys(map).forEach(id => {
        const el = document.getElementById(id);
        if (el && T[lang][map[id]] !== undefined) el.textContent = T[lang][map[id]];
      });

      if (opts.onLangChange) opts.onLangChange(lang);
    }

    document.querySelectorAll(".lang-pill button").forEach(btn => {
      btn.addEventListener("click", () => applyLang(btn.dataset.lang));
    });

    return {
      get lang() { return lang; },
      applyLang
    };
  }

  // ---------------- KaTeX equation bar ----------------
  // Always Western digits, always LTR — see DESIGN_SYSTEM.md §14.3.5. `source` is a LaTeX
  // string, typically built with \color{#hex}{...} spans matching --electric-teal/--infrared
  // (KaTeX doesn't read CSS custom properties, so those need to be literal hex here).
  function renderEquation(container, source) {
    if (!container || container.dataset.src === source) return;
    container.dataset.src = source;
    global.katex.render(source, container, { throwOnError: false });
    container.classList.remove("flash");
    void container.offsetWidth;
    container.classList.add("flash");
  }

  // ---------------- "Explain this" tour ----------------
  // getSteps() must return T[lang].tour — an array of steps, each either
  //   { elKey: "diver", label, body }               -> targets [data-el="diver"]
  //   { ids: ["a","b","c"], label, body }            -> targets union of #a #b #c
  // getLang() returns the current language string (for dot-progress dir + button labels).
  function buildTour(stageEl, getSteps, getLang) {
    const scrim = document.createElement("div");
    scrim.className = "tour-scrim";
    stageEl.appendChild(scrim);
    const ring = document.createElement("div");
    ring.className = "tour-ring";
    stageEl.appendChild(ring);
    const tip = document.createElement("div");
    tip.className = "tour-tip";
    tip.innerHTML =
      '<div class="tour-tip-label"></div>' +
      '<div class="tour-tip-body"></div>' +
      '<div class="tour-tip-foot">' +
      '<div class="tour-dots"></div>' +
      '<div class="tour-nav"><button class="tSkip"></button><button class="tNext primary"></button></div>' +
      "</div>";
    stageEl.appendChild(tip);
    const dotsWrap = tip.querySelector(".tour-dots");

    let i = 0;
    let currentEls = [];
    let dotsBuiltFor = -1;

    function resolveEls(step) {
      if (step.ids) return step.ids.map(id => document.getElementById(id)).filter(Boolean);
      const el = stageEl.querySelector('[data-el="' + step.elKey + '"]');
      return el ? [el] : [];
    }
    function unionRect(els) {
      const rects = els.map(e => e.getBoundingClientRect());
      const left = Math.min.apply(null, rects.map(r => r.left));
      const top = Math.min.apply(null, rects.map(r => r.top));
      const right = Math.max.apply(null, rects.map(r => r.right));
      const bottom = Math.max.apply(null, rects.map(r => r.bottom));
      return { left: left, top: top, width: right - left, height: bottom - top };
    }
    function position(rect) {
      const bRect = stageEl.getBoundingClientRect();
      const ringLeft = rect.left - bRect.left - 10;
      const ringTop = rect.top - bRect.top - 10;
      ring.style.left = ringLeft + "px";
      ring.style.top = ringTop + "px";
      ring.style.width = (rect.width + 20) + "px";
      ring.style.height = (rect.height + 20) + "px";
      let tipLeft = Math.max(12, Math.min(ringLeft, bRect.width - 312));
      let tipTop = ringTop + rect.height + 30;
      if (tipTop > bRect.height - 170) tipTop = ringTop - 190;
      if (tipTop < 4) tipTop = Math.min(bRect.height - 170, ringTop + rect.height + 30);
      tip.style.left = tipLeft + "px";
      tip.style.top = tipTop + "px";
    }
    function show(idx) {
      const steps = getSteps();
      const lang = getLang();
      if (dotsBuiltFor !== steps.length) {
        dotsWrap.innerHTML = "";
        steps.forEach(() => dotsWrap.appendChild(document.createElement("span")));
        dotsBuiltFor = steps.length;
      }
      currentEls.forEach(e => e && e.classList.remove("is-current"));
      const step = steps[idx];
      const els = resolveEls(step);
      currentEls = els;
      els.forEach(e => e.classList.add("is-current"));
      tip.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      const lbl = tip.querySelector(".tour-tip-label");
      lbl.textContent = step.label;
      lbl.classList.toggle("ar-ui", lang === "ar");
      const body = tip.querySelector(".tour-tip-body");
      body.textContent = step.body;
      body.classList.toggle("ar-body", lang === "ar");
      dotsWrap.querySelectorAll("span").forEach((d, di) => d.classList.toggle("is-active", di === idx));
      tip.querySelector(".tSkip").textContent = lang === "ar" ? "تخطّ" : "Skip";
      tip.querySelector(".tNext").textContent =
        idx === steps.length - 1 ? (lang === "ar" ? "تم" : "Done") : (lang === "ar" ? "التالي ←" : "Next →");
      if (els.length) position(unionRect(els));
      ring.classList.add("is-visible");
      tip.classList.add("is-visible");
    }
    function start(onStart) {
      if (onStart) onStart();
      i = 0;
      stageEl.classList.add("dim");
      scrim.classList.add("is-visible");
      show(i);
    }
    function end() {
      stageEl.classList.remove("dim");
      scrim.classList.remove("is-visible");
      ring.classList.remove("is-visible");
      tip.classList.remove("is-visible");
      currentEls.forEach(e => e && e.classList.remove("is-current"));
      currentEls = [];
    }
    tip.querySelector(".tSkip").addEventListener("click", end);
    tip.querySelector(".tNext").addEventListener("click", () => {
      const steps = getSteps();
      if (i === steps.length - 1) { end(); return; }
      i++; show(i);
    });
    scrim.addEventListener("click", end);
    document.addEventListener("keydown", e => { if (e.key === "Escape") end(); });
    return {
      start: onStart => start(onStart),
      end: end,
      toggle: onStart => (stageEl.classList.contains("dim") ? end() : start(onStart))
    };
  }

  // ---------------- "Explain this" → professor's notebook ----------------
  // A STATE-AWARE replacement for the fixed tour. The lesson supplies getEntry(), which
  // reads the live page state (current step, mode, slider values, lang) and returns:
  //   { ids: ["bi-ca", ...], kicker: "Step 2 of 4 · ...", sections: [ {h, p}, ... ] }
  // The notebook renders that into a glassy panel over `panelEl` (the right rail) and
  // draws a non-blocking highlight ring around the entry's ids on `stageEl`. The board
  // is NEVER dimmed or blocked — the user can keep dragging/stepping while it's open.
  // Call .update() whenever state changes while open; it re-renders + repositions the
  // ring. This is what makes it "dynamic based on the page", not a fixed script.
  function buildNotebook(panelEl, stageEl, getEntry, getLang, opts) {
    opts = opts || {};
    const notebook = document.createElement("div");
    notebook.className = "notebook";
    notebook.innerHTML =
      '<button class="notebook-close" type="button" aria-label="close">&times;</button>' +
      '<div class="notebook-kicker"></div>' +
      '<div class="notebook-scroll"></div>';
    panelEl.appendChild(notebook);
    if (getComputedStyle(panelEl).position === "static") panelEl.style.position = "relative";

    const ring = document.createElement("div");
    ring.className = "notebook-ring";
    stageEl.appendChild(ring);

    // the LIVE virtual mouse cursor — a real arrow pointer that glides across the board
    // to the element the notebook is explaining and "clicks" it (a ripple at the tip).
    // This is the thing that moves to explain.
    const cursor = document.createElement("div");
    cursor.className = "nb-cursor";
    cursor.innerHTML =
      '<div class="nb-cursor-ripple"></div>' +
      '<svg viewBox="0 0 12 19" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M0,0 L0,14 L3.8,10.5 L6.2,17.5 L8.4,16.7 L6,9.8 L10.8,9.8 Z" ' +
        'fill="#ffffff" stroke="#090909" stroke-width="1.1" stroke-linejoin="round"/></svg>' +
      '<div class="nb-cursor-label"></div>';
    stageEl.appendChild(cursor);
    const cursorLabel = cursor.querySelector(".nb-cursor-label");
    const cursorRipple = cursor.querySelector(".nb-cursor-ripple");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lastTip = "";

    const kickerEl = notebook.querySelector(".notebook-kicker");
    const scrollEl = notebook.querySelector(".notebook-scroll");
    let shown = false;
    let lastSig = "";
    let typeToken = 0;

    function unionRect(els) {
      const rects = els.map(function (e) { return e.getBoundingClientRect(); });
      const left = Math.min.apply(null, rects.map(function (r) { return r.left; }));
      const top = Math.min.apply(null, rects.map(function (r) { return r.top; }));
      const right = Math.max.apply(null, rects.map(function (r) { return r.right; }));
      const bottom = Math.max.apply(null, rects.map(function (r) { return r.bottom; }));
      return { left: left, top: top, width: right - left, height: bottom - top };
    }
    function positionRing(rect) {
      const b = stageEl.getBoundingClientRect();
      ring.style.left = (rect.left - b.left - 8) + "px";
      ring.style.top = (rect.top - b.top - 8) + "px";
      ring.style.width = (rect.width + 16) + "px";
      ring.style.height = (rect.height + 16) + "px";
      // the arrow tip lands ON the target center — the cursor points at the part
      const cx = rect.left - b.left + rect.width / 2;
      const cy = rect.top - b.top + rect.height / 2;
      cursor.style.left = cx + "px";
      cursor.style.top = cy + "px";
      // "click" ripple at the tip whenever the target actually moves (not on resize)
      const tip = Math.round(cx) + "," + Math.round(cy);
      if (tip !== lastTip) {
        lastTip = tip;
        if (!reduceMotion && cursorRipple.animate) {
          cursorRipple.animate(
            [{ transform: "scale(.4)", opacity: 0.8 }, { transform: "scale(2.2)", opacity: 0 }],
            { duration: 620, easing: "cubic-bezier(.16,1,.3,1)" });
        }
      }
    }

    // typewriter: the section body types out char-by-char with a blinking caret, so the
    // note reads as the professor writing it live. Headers appear instantly; bodies type
    // sequentially. A token cancels the previous run when state changes mid-type.
    function typeSections(sections) {
      typeToken++;
      const myToken = typeToken;
      const SPEED = 4, CHUNK = 3; // ~1.3ms/char -> a section types in well under a second
      const pEls = Array.prototype.slice.call(scrollEl.querySelectorAll(".nb-p"));
      let si = 0, ci = 0;
      function step() {
        if (myToken !== typeToken) return; // a newer render took over
        if (si >= sections.length) return;
        const full = sections[si].p;
        const p = pEls[si];
        if (ci === 0) { p.classList.add("nb-typing"); p.textContent = ""; }
        ci = Math.min(full.length, ci + CHUNK);
        p.textContent = full.slice(0, ci);
        if (ci >= full.length) { p.classList.remove("nb-typing"); ci = 0; si++; }
        setTimeout(step, SPEED);
      }
      step();
    }
    function revealAll() {
      typeToken++;
      Array.prototype.forEach.call(scrollEl.querySelectorAll(".nb-p"), function (p) {
        p.textContent = p.dataset.full || "";
        p.classList.remove("nb-typing");
      });
    }

    function render() {
      const entry = getEntry();
      const lang = getLang();
      const sig = lang + "|" + entry.kicker + "|" +
        entry.sections.map(function (s) { return s.h + "::" + s.p; }).join("||");
      notebook.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      kickerEl.textContent = entry.kicker;
      kickerEl.classList.toggle("ar-ui", lang === "ar");
      // the cursor carries the step label (the part before "·") so it literally explains
      const short = String(entry.kicker).split("·")[0].trim();
      cursorLabel.textContent = short;
      cursorLabel.classList.toggle("ar-ui", lang === "ar");

      const els = (entry.ids || []).map(function (id) { return document.getElementById(id); }).filter(Boolean);
      if (els.length) { ring.classList.add("is-visible"); cursor.classList.add("is-visible"); positionRing(unionRect(els)); }
      else { ring.classList.remove("is-visible"); cursor.classList.remove("is-visible"); }

      if (sig === lastSig) return; // resize/scroll: keep typed text, just reposition
      lastSig = sig;
      // build skeleton (headers now, bodies empty -> typed next), safe DOM, no markup
      scrollEl.replaceChildren();
      entry.sections.forEach(function (s) {
        const sec = document.createElement("section"); sec.className = "nb-sec";
        const h = document.createElement("h4"); h.className = "nb-h" + (lang === "ar" ? " ar-ui" : ""); h.textContent = s.h;
        const p = document.createElement("p"); p.className = "nb-p" + (lang === "ar" ? " ar-body" : ""); p.dataset.full = s.p; p.textContent = "";
        sec.appendChild(h); sec.appendChild(p); scrollEl.appendChild(sec);
      });
      typeSections(entry.sections);
    }

    function openN() { shown = true; notebook.classList.add("is-visible"); render(); if (opts.onOpen) opts.onOpen(); }
    function closeN() { shown = false; notebook.classList.remove("is-visible"); ring.classList.remove("is-visible"); cursor.classList.remove("is-visible"); typeToken++; if (opts.onClose) opts.onClose(); }
    function update() { if (shown) render(); }

    notebook.querySelector(".notebook-close").addEventListener("click", closeN);
    // click the notebook to skip the typewriter and reveal the full note instantly
    notebook.addEventListener("click", function (e) {
      if (e.target.closest(".notebook-close")) return;
      revealAll();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && shown) closeN(); });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return {
      open: openN, close: closeN, update: update, isOpen: function () { return shown; },
      toggle: function () { shown ? closeN() : openN(); }
    };
  }

  // Thousands-grouped integer, e.g. 4758213 -> "4,758,213" (en) / "٤٬٧٥٨٬٢١٣" (ar, using
  // the Arabic thousands separator U+066C, distinct from the decimal separator U+066B).
  function groupInt(n, lang) {
    const sign = n < 0 ? (lang === "ar" ? "−" : "-") : "";
    const raw = String(Math.abs(Math.trunc(n)));
    const withCommas = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (lang !== "ar") return sign + withCommas;
    return sign + withCommas.replace(/,/g, "٬").replace(/[0-9]/g, d => EASTERN_DIGITS[+d]);
  }

  /* Dev-only page-notes widget (math-lab/note-taker/notes-widget.js) — auto-loads on
     localhost/127.0.0.1 or file://, mirroring engine-core.js, so it never appears for a
     real visitor. Personal review tool: click any element to pin a design note to it.
     Resolved against THIS script's own URL (schools/assets/js/ -> ../../../math-lab/
     note-taker/), so it works at any depth over http and file://. Disk-save needs serve.py;
     over file:// it falls back to browser-only storage + "Copy all notes". */
  (function () {
    var selfSrc = document.currentScript && document.currentScript.src;
    if (location.protocol === "file:" || location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      var load = function () {
        var s = document.createElement("script");
        s.src = selfSrc ? new URL("../../../math-lab/note-taker/notes-widget.js", selfSrc).href
                        : "/math-lab/note-taker/notes-widget.js";
        document.body.appendChild(s);
      };
      if (document.body) load(); else document.addEventListener("DOMContentLoaded", load);
    }
  })();

  global.LessonShell = { digits, digitsDecimal, groupInt, initI18n, renderEquation, buildTour, buildNotebook };
})(window);
