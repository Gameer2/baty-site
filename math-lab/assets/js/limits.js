/* Limits page wiring. All symbolic work lives in calculus-symbolic.js and runs inside the
   CAS worker — this file only reads inputs, calls CAS.limit, and renders.

   Three outcomes get rendered here, all of them legitimate answers rather than errors:
   a finite value, a divergence to ±∞, and "does not exist". The DNE case is the one worth
   getting right on screen: it is not a failure, it is the correct response to lim(1/x) at 0,
   and the approach table is the evidence for it. */
(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const atInput = document.getElementById("atInput");
  const fxPreview = document.getElementById("fxPreview");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("limitForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statValue = document.getElementById("statValue");
  const statLeft = document.getElementById("statLeft");
  const statRight = document.getElementById("statRight");
  const formulaResult = document.getElementById("formulaResult");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const approachHead = document.getElementById("approachHead");
  const approachBody = document.querySelector("#approachTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  const VARIABLE = "x";
  let state = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Matches the engine's own accepted spellings so the page never sends something the
  // engine will reject.
  function parsePoint(raw) {
    const s = String(raw).trim();
    if (/^[+]?inf(inity)?$/i.test(s)) return { ok: true, value: "Infinity", label: "∞", numeric: Infinity };
    if (/^-inf(inity)?$/i.test(s)) return { ok: true, value: "-Infinity", label: "-∞", numeric: -Infinity };
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return { ok: false };
    return { ok: true, value: s, label: s, numeric: n };
  }

  function updatePreview() {
    const raw = fxInput.value.trim();
    const pt = parsePoint(atInput.value);
    const tex = raw ? Engine.toLatex(raw) : "";
    const at = pt.ok ? (pt.label === "∞" ? "\\infty" : pt.label === "-∞" ? "-\\infty" : pt.label) : "?";
    Engine.renderKatex(fxPreview, raw ? `\\lim_{x \\to ${at}} ${tex}` : "", false);
    Engine.pulseFlash(fxPreview);
  }

  function updateStartCheck() {
    const raw = fxInput.value.trim();
    if (!raw) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter a function.";
      return false;
    }
    const compiled = Engine.compileFx(raw, VARIABLE);
    if (!compiled.ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = compiled.error;
      return false;
    }
    if (!parsePoint(atInput.value).ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "The point must be a number, Infinity, or -Infinity.";
      return false;
    }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Ready — press Evaluate.";
    return true;
  }

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }

  function fmt(y) {
    if (y === null || y === undefined) return "undefined";
    if (!Number.isFinite(y)) return "—";
    return Engine.formatNum(y, 8);
  }

  function render(result, pt) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "";
    formError.style.display = "none";
    state = { steps: result.steps };

    const dne = result.kind === "dne";
    statValue.textContent = dne ? "does not exist" : String(result.value);
    statLeft.textContent = result.sides && result.sides.left !== null ? result.sides.left : "—";
    statRight.textContent = result.sides ? result.sides.right : "—";

    const atTex = pt.label === "∞" ? "\\infty" : pt.label === "-∞" ? "-\\infty" : pt.label;
    const lhs = `\\lim_{x \\to ${atTex}} ${Engine.toLatex(fxInput.value.trim())}`;
    Engine.renderKatex(formulaResult, `${lhs} = ${dne ? "\\text{does not exist}" : result.latex}`, true);

    // Derivation ladder — same idiom as the u-substitution page.
    stepTableBody.innerHTML = result.steps
      .map((s, i) => `<tr data-n="${i}"><td>${i + 1}</td><td>${escapeHtml(s.rule)}</td><td><span class="step-tex" data-i="${i}"></span></td></tr>`)
      .join("");
    stepTableBody.querySelectorAll(".step-tex").forEach((el) => {
      Engine.renderKatex(el, result.steps[Number(el.dataset.i)].latex, false);
    });

    renderApproachTable(result.table, pt);

    stepSlider.min = 0;
    stepSlider.max = Math.max(0, result.steps.length - 1);
    stepSlider.value = result.steps.length - 1;
    updateStep(result.steps.length - 1);

    plot(result, pt);
  }

  // Two-sided for a finite point, one-sided at infinity — the engine reports which by
  // leaving the left-hand columns null.
  function renderApproachTable(table, pt) {
    const oneSided = !table.length || table[0].xLeft === null;
    approachHead.innerHTML = oneSided
      ? "<th>x</th><th>f(x)</th>"
      : "<th>x → from the left</th><th>f(x)</th><th>x → from the right</th><th>f(x)</th>";
    approachBody.innerHTML = table.map((r) => oneSided
      ? `<tr><td class="mono">${fmt(r.xRight)}</td><td class="mono">${fmt(r.fRight)}</td></tr>`
      : `<tr><td class="mono">${fmt(r.xLeft)}</td><td class="mono">${fmt(r.fLeft)}</td><td class="mono">${fmt(r.xRight)}</td><td class="mono">${fmt(r.fRight)}</td></tr>`
    ).join("");
  }

  function plot(result, pt) {
    const f = Engine.compileFx(fxInput.value.trim(), VARIABLE);
    if (!f.ok) { Plotly.purge("fxPlot"); return; }

    // At infinity, sweep out to where the behaviour is obvious; near a finite point, sit in a
    // tight window around it so the interesting part is not a single pixel.
    const finite = Number.isFinite(pt.numeric);
    const lo = finite ? pt.numeric - 2 : 0.5;
    const hi = finite ? pt.numeric + 2 : 60;

    const xs = [], ys = [];
    for (let i = 0; i <= 600; i++) {
      const x = lo + (i / 600) * (hi - lo);
      let y;
      try { y = f.fn(x); } catch { y = null; }
      xs.push(x);
      ys.push(Number.isFinite(y) ? y : null);
    }

    const traces = [{ x: xs, y: ys, mode: "lines", name: "f(x)", line: { color: "#5c939f", width: 2.5 } }];
    const shapes = [];

    if (finite) {
      shapes.push({
        type: "line", x0: pt.numeric, x1: pt.numeric, yref: "paper", y0: 0, y1: 1,
        line: { color: "#7d858c", width: 1, dash: "dot" }
      });
    }

    // Mark the limit itself with an open circle: the value is approached, not necessarily
    // attained, and for a removable discontinuity f is not even defined there.
    const numericLimit = result.kind === "finite" ? Number(numericValueOf(result.value)) : null;
    if (numericLimit !== null && Number.isFinite(numericLimit)) {
      shapes.push({
        type: "line", xref: "paper", x0: 0, x1: 1, y0: numericLimit, y1: numericLimit,
        line: { color: "#ed6d40", width: 1, dash: "dash" }
      });
      if (finite) {
        traces.push({
          x: [pt.numeric], y: [numericLimit], mode: "markers", name: "limit",
          marker: { color: "#ed6d40", size: 11, symbol: "circle-open", line: { width: 2.5 } }
        });
      }
    }

    Plotly.newPlot("fxPlot", traces, Engine.plotlyBaseLayout({ shapes }), Engine.plotlyConfig);
  }

  // The engine returns exact strings ("1/2", "e"); the plot needs a number. math.js parses
  // both, so no CAS round-trip is needed for this.
  function numericValueOf(value) {
    try { return parseFloat(math.evaluate(String(value))); } catch (e) { return NaN; }
  }

  function updateStep(idx) {
    if (!state) return;
    const n = Math.max(0, Math.min(state.steps.length - 1, idx));
    stepTableBody.querySelectorAll("tr").forEach((tr) => {
      const rowN = Number(tr.dataset.n);
      tr.classList.toggle("is-current", rowN === n);
      tr.style.opacity = rowN <= n ? "" : "0.25";
    });
    stepLabel.textContent = `step ${n + 1} / ${state.steps.length}`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    formError.style.display = "none";
    if (!updateStartCheck()) return;

    const pt = parsePoint(atInput.value);
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const previousLabel = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Evaluating…";

    CAS.limit(fxInput.value.trim(), VARIABLE, pt.value)
      .then((result) => {
        // ok:false means the engine could not determine the answer — distinct from DNE,
        // which is an answer and goes through render().
        if (!result.ok) {
          resultsArea.style.display = "none";
          placeholderPanel.style.display = "";
          showError(result.reason);
          return;
        }
        render(result, pt);
      })
      .catch((err) => showError(err.message))
      .then(() => {
        if (submitBtn) submitBtn.textContent = previousLabel;
        if (CAS.mode() === "sync") {
          startStatus.className = "status-line bad";
          startStatusText.textContent =
            "Running without a Web Worker (opened over file://?) — a difficult expression can freeze the page. Serve the site over http:// to restore the safety timeout.";
        }
      });
  });

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "(1-cos(x))/x^2";
    atInput.value = "0";
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    fxInput.value = btn.dataset.fx;
    atInput.value = btn.dataset.at;
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  fxInput.addEventListener("input", debounced);
  atInput.addEventListener("input", debounced);

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));

  updatePreview();
  updateStartCheck();
})();
