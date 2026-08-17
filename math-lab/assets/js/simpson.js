(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const nInput = document.getElementById("nInput");
  const modeRow = document.getElementById("modeRow");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("simpsonForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statTotal = document.getElementById("statTotal");
  const statGroups = document.getElementById("statGroups");
  const statH = document.getElementById("statH");
  const statErr = document.getElementById("statErr");
  const formulaBlock = document.getElementById("formulaBlock");
  const formulaNote = document.getElementById("formulaNote");
  const groupTableBody = document.querySelector("#groupTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  let mode = "auto"; // "auto" | "13" | "38"
  let state = null; // { panels, bounds, traceMap }
  const STORE_KEY = "engine-lab:numerical-simpsons-rule";

  function snapshot() {
    return { fx: fxInput.value, a: aInput.value, b: bInput.value, n: nInput.value };
  }

  function setMode(next) {
    mode = next;
    modeRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c.dataset.mode === mode));
  }
  modeRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    setMode(btn.dataset.mode);
    debouncedUpdate();
    if (resultsArea.style.display !== "none") form.requestSubmit();
  });

  function updatePreview() {
    Engine.renderKatex(fxPreview, `f(x) = ${Engine.toLatex(fxInput.value)}`, false);
    Engine.pulseFlash(fxPreview);
  }

  function modeDivisibilityError(n) {
    if (mode === "13" && n % 2 !== 0) return "1/3 rule needs an even n — try n = 6.";
    if (mode === "38" && n % 3 !== 0) return "3/8 rule needs n to be a multiple of 3 — try n = 6.";
    if (mode === "auto" && n % 2 !== 0 && n < 3) return "auto mode needs n ≥ 3 when n is odd.";
    return null;
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
    if (!Number.isInteger(n) || n < 2 || n > 2000) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "n must be an integer between 2 and 2000.";
      return null;
    }
    const divErr = modeDivisibilityError(n);
    if (divErr) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = divErr;
      return null;
    }
    try {
      const fa = compiled.fn(a);
      const fb = compiled.fn(b);
      startStatus.className = "status-line ok";
      startStatusText.textContent = `f(a) = ${Engine.formatNum(fa, 4)}, f(b) = ${Engine.formatNum(fb, 4)} · mode: ${mode === "13" ? "1/3" : mode === "38" ? "3/8" : "auto"}`;
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
    fxInput.value = "sin(x)";
    aInput.value = "0";
    bInput.value = "3.14159265358979";
    nInput.value = "6";
    setMode("auto");
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

  // Lagrange evaluation of the interpolating polynomial through (xs, ys) at x —
  // presentation-only (used to draw each group's fitted parabola/cubic), not core math.
  function lagrangeEval(xs, ys, x) {
    let sum = 0;
    for (let i = 0; i < xs.length; i++) {
      let term = ys[i];
      for (let j = 0; j < xs.length; j++) {
        if (j === i) continue;
        term *= (x - xs[j]) / (xs[i] - xs[j]);
      }
      sum += term;
    }
    return sum;
  }

  // Sample the fitted polynomial for a group across [x0, x1] and close the polygon at y=0.
  function groupPolygon(p, samples) {
    const x0 = p.x0, x1 = p.x1;
    const xs = [], ys = [];
    for (let s = 0; s <= samples; s++) {
      const x = x0 + ((x1 - x0) * s) / samples;
      xs.push(x);
      ys.push(lagrangeEval(p.nodesX, p.nodesF, x));
    }
    // Close down to the baseline (y=0): forward along the curve, back along y=0.
    const polyX = xs.concat([xs[xs.length - 1], xs[0]]);
    const polyY = ys.concat([0, 0]);
    return { x: polyX, y: polyY };
  }

  function renderFormula() {
    if (mode === "13") {
      Engine.renderKatex(formulaBlock, "\\int_{x_0}^{x_2} f(x)\\,dx \\approx \\frac{h}{3}\\left[f(x_0) + 4f(x_1) + f(x_2)\\right]", true);
      formulaNote.style.display = "none";
    } else if (mode === "38") {
      Engine.renderKatex(formulaBlock, "\\int_{x_0}^{x_3} f(x)\\,dx \\approx \\frac{3h}{8}\\left[f(x_0) + 3f(x_1) + 3f(x_2) + f(x_3)\\right]", true);
      formulaNote.style.display = "none";
    } else {
      Engine.renderKatex(formulaBlock, "\\int_{x_0}^{x_2} f(x)\\,dx \\approx \\frac{h}{3}\\left[f(x_0) + 4f(x_1) + f(x_2)\\right]", true);
      formulaNote.style.display = "block";
      formulaNote.textContent = "Auto mode: last group uses the 3/8 rule when n is odd.";
    }
  }

  function render(result, compiled, a, b, n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const panels = result.panels;
    const total = result.total;

    // Step-doubling error estimate — doubling preserves divisibility automatically.
    let estErr = null;
    try {
      const fine = Algorithms.runSimpson(compiled.fn, a, b, 2 * n, mode);
      estErr = Math.abs(fine.total - total);
    } catch { estErr = null; }

    statTotal.textContent = Engine.formatNum(total, 8);
    statGroups.textContent = String(panels.length);
    statH.textContent = Engine.formatNum(result.h, 6);
    statErr.textContent = estErr == null ? "—" : Engine.formatNum(estErr, 8);

    renderFormula();

    groupTableBody.innerHTML = panels
      .map((p) => `<tr data-n="${p.g}">
          <td>${p.g}</td>
          <td>${p.type}</td>
          <td>${Engine.formatNum(p.x0, 5)} → ${Engine.formatNum(p.x1, 5)}</td>
          <td>${p.nodesX.map((x) => Engine.formatNum(x, 4)).join(", ")}</td>
          <td>${p.nodesF.map((y) => Engine.formatNum(y, 4)).join(", ")}</td>
          <td>${Engine.formatNum(p.panelArea, 8)}</td>
          <td>${Engine.formatNum(p.running, 8)}</td>
        </tr>`)
      .join("");

    // --- f(x) curve + group polygons ---
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
    panels.forEach((p) => {
      const poly = groupPolygon(p, 20);
      traces.push({
        x: poly.x, y: poly.y,
        mode: "lines", type: "scatter",
        fill: "toself",
        fillcolor: "rgba(92,147,159,0.18)",
        line: { color: "rgba(92,147,159,0.5)", width: 1 },
        hoverinfo: "skip", showlegend: false,
      });
    });
    const curveTrace = { x: xs, y: ys, mode: "lines", type: "scatter", name: "f(x)", line: { color: "#5c939f", width: 2 } };
    const zeroTrace = { x: [xmin, xmax], y: [0, 0], mode: "lines", type: "scatter", name: "y = 0", line: { color: "#7d858c", width: 1, dash: "dash" }, hoverinfo: "skip" };
    const first = groupPolygon(panels[0], 20);
    const currentTrace = {
      x: first.x, y: first.y,
      mode: "lines", type: "scatter",
      fill: "toself",
      fillcolor: "rgba(237,109,64,0.35)",
      line: { color: "#ed6d40", width: 1.5 },
      hoverinfo: "skip", showlegend: false,
    };

    const traceMap = { current: panels.length + 2 };
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
        x: panels.map((p) => p.g),
        y: panels.map((p) => p.running),
        mode: "lines+markers",
        type: "scatter",
        line: { color: "#ed6d40", width: 2 },
        marker: { size: 5, color: "#ed6d40" },
      }],
      Engine.plotlyBaseLayout({ xaxis: { title: "group g" }, yaxis: { title: "running total" } }),
      Engine.plotlyConfig
    );

    // --- step slider ---
    stepSlider.min = 0;
    stepSlider.max = panels.length - 1;
    stepSlider.value = 0;
    state = { panels, traceMap };
    updateStep(0);
  }

  function updateStep(idx) {
    if (!state) return;
    const p = state.panels[idx];
    stepLabel.textContent = `group ${p.g} / ${state.panels.length}`;
    document.querySelectorAll("#groupTable tbody tr").forEach((row) => {
      row.classList.toggle("is-current", Number(row.dataset.n) === p.g);
    });
    const rowEl = document.querySelector(`#groupTable tbody tr[data-n="${p.g}"]`);
    if (rowEl) rowEl.scrollIntoView({ block: "nearest" });

    const poly = groupPolygon(p, 20);
    Plotly.restyle("fxPlot", { x: [poly.x], y: [poly.y] }, [state.traceMap.current]);
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
    if (!Number.isInteger(n) || n < 2 || n > 2000) return showError("n must be an integer between 2 and 2000.");
    const divErr = modeDivisibilityError(n);
    if (divErr) return showError(divErr);

    let result;
    try {
      result = Algorithms.runSimpson(compiled.fn, a, b, n, mode);
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

  setMode("auto");

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