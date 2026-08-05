/* Vector Calculus page wiring. The symbolic work — divergence, curl, the conservative test
   and potential recovery, line-integral work/flux, and Green's theorem computed two ways —
   lives in calculus-symbolic.js behind the CAS worker. This file gathers the field and the
   operation-specific geometry (a parametric curve, or a rectangle), calls
   CalculusSymbolic.vectorCalculus, and renders the per-operation stats, the derivation
   ladder, and a 2D quiver of the field with the curve or rectangle overlaid.

   The picture: a grid of arrows showing F = ⟨P, Q⟩; for a line integral the curve is drawn
   through the field; for Green's theorem the rectangle is drawn, oriented counter-clockwise. */
(function () {
  "use strict";

  const opRow = document.getElementById("opRow");
  const lineFields = document.getElementById("lineFields");
  const greensFields = document.getElementById("greensFields");
  const pInput = document.getElementById("pInput");
  const qInput = document.getElementById("qInput");
  const pPreview = document.getElementById("pPreview");
  const qPreview = document.getElementById("qPreview");
  const lxInput = document.getElementById("lxInput");
  const lyInput = document.getElementById("lyInput");
  const laInput = document.getElementById("laInput");
  const lbInput = document.getElementById("lbInput");
  const x0Input = document.getElementById("x0Input");
  const x1Input = document.getElementById("x1Input");
  const y0Input = document.getElementById("y0Input");
  const y1Input = document.getElementById("y1Input");

  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("vcForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");

  const statStrip = document.getElementById("statStrip");
  const formulaResult = document.getElementById("formulaResult");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const plotTitle = document.getElementById("plotTitle");

  let op = "divergence-curl";
  let steps = [];
  let result = null;
  let plotState = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function showRefused(r) {
    resultsArea.style.display = "none";
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "";
    refusedReason.textContent = r.reason;
  }

  // Compile a 1- or 2-variable expression to a numeric fn.
  function makeFn(expr, v) {
    try {
      const code = math.parse(expr).compile();
      const scope = {}; scope[v] = 0;
      return (u) => { scope[v] = u; const r = code.evaluate(scope); return (typeof r === "number" && Number.isFinite(r)) ? r : NaN; };
    } catch (e) { return null; }
  }
  function makeFn2(expr) {
    try {
      const code = math.parse(expr).compile();
      const scope = { x: 0, y: 0 };
      return (x, y) => { scope.x = x; scope.y = y; const r = code.evaluate(scope); return (typeof r === "number" && Number.isFinite(r)) ? r : NaN; };
    } catch (e) { return null; }
  }

  function updatePreview() {
    Engine.renderKatex(pPreview, pInput.value.trim() ? Engine.toLatex(pInput.value.trim()) : "", false);
    Engine.renderKatex(qPreview, qInput.value.trim() ? Engine.toLatex(qInput.value.trim()) : "", false);
    Engine.pulseFlash(pPreview); Engine.pulseFlash(qPreview);
  }

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : NaN; }

  function updateStartCheck() {
    if (!pInput.value.trim() || !qInput.value.trim()) { bad("Enter both P(x, y) and Q(x, y)."); return false; }
    if (!makeFn2(pInput.value.trim()) || !makeFn2(qInput.value.trim())) { bad("Couldn't parse the field components."); return false; }
    if (op === "line-integral") {
      if (!lxInput.value.trim() || !lyInput.value.trim()) { bad("Enter the curve x(t) and y(t)."); return false; }
      if (!makeFn(lxInput.value.trim(), "t") || !makeFn(lyInput.value.trim(), "t")) { bad("Couldn't parse the curve."); return false; }
      if (!Number.isFinite(num(laInput.value)) || !Number.isFinite(num(lbInput.value))) { bad("The bounds a and b must be numbers."); return false; }
      if (num(laInput.value) >= num(lbInput.value)) { bad("The lower bound a must be less than the upper bound b."); return false; }
    } else if (op === "greens") {
      const x0 = num(x0Input.value), x1 = num(x1Input.value), y0 = num(y0Input.value), y1 = num(y1Input.value);
      if (![x0, x1, y0, y1].every(Number.isFinite)) { bad("The rectangle bounds must be numbers."); return false; }
      if (x0 >= x1 || y0 >= y1) { bad("The rectangle needs x0 < x1 and y0 < y1."); return false; }
    }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Ready — press Evaluate.";
    return true;
  }
  function bad(msg) { startStatus.className = "status-line bad"; startStatusText.textContent = msg; }

  function statCell(label, value, accent) {
    const cls = accent ? "result-stat accent" : "result-stat";
    return `<div class="${cls}"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
  }

  function render(r) {
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "none";
    resultsArea.style.display = "";
    result = r;
    steps = [];

    if (r.operation === "divergence-curl") {
      statStrip.innerHTML =
        statCell("Divergence ∇·F", r.div.value + "  ≈ " + Engine.formatNum(r.div.numeric), true) +
        statCell("Curl ∇×F", r.curl.value + "  ≈ " + Engine.formatNum(r.curl.numeric), false) +
        statCell("Conservative?", r.conservative.value, false);
      Engine.renderKatex(formulaResult, r.latex + (r.potential && r.potential.ok ? "\\quad " + r.potential.latex : ""), true);
      steps = r.steps.slice();
      if (r.potential && r.potential.ok) r.potential.steps.forEach((s) => steps.push(s));
    } else if (r.operation === "line-integral") {
      const w = r.quantities.work, f = r.quantities.flux;
      statStrip.innerHTML =
        statCell("Work W = ∫F·dr", w.ok ? w.value + "  ≈ " + Engine.formatNum(w.numeric) : "refused", true) +
        statCell("Flux Φ = ∫F·n ds", f.ok ? f.value + "  ≈ " + Engine.formatNum(f.numeric) : "refused", false);
      Engine.renderKatex(formulaResult, r.latex, true);
      r.qOrder.forEach((k) => {
        const qty = r.quantities[k];
        const head = qty.name + " (" + qty.symbol + ")";
        if (!qty.ok) { steps.push({ rule: head, text: qty.reason, latex: qty.latex || "" }); return; }
        qty.steps.forEach((s) => steps.push({ rule: head + " · " + s.rule, text: s.text, latex: s.latex }));
      });
    } else { // greens
      statStrip.innerHTML =
        statCell("Line side ∮_C", r.lineSide.value + "  ≈ " + Engine.formatNum(r.lineSide.numeric), true) +
        statCell("Area side ∬_R", r.areaSide.value + "  ≈ " + Engine.formatNum(r.areaSide.numeric), false);
      Engine.renderKatex(formulaResult, r.latex, true);
      steps = r.steps.slice();
    }

    stepTableBody.innerHTML = steps
      .map((s, i) => `<tr data-n="${i}"><td>${i + 1}</td><td>${escapeHtml(s.rule)}</td><td><span class="step-tex" data-i="${i}"></span></td></tr>`)
      .join("");
    stepTableBody.querySelectorAll(".step-tex").forEach((el) => {
      Engine.renderKatex(el, steps[Number(el.dataset.i)].latex, false);
    });

    stepSlider.min = 0;
    stepSlider.max = Math.max(0, steps.length - 1);
    stepSlider.value = steps.length - 1;
    updateStep(steps.length - 1);

    drawPlot(r);
  }

  function updateStep(idx) {
    const n = Math.max(0, Math.min(steps.length - 1, idx));
    stepTableBody.querySelectorAll("tr").forEach((tr) => {
      const rowN = Number(tr.dataset.n);
      tr.classList.toggle("is-current", rowN === n);
      tr.style.opacity = rowN <= n ? "" : "0.25";
    });
    stepLabel.textContent = steps.length ? `step ${n + 1} / ${steps.length}` : "—";
  }

  // ---- The field picture ----
  function windowFor(r) {
    if (r.operation === "greens") {
      const x0 = num(x0Input.value), x1 = num(x1Input.value), y0 = num(y0Input.value), y1 = num(y1Input.value);
      const pad = Math.max(0.6, (x1 - x0) * 0.25);
      return [x0 - pad, x1 + pad, y0 - pad, y1 + pad];
    }
    if (r.operation === "line-integral") {
      const xFn = makeFn(lxInput.value.trim(), "t"), yFn = makeFn(lyInput.value.trim(), "t");
      const a = num(laInput.value), b = num(lbInput.value);
      let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
      if (xFn && yFn) for (let i = 0; i <= 60; i++) {
        const t = a + (i / 60) * (b - a);
        const x = xFn(t), y = yFn(t);
        if (Number.isFinite(x) && Number.isFinite(y)) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
      }
      if (!Number.isFinite(xmin)) return [-2.5, 2.5, -2.5, 2.5];
      const pad = Math.max(0.6, (xmax - xmin) * 0.25);
      return [xmin - pad, xmax + pad, ymin - pad, ymax + pad];
    }
    return [-2.5, 2.5, -2.5, 2.5];
  }

  function drawPlot(r) {
    const Pf = makeFn2(pInput.value.trim()), Qf = makeFn2(qInput.value.trim());
    if (!Pf || !Qf) { Plotly.purge("fxPlot"); return; }
    const [xmin, xmax, ymin, ymax] = windowFor(r);
    plotState = { Pf, Qf, xmin, xmax, ymin, ymax, op: r.operation };

    // Quiver grid.
    const NX = 11, NY = 9;
    const shaftX = [], shaftY = [], headX = [], headY = [];
    const targetLen = Math.min((xmax - xmin), (ymax - ymin)) / (Math.max(NX, NY)) * 0.62;
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NY; j++) {
        const x = xmin + (i + 0.5) / NX * (xmax - xmin);
        const y = ymin + (j + 0.5) / NY * (ymax - ymin);
        let dx = Pf(x, y), dy = Qf(x, y);
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
        const mag = Math.hypot(dx, dy);
        if (mag < 1e-9) { shaftX.push(x, x, null); shaftY.push(y, y, null); continue; }
        dx = dx / mag * targetLen; dy = dy / mag * targetLen;
        shaftX.push(x - dx / 2, x + dx / 2, null);
        shaftY.push(y - dy / 2, y + dy / 2, null);
        headX.push(x + dx / 2); headY.push(y + dy / 2);
      }
    }

    const traces = [
      { x: shaftX, y: shaftY, mode: "lines", name: "F",
        line: { color: "rgba(92,147,159,0.65)", width: 1.4 }, connectgaps: false, hoverinfo: "skip" },
      { x: headX, y: headY, mode: "markers", name: "field tips",
        marker: { size: 6, color: "#5c939f", symbol: "triangle" }, hoverinfo: "skip" }
    ];

    if (r.operation === "line-integral") {
      const xFn = makeFn(lxInput.value.trim(), "t"), yFn = makeFn(lyInput.value.trim(), "t");
      const a = num(laInput.value), b = num(lbInput.value);
      if (xFn && yFn) {
        const cx = [], cy = [];
        for (let i = 0; i <= 120; i++) { const t = a + (i / 120) * (b - a); cx.push(xFn(t)); cy.push(yFn(t)); }
        traces.push({ x: cx, y: cy, mode: "lines", name: "curve",
          line: { color: "#ed6d40", width: 3 }, hoverinfo: "skip" });
        traces.push({ x: [xFn(a)], y: [yFn(a)], mode: "markers",
          marker: { size: 9, color: "#ed6d40" }, name: "start", hoverinfo: "skip" });
      }
      plotTitle.textContent = "The field F and the curve";
    } else if (r.operation === "greens") {
      const x0 = num(x0Input.value), x1 = num(x1Input.value), y0 = num(y0Input.value), y1 = num(y1Input.value);
      const rx = [x0, x1, x1, x0, x0], ry = [y0, y0, y1, y1, y0]; // CCW
      traces.push({ x: rx, y: ry, mode: "lines", name: "rectangle (CCW)",
        line: { color: "#ed6d40", width: 3 }, fill: "toself", fillcolor: "rgba(237,109,64,0.10)", hoverinfo: "skip" });
      plotTitle.textContent = "The field F and the rectangle (oriented CCW)";
    } else {
      plotTitle.textContent = "The vector field F = ⟨P, Q⟩";
    }

    Plotly.newPlot("fxPlot", traces, Engine.plotlyBaseLayout({
      xaxis: { title: "x", range: [xmin, xmax], zeroline: true, zerolinecolor: "#2a2f33", scaleanchor: "y", scaleratio: 1 },
      yaxis: { title: "y", range: [ymin, ymax], zeroline: true, zerolinecolor: "#2a2f33" },
      margin: { l: 55, r: 20, t: 20, b: 45 }
    }), Engine.plotlyConfig);
  }

  function buildSpec() {
    if (op === "line-integral") return { P: pInput.value.trim(), Q: qInput.value.trim(), x: lxInput.value.trim(), y: lyInput.value.trim(), a: laInput.value.trim(), b: lbInput.value.trim() };
    if (op === "greens") return { P: pInput.value.trim(), Q: qInput.value.trim(), x0: x0Input.value.trim(), x1: x1Input.value.trim(), y0: y0Input.value.trim(), y1: y1Input.value.trim() };
    return { P: pInput.value.trim(), Q: qInput.value.trim() };
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    if (!updateStartCheck()) return;
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Evaluating…";

    CAS.vectorCalculus(op, buildSpec(), {})
      .then((r) => {
        if (!r.ok) { showRefused(r); Plotly.purge("fxPlot"); return; }
        render(r);
      })
      .catch((err) => showError(err.message))
      .then(() => {
        if (submitBtn) submitBtn.textContent = prev;
        if (CAS.mode() === "sync") {
          startStatus.className = "status-line bad";
          startStatusText.textContent =
            "Running without a Web Worker (opened over file://?) — a hard integrand can freeze the page. Serve over http:// to restore the safety timeout.";
        }
      });
  });

  function setOp(o) {
    op = o;
    opRow.querySelectorAll(".tag").forEach((t) => t.classList.toggle("is-active", t.dataset.op === o));
    lineFields.style.display = o === "line-integral" ? "" : "none";
    greensFields.style.display = o === "greens" ? "" : "none";
  }

  exampleBtn.addEventListener("click", () => {
    setOp("divergence-curl");
    pInput.value = "2*x"; qInput.value = "6*y";
    updatePreview(); updateStartCheck(); form.requestSubmit();
  });

  opRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag"); if (!btn) return;
    setOp(btn.dataset.op); updateStartCheck();
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag"); if (!btn) return;
    setOp(btn.dataset.op);
    pInput.value = btn.dataset.p; qInput.value = btn.dataset.q;
    if (btn.dataset.op === "line-integral") { lxInput.value = btn.dataset.lx; lyInput.value = btn.dataset.ly; laInput.value = btn.dataset.la; lbInput.value = btn.dataset.lb; }
    if (btn.dataset.op === "greens") { x0Input.value = btn.dataset.x0; x1Input.value = btn.dataset.x1; y0Input.value = btn.dataset.y0; y1Input.value = btn.dataset.y1; }
    updatePreview(); updateStartCheck(); form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  pInput.addEventListener("input", debounced);
  qInput.addEventListener("input", debounced);
  lxInput.addEventListener("input", debounced);
  lyInput.addEventListener("input", debounced);
  laInput.addEventListener("input", debounced);
  lbInput.addEventListener("input", debounced);
  x0Input.addEventListener("input", debounced);
  x1Input.addEventListener("input", debounced);
  y0Input.addEventListener("input", debounced);
  y1Input.addEventListener("input", debounced);

  Engine.attachMathKeypad(qInput, document.getElementById("vcKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("vcKeypad"));

  setOp("divergence-curl");
  updatePreview();
  updateStartCheck();
})();