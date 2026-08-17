(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const nInput = document.getElementById("nInput");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("trapForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statTotal = document.getElementById("statTotal");
  const statN = document.getElementById("statN");
  const statH = document.getElementById("statH");
  const statErr = document.getElementById("statErr");
  const formulaBlock = document.getElementById("formulaBlock");
  const panelTableBody = document.querySelector("#panelTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  let state = null; // { panels, n, bounds, curveX, curveY, baseTraceCount }
  // fxPlot trace layout: [0..n-1] = one filled trapezoid per panel, then curve, zero, current.
  let traceMap = null; // { panelBase, curve, zero, current }
  const STORE_KEY = "engine-lab:numerical-trapezoidal-rule";

  function snapshot() {
    return { fx: fxInput.value, a: aInput.value, b: bInput.value, n: nInput.value };
  }

  function updatePreview() {
    Engine.renderKatex(fxPreview, `f(x) = ${Engine.toLatex(fxInput.value)}`, false);
    Engine.pulseFlash(fxPreview);
  }

  function updateStartCheck() {
    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = compiled.error;
      return null;
    }
    const a = parseFloat(aInput.value);
    const b = parseFloat(bInput.value);
    const n = parseInt(nInput.value, 10);
    if (Number.isNaN(a) || Number.isNaN(b)) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter numeric bounds a and b.";
      return null;
    }
    if (a === b) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "a and b must be different (interval has zero width).";
      return null;
    }
    if (!Number.isInteger(n) || n < 1 || n > 2000) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "n must be an integer between 1 and 2000.";
      return null;
    }
    try {
      const fa = compiled.fn(a);
      const fb = compiled.fn(b);
      startStatus.className = "status-line ok";
      const orient = a < b
        ? `f(a) = ${Engine.formatNum(fa, 4)}, f(b) = ${Engine.formatNum(fb, 4)}`
        : `a > b — computing ∫[a,b] with the implied sign. f(a) = ${Engine.formatNum(fa, 4)}, f(b) = ${Engine.formatNum(fb, 4)}`;
      startStatusText.textContent = orient;
      return { compiled };
    } catch {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Could not evaluate f(x) at a or b.";
      return null;
    }
  }

  const debouncedUpdate = Engine.debounce(() => {
    updatePreview();
    updateStartCheck();
  }, 200);

  [fxInput, aInput, bInput, nInput].forEach((el) => el.addEventListener("input", debouncedUpdate));

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "e^x";
    aInput.value = "0";
    bInput.value = "1";
    nInput.value = "10";
    updatePreview();
    updateStartCheck();
  });

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() {
    formError.style.display = "none";
  }

  function render(result, compiled, a, b, n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const panels = result.panels;
    const total = result.total;

    // Step-doubling error estimate: total(2n) vs total(n) — practical, not analytic.
    let estErr = null;
    try {
      const fine = Algorithms.runTrapezoidal(compiled.fn, a, b, 2 * n);
      estErr = Math.abs(fine.total - total);
    } catch { estErr = null; }

    statTotal.textContent = Engine.formatNum(total, 8);
    statN.textContent = String(n);
    statH.textContent = Engine.formatNum(result.h, 6);
    statErr.textContent = estErr == null ? "—" : Engine.formatNum(estErr, 8);

    Engine.renderKatex(
      formulaBlock,
      "\\int_a^b f(x)\\,dx \\approx \\frac{h}{2}\\left[f(x_0) + 2\\sum_{i=1}^{n-1} f(x_i) + f(x_n)\\right]",
      true
    );

    panelTableBody.innerHTML = panels
      .map(
        (p) => `<tr data-n="${p.i}">
          <td>${p.i}</td>
          <td>${Engine.formatNum(p.x0, 6)}</td>
          <td>${Engine.formatNum(p.x1, 6)}</td>
          <td>${Engine.formatNum(p.f0, 6)}</td>
          <td>${Engine.formatNum(p.f1, 6)}</td>
          <td>${Engine.formatNum(p.panelArea, 8)}</td>
          <td>${Engine.formatNum(p.running, 8)}</td>
        </tr>`
      )
      .join("");

    // --- f(x) curve + trapezoid panels ---
    const allX = panels.map((p) => [p.x0, p.x1]).flat();
    const lo = Math.min(...allX), hi = Math.max(...allX);
    const pad = Math.max(1e-6, (hi - lo) * 0.15);
    const xmin = lo - pad, xmax = hi + pad;
    const xs = [], ys = [];
    for (let i = 0; i <= 240; i++) {
      const x = xmin + ((xmax - xmin) * i) / 240;
      let y;
      try { y = compiled.fn(x); } catch { y = null; }
      xs.push(x); ys.push(Number.isFinite(y) ? y : null);
    }

    const traces = [];
    // One filled trapezoid trace per panel (drawn first, so the curve sits on top).
    panels.forEach((p) => {
      traces.push({
        x: [p.x0, p.x0, p.x1, p.x1, p.x0],
        y: [0, p.f0, p.f1, 0, 0],
        mode: "lines", type: "scatter",
        fill: "toself",
        fillcolor: "rgba(92,147,159,0.18)",
        line: { color: "rgba(92,147,159,0.5)", width: 1 },
        hoverinfo: "skip", showlegend: false,
      });
    });
    const curveTrace = { x: xs, y: ys, mode: "lines", type: "scatter", name: "f(x)", line: { color: "#5c939f", width: 2 } };
    const zeroTrace = { x: [xmin, xmax], y: [0, 0], mode: "lines", type: "scatter", name: "y = 0", line: { color: "#7d858c", width: 1, dash: "dash" }, hoverinfo: "skip" };
    // Highlight overlay for the current panel (orange), reused via restyle.
    const first = panels[0];
    const currentTrace = {
      x: [first.x0, first.x0, first.x1, first.x1, first.x0],
      y: [0, first.f0, first.f1, 0, 0],
      mode: "lines", type: "scatter",
      fill: "toself",
      fillcolor: "rgba(237,109,64,0.35)",
      line: { color: "#ed6d40", width: 1.5 },
      hoverinfo: "skip", showlegend: false,
    };

    traceMap = { panelBase: 0, curve: panels.length, zero: panels.length + 1, current: panels.length + 2 };
    Plotly.newPlot(
      "fxPlot",
      [...traces, curveTrace, zeroTrace, currentTrace],
      Engine.plotlyBaseLayout({ xaxis: { title: "x" }, yaxis: { title: "f(x)" } }),
      Engine.plotlyConfig
    );

    // --- running-total plot ---
    Plotly.newPlot(
      "errorPlot",
      [{
        x: panels.map((p) => p.i),
        y: panels.map((p) => p.running),
        mode: "lines+markers",
        type: "scatter",
        line: { color: "#ed6d40", width: 2 },
        marker: { size: 5, color: "#ed6d40" },
      }],
      Engine.plotlyBaseLayout({ xaxis: { title: "panel i" }, yaxis: { title: "running total" } }),
      Engine.plotlyConfig
    );

    // --- step slider ---
    stepSlider.min = 0;
    stepSlider.max = panels.length - 1;
    stepSlider.value = 0;
    state = { panels };
    updateStep(0);
  }

  function updateStep(idx) {
    if (!state || !traceMap) return;
    const p = state.panels[idx];
    stepLabel.textContent = `panel ${p.i} / ${state.panels.length}`;
    document.querySelectorAll("#panelTable tbody tr").forEach((row) => {
      row.classList.toggle("is-current", Number(row.dataset.n) === p.i);
    });
    const rowEl = document.querySelector(`#panelTable tbody tr[data-n="${p.i}"]`);
    if (rowEl) rowEl.scrollIntoView({ block: "nearest" });

    Plotly.restyle(
      "fxPlot",
      { x: [[p.x0, p.x0, p.x1, p.x1, p.x0]], y: [[0, p.f0, p.f1, 0, 0]] },
      [traceMap.current]
    );
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  function runCompute() {
    clearError();

    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) return showError(`Invalid function: ${compiled.error}`);

    const a = parseFloat(aInput.value);
    const b = parseFloat(bInput.value);
    const n = parseInt(nInput.value, 10);

    if (Number.isNaN(a) || Number.isNaN(b)) return showError("a and b must be numbers.");
    if (a === b) return showError("a and b must be different.");
    if (!Number.isInteger(n) || n < 1 || n > 2000) return showError("n must be an integer between 1 and 2000.");

    let result;
    try {
      result = Algorithms.runTrapezoidal(compiled.fn, a, b, n);
    } catch (err) {
      return showError(err.message);
    }

    render(result, compiled, a, b, n);
    Proto.saveState(STORE_KEY, snapshot());
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runCompute();
  });

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));

  const saved = Proto.loadState(STORE_KEY);
  if (saved) {
    if (saved.fx !== undefined) fxInput.value = saved.fx;
    if (saved.a !== undefined) aInput.value = saved.a;
    if (saved.b !== undefined) bInput.value = saved.b;
    if (saved.n !== undefined) nInput.value = saved.n;
  }

  updatePreview();
  updateStartCheck();
  if (saved) runCompute();
})();