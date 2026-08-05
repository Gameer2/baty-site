/* Numerical Engine — shared runtime: chrome (header/reveal/crosshairs),
   hero background, math parsing helpers, KaTeX + Plotly helpers. */
(function (global) {
  "use strict";

  const Engine = {};

  /* ---------------- page chrome ---------------- */

  Engine.initChrome = function () {
    const header = document.querySelector(".site-header");
    if (header) {
      const onScroll = () => {
        header.classList.toggle("is-scrolled", window.scrollY > 40);
      };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    // inject glow + duplicate-text spans into every .btn that doesn't have them yet
    document.querySelectorAll(".btn").forEach((btn) => {
      if (!btn.querySelector(".glow")) {
        const glow = document.createElement("span");
        glow.className = "glow";
        btn.prepend(glow);
      }
      const textEl = btn.querySelector(".btn-text");
      if (textEl && !textEl.querySelector(".dup")) {
        const label = textEl.textContent.trim();
        textEl.innerHTML = `<span>${label}</span><span class="dup" aria-hidden="true">${label}</span>`;
      }
    });

    // Worked-example preset chips: render real KaTeX from data-tex instead of a
    // hardcoded unicode approximation of the math, on every page that has one —
    // add data-tex to a button.tag and it just works, no per-page JS needed.
    document.querySelectorAll("button.tag[data-tex]").forEach((btn) => {
      if (btn.querySelector(".tag-tex")) return;
      const span = document.createElement("span");
      span.className = "tag-tex";
      Engine.renderKatex(span, btn.dataset.tex, false);
      btn.textContent = "";
      btn.appendChild(span);
    });

    // inject crosshair corner marks into any .crosshair-host
    document.querySelectorAll(".crosshair-host").forEach((host) => {
      if (host.querySelector(".crosshair")) return;
      host.style.position = host.style.position || "relative";
      ["tl", "tr", "bl", "br"].forEach((pos) => {
        const mark = document.createElement("span");
        mark.className = `crosshair ${pos}`;
        host.appendChild(mark);
      });
    });

    // reveal-on-scroll
    const revealEls = document.querySelectorAll(".reveal");
    if (revealEls.length) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
      );
      revealEls.forEach((el) => io.observe(el));
    }
  };

  /* ---------------- math expression helpers ---------------- */

  // Compiles a single-variable expression f(x). Returns { ok, fn, node, error }
  Engine.compileFx = function (exprStr, variable = "x") {
    try {
      if (!exprStr || !exprStr.trim()) return { ok: false, error: "Enter an expression." };
      const node = math.parse(exprStr);
      const code = node.compile();
      const fn = (val) => {
        const scope = {};
        scope[variable] = val;
        const r = code.evaluate(scope);
        if (typeof r !== "number" || Number.isNaN(r)) throw new Error("not a real number");
        return r;
      };
      // smoke-test evaluation
      fn(1);
      return { ok: true, fn, node };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  };

  Engine.derivativeFx = function (node, variable = "x") {
    try {
      const dnode = math.derivative(node, variable);
      const code = dnode.compile();
      const fn = (val) => {
        const scope = {};
        scope[variable] = val;
        return code.evaluate(scope);
      };
      return { ok: true, fn, node: dnode, latex: dnode.toTex({ parenthesis: "auto" }) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  };

  Engine.toLatex = function (exprStr) {
    try {
      return math.parse(exprStr).toTex({ parenthesis: "auto" });
    } catch {
      return exprStr;
    }
  };

  /* ---------------- on-screen math keypad ----------------
     Inserts literal math.js-syntax tokens at the cursor of a text input —
     no LaTeX parsing involved, so whatever gets typed is exactly what
     Engine.compileFx() already parses safely. */

  // "wrap" keys act on a text selection when one exists (select "x+1", tap sin -> sin(x+1));
  // with no selection they fall back to inserting the empty shell with the cursor placed inside.
  const KEYPAD_LAYOUT = [
    { type: "wrap", label: "sin", tex: "\\sin", prefix: "sin(", suffix: ")", cls: "key--fn" },
    { type: "wrap", label: "cos", tex: "\\cos", prefix: "cos(", suffix: ")", cls: "key--fn" },
    { type: "wrap", label: "tan", tex: "\\tan", prefix: "tan(", suffix: ")", cls: "key--fn" },
    { type: "wrap", label: "cot", tex: "\\cot", prefix: "cot(", suffix: ")", cls: "key--fn" },
    { type: "wrap", label: "sec", tex: "\\sec", prefix: "sec(", suffix: ")", cls: "key--fn" },
    { type: "wrap", label: "csc", tex: "\\csc", prefix: "csc(", suffix: ")", cls: "key--fn" },
    { type: "wrap", label: "asin", tex: "\\sin^{-1}", prefix: "asin(", suffix: ")", cls: "key--fn" },
    { type: "wrap", label: "acos", tex: "\\cos^{-1}", prefix: "acos(", suffix: ")", cls: "key--fn" },
    { type: "wrap", label: "atan", tex: "\\tan^{-1}", prefix: "atan(", suffix: ")", cls: "key--fn" },
    { type: "wrap", label: "ln", tex: "\\ln", prefix: "log(", suffix: ")", cls: "key--fn" },
    { type: "wrap", label: "log10", tex: "\\log_{10}", prefix: "log10(", suffix: ")", cls: "key--fn" },
    { type: "wrap", label: "sqrt", tex: "\\sqrt{\\phantom{x}}", prefix: "sqrt(", suffix: ")", cls: "key--fn" },
    { type: "wrap", label: "abs", tex: "|x|", prefix: "abs(", suffix: ")", cls: "key--fn" },
    { type: "wrap", label: "exp", tex: "e^{x}", prefix: "exp(", suffix: ")", cls: "key--fn" },
    { type: "wrap", label: "x2", tex: "x^{2}", prefix: "(", suffix: ")^2", emptyInsert: "^2", emptyCursorBack: 0, cls: "key--fn" },
    { type: "insert", label: "x", insert: "x" },
    { type: "insert", label: "^", insert: "^" },
    { type: "insert", label: "pi", tex: "\\pi", insert: "pi" },
    { type: "insert", label: "e", insert: "e" },
    { type: "insert", label: "(", insert: "(" },
    { type: "insert", label: ")", insert: ")" },
    { type: "insert", label: "+", insert: "+" },
    { type: "insert", label: "−", insert: "-" },
    { type: "insert", label: "×", insert: "*" },
    { type: "insert", label: "÷", insert: "/" },
    { type: "action", label: "⌫", action: "backspace", cls: "key--danger" },
    { type: "action", label: "Clear", action: "clear", cls: "key--danger key--wide" },
  ];

  function insertAtCursor(el, text, cursorBack = 0) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    const pos = start + text.length - cursorBack;
    el.focus();
    el.setSelectionRange(pos, pos);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function applyWrapKey(el, k) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const selected = el.value.slice(start, end);
    const after = el.value.slice(end);
    if (selected.length > 0) {
      const wrapped = (k.prefix || "") + selected + (k.suffix || "");
      el.value = before + wrapped + after;
      const pos = start + wrapped.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    } else {
      const text = k.emptyInsert !== undefined ? k.emptyInsert : (k.prefix || "") + (k.suffix || "");
      const back = k.emptyCursorBack !== undefined ? k.emptyCursorBack : (k.suffix ? k.suffix.length : 0);
      el.value = before + text + after;
      const pos = start + text.length - back;
      el.focus();
      el.setSelectionRange(pos, pos);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function backspaceAtCursor(el) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    if (start !== end) {
      el.value = el.value.slice(0, start) + el.value.slice(end);
      el.focus();
      el.setSelectionRange(start, start);
    } else if (start > 0) {
      el.value = el.value.slice(0, start - 1) + el.value.slice(start);
      el.focus();
      el.setSelectionRange(start - 1, start - 1);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  Engine.attachMathKeypad = function (inputEl, containerEl) {
    if (!inputEl || !containerEl) return;
    containerEl.innerHTML = "";
    KEYPAD_LAYOUT.forEach((k) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "key" + (k.cls ? " " + k.cls : "");
      btn.setAttribute("aria-label", k.label);
      btn.title = k.label;
      if (k.tex) {
        const span = document.createElement("span");
        span.className = "key-tex";
        Engine.renderKatex(span, k.tex, false);
        btn.appendChild(span);
      } else {
        btn.textContent = k.label;
      }
      btn.addEventListener("click", () => {
        if (k.type === "action" && k.action === "backspace") backspaceAtCursor(inputEl);
        else if (k.type === "action" && k.action === "clear") {
          inputEl.value = "";
          inputEl.focus();
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (k.type === "wrap") applyWrapKey(inputEl, k);
        else insertAtCursor(inputEl, k.insert, k.back || 0);
      });
      containerEl.appendChild(btn);
    });
  };

  // Collapsible keypad toggle. Defaults open (discoverability) but can be hidden.
  Engine.attachKeypadToggle = function (toggleEl, panelEl) {
    if (!toggleEl || !panelEl) return;
    toggleEl.addEventListener("click", () => {
      const open = panelEl.classList.toggle("is-open");
      toggleEl.classList.toggle("is-open", open);
      panelEl.hidden = !open;
    });
  };

  // Brief highlight flash to visually connect an action (typing, a keypad tap)
  // with the preview/result element it just changed.
  Engine.pulseFlash = function (el) {
    if (!el) return;
    el.classList.remove("pulse");
    // eslint-disable-next-line no-unused-expressions
    void el.offsetWidth; // restart animation
    el.classList.add("pulse");
  };

  Engine.renderKatex = function (el, latex, displayMode = false) {
    if (!el || typeof katex === "undefined") return;
    try {
      katex.render(latex, el, { throwOnError: false, displayMode });
    } catch (err) {
      el.textContent = latex;
    }
  };

  Engine.debounce = function (fn, wait = 250) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  Engine.formatNum = function (x, decimals = 6) {
    if (x === null || x === undefined || Number.isNaN(x)) return "—";
    if (x === 0) return "0";
    const abs = Math.abs(x);
    if (abs !== 0 && (abs < 1e-4 || abs >= 1e6)) return x.toExponential(4);
    return Number(x.toFixed(decimals)).toString();
  };

  /* ---------------- plotly dark theme ---------------- */

  Engine.plotlyBaseLayout = function (overrides = {}) {
    const base = {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Azeret Mono, monospace", color: "#dadada", size: 11 },
      margin: { l: 50, r: 24, t: 24, b: 44 },
      xaxis: {
        gridcolor: "rgba(255,255,255,0.08)",
        zerolinecolor: "rgba(255,255,255,0.25)",
        linecolor: "rgba(255,255,255,0.15)",
        tickfont: { color: "#7d858c" },
      },
      yaxis: {
        gridcolor: "rgba(255,255,255,0.08)",
        zerolinecolor: "rgba(255,255,255,0.25)",
        linecolor: "rgba(255,255,255,0.15)",
        tickfont: { color: "#7d858c" },
      },
      legend: { orientation: "h", y: -0.2, font: { color: "#dadada" } },
      hoverlabel: { bgcolor: "#1b1b1b", bordercolor: "#5c939f", font: { family: "Azeret Mono, monospace", color: "#e7e7e7" } },
    };
    return Object.assign(base, overrides);
  };

  Engine.plotlyConfig = {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToRemove: ["lasso2d", "select2d"],
  };

  /* ---------------- classify -> dispatch -> fallback banner ----------------
     Shared by the auto-solve boards (Numerical's root finder, etc.) — reuses the same
     .solver-box / .solver-classification / .solver-fallback-note component already
     defined in proto.css for the ODE/PDE solver, so every "hand it your problem" board
     on the site reads as one system. opts: { line, why, isFallback, fallbackNote }. */
  Engine.renderClassification = function (container, opts) {
    opts = opts || {};
    container.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "solver-box crosshair-host";

    const cls = document.createElement("div");
    cls.className = "solver-classification" + (opts.isFallback ? " is-fallback" : "");
    cls.innerHTML = "<span class=\"status-dot\"></span><span></span>";
    cls.querySelector("span:last-child").textContent = opts.line || "";
    wrap.appendChild(cls);

    if (opts.why) {
      const why = document.createElement("p");
      why.className = "p1";
      why.style.margin = "10px 0 0";
      why.textContent = opts.why;
      wrap.appendChild(why);
    }

    if (opts.fallbackNote) {
      const note = document.createElement("div");
      note.className = "solver-fallback-note";
      note.innerHTML = "<span class=\"status-dot\"></span><span></span>";
      note.querySelector("span:last-child").textContent = opts.fallbackNote;
      wrap.appendChild(note);
    }

    container.appendChild(wrap);
  };

  global.Engine = Engine;

  /* Dev-only page-notes widget (math-lab/note-taker/notes-widget.js) — auto-loads on
     localhost/127.0.0.1 or a file:// path, so it never appears for a real visitor. Personal
     review tool, not part of the product.

     Resolved against THIS script's own URL, not against the page's. The widget sits at a fixed
     offset from engine-core.js (assets/js/ -> ../../note-taker/), so one relative resolution
     works for every page at every depth, over http and file:// alike — including the top-level
     hub at the repo root, which sits outside math-lab/ entirely and so can't be located by
     counting path segments. Disk-saving (serve.py's POST endpoint) still needs http; over
     file:// the widget works and falls back to browser-only storage. */
  const selfSrc = document.currentScript && document.currentScript.src;
  if (location.protocol === "file:" || location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    const loadNotesWidget = () => {
      const s = document.createElement("script");
      s.src = selfSrc
        ? new URL("../../note-taker/notes-widget.js", selfSrc).href
        : "/math-lab/note-taker/notes-widget.js";
      document.body.appendChild(s);
    };
    if (document.body) loadNotesWidget();
    else document.addEventListener("DOMContentLoaded", loadNotesWidget);
  }
})(window);
