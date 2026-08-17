(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const x0Input = document.getElementById("x0Input");
  const x1Input = document.getElementById("x1Input");
  const x2Input = document.getElementById("x2Input");
  const tolInput = document.getElementById("tolInput");
  const maxIterInput = document.getElementById("maxIterInput");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("mullerForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statRoot = document.getElementById("statRoot");
  const statIters = document.getElementById("statIters");
  const statFRoot = document.getElementById("statFRoot");
  const statError = document.getElementById("statError");
  const formulaBlock = document.getElementById("formulaBlock");
  const iterTableBody = document.querySelector("#iterTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  let state = null; // { iterations, bounds }
  const TRACE = { curve: 0, zero: 1, points: 2, parab: 3, current: 4, next: 5 };
  const STORE_KEY = "engine-lab:numerical-mullers-method";

  function snapshot() {
    return {
      fx: fxInput.value,
      x0: x0Input.value,
      x1: x1Input.value,
      x2: x2Input.value,
      tol: tolInput.value,
      maxIter: maxIterInput.value,
    };
  }

  function updatePreview() {
    Engine.renderKatex(fxPreview, `f(x) = ${Engine.toLatex(fxInput.value)}`, false);
    Engine.pulseFlash(fxPreview);
  }

  function parabolaY(it, x) {
    const t = x - it.x2;
    return it.a * t * t + it.b * t + it.c;
  }

  function parabolaLocalBounds(it) {
    const lo = Math.min(it.x0, it.x1, it.x2);
    const hi = Math.max(it.x0, it.x1, it.x2);
    const pad = Math.max(0.25, (hi - lo) * 0.5);
    return { pxmin: lo - pad, pxmax: hi + pad };
  }

  function updateStartCheck() {
    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = compiled.error;
      return null;
    }
    const x0 = parseFloat(x0Input.value);
    const x1 = parseFloat(x1Input.value);
    const x2 = parseFloat(x2Input.value);
    if (Number.isNaN(x0) || Number.isNaN(x1) || Number.isNaN(x2)) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter three numeric starting points x₀, x₁, x₂.";
      return null;
    }
    if (x0 === x1 || x1 === x2 || x0 === x2) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "x₀, x₁, x₂ must be three distinct points.";
      return null;
    }
    try {
      const f0 = compiled.fn(x0);
      const f1 = compiled.fn(x1);
      const f2 = compiled.fn(x2);
      if (!Number.isFinite(f0) || !Number.isFinite(f1) || !Number.isFinite(f2)) {
        startStatus.className = "status-line bad";
        startStatusText.textContent = "f(x) produced a non-finite value at a starting point.";
        return null;
      }
      startStatus.className = "status-line ok";
      startStatusText.textContent = `f(x₀) = ${Engine.formatNum(f0, 4)}, f(x₁) = ${Engine.formatNum(f1, 4)}, f(x₂) = ${Engine.formatNum(f2, 4)}`;
      return { compiled };
    } catch {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Could not evaluate f(x) at x₀, x₁, or x₂.";
      return null;
    }
  }

  const debouncedUpdate = Engine.debounce(() => {
    updatePreview();
    updateStartCheck();
  }, 200);

  [fxInput, x0Input, x1Input, x2Input].forEach((el) => el.addEventListener("input", debouncedUpdate));

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "x^3 - x - 2";
    x0Input.value = "1";
    x1Input.value = "1.5";
    x2Input.value = "2";
    tolInput.value = "0.000001";
    maxIterInput.value = "30";
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

  function render(iterations, compiled, x0, x1, x2) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const last = iterations[iterations.length - 1];
    statRoot.textContent = Engine.formatNum(last.x3, 8);
    statIters.textContent = String(iterations.length);
    try { statFRoot.textContent = Engine.formatNum(compiled.fn(last.x3), 6); }
    catch { statFRoot.textContent = "—"; }
    statError.textContent = Engine.formatNum(last.err, 8);

    Engine.renderKatex(
      formulaBlock,
      "x_3 = x_2 - \\dfrac{2c}{b + \\operatorname{sgn}(b)\\sqrt{b^2 - 4ac}},\\quad a = \\dfrac{\\delta_1 - \\delta_0}{x_2 - x_0},\\ \\ b = a(x_2 - x_1) + \\delta_1,\\ \\ c = f(x_2)",
      true
    );

    iterTableBody.innerHTML = iterations
      .map(
        (it) => `<tr data-n="${it.n}">
          <td>${it.n}</td>
          <td>${Engine.formatNum(it.x0, 6)}</td>
          <td>${Engine.formatNum(it.x1, 6)}</td>
          <td>${Engine.formatNum(it.x2, 6)}</td>
          <td>${Engine.formatNum(it.x3, 6)}</td>
          <td>${Engine.formatNum(it.err, 8)}</td>
        </tr>`
      )
      .join("");

    // --- f(x) + parabola-fit-per-step plot ---
    const allX = [x0, x1, x2, ...iterations.map((it) => it.x3)].filter(Number.isFinite);
    const lo = Math.min(...allX), hi = Math.max(...allX);
    const pad = Math.max(0.5, (hi - lo) * 0.6);
    const xmin = lo - pad, xmax = hi + pad;
    const xs = [], ys = [];
    for (let i = 0; i <= 240; i++) {
      const x = xmin + ((xmax - xmin) * i) / 240;
      let y;
      try { y = compiled.fn(x); } catch { y = null; }
      xs.push(x); ys.push(Number.isFinite(y) ? y : null);
    }

    const curveTrace = { x: xs, y: ys, mode: "lines", type: "scatter", name: "f(x)", line: { color: "#5c939f", width: 2 } };
    const zeroTrace = { x: [xmin, xmax], y: [0, 0], mode: "lines", type: "scatter", name: "y = 0", line: { color: "#7d858c", width: 1, dash: "dash" }, hoverinfo: "skip" };
    const pointsTrace = {
      x: iterations.map((it) => it.x2),
      y: iterations.map((it) => it.f2),
      mode: "markers",
      type: "scatter",
      name: "x₂",
      marker: { size: 7, color: iterations.map((it) => it.n), colorscale: [[0, "#5c939f"], [1, "#ed6d40"]], line: { color: "#090909", width: 1 } },
    };

    const first = iterations[0];
    const { pxmin, pxmax } = parabolaLocalBounds(first);
    const pxs = [], pys = [];
    for (let i = 0; i <= 80; i++) {
      const x = pxmin + ((pxmax - pxmin) * i) / 80;
      pxs.push(x); pys.push(parabolaY(first, x));
    }
    const parabTrace = {
      x: pxs, y: pys, mode: "lines", type: "scatter", name: "quadratic fit",
      line: { color: "#ed6d40", width: 2, dash: "dot" },
    };
    const currentTrace = {
      x: [first.x0, first.x1, first.x2], y: [first.f0, first.f1, first.f2], mode: "markers", type: "scatter", name: "fit points",
      marker: { size: 13, color: "#ed6d40", symbol: "circle-open", line: { width: 2, color: "#ed6d40" } },
    };
    const nextTrace = {
      x: [first.x3], y: [0], mode: "markers", type: "scatter", name: "next",
      marker: { size: 9, color: "#e7e7e7", symbol: "diamond", line: { width: 1.5, color: "#ed6d40" } },
    };

    Plotly.newPlot(
      "fxPlot",
      [curveTrace, zeroTrace, pointsTrace, parabTrace, currentTrace, nextTrace],
      Engine.plotlyBaseLayout({ xaxis: { title: "x" }, yaxis: { title: "f(x)" } }),
      Engine.plotlyConfig
    );

    // --- error decay plot ---
    Plotly.newPlot(
      "errorPlot",
      [{
        x: iterations.map((it) => it.n),
        y: iterations.map((it) => Math.max(it.err, 1e-16)),
        mode: "lines+markers",
        type: "scatter",
        line: { color: "#ed6d40", width: 2 },
        marker: { size: 5, color: "#ed6d40" },
      }],
      Engine.plotlyBaseLayout({ xaxis: { title: "iteration n" }, yaxis: { title: "|error|", type: "log" } }),
      Engine.plotlyConfig
    );

    // --- step slider ---
    stepSlider.min = 0;
    stepSlider.max = iterations.length - 1;
    stepSlider.value = 0;
    state = { iterations, bounds: { xmin, xmax } };
    updateStep(0);
  }

  function updateStep(idx) {
    if (!state) return;
    const it = state.iterations[idx];
    const { xmin, xmax } = state.bounds;
    stepLabel.textContent = `step ${it.n} / ${state.iterations.length}`;
    document.querySelectorAll("#iterTable tbody tr").forEach((row) => {
      row.classList.toggle("is-current", Number(row.dataset.n) === it.n);
    });
    const rowEl = document.querySelector(`#iterTable tbody tr[data-n="${it.n}"]`);
    if (rowEl) rowEl.scrollIntoView({ block: "nearest" });

    const { pxmin, pxmax } = parabolaLocalBounds(it);
    const pxs = [], pys = [];
    for (let i = 0; i <= 80; i++) {
      const x = pxmin + ((pxmax - pxmin) * i) / 80;
      pxs.push(x); pys.push(parabolaY(it, x));
    }

    Plotly.restyle(
      "fxPlot",
      {
        x: [pxs, [it.x0, it.x1, it.x2], [it.x3]],
        y: [pys, [it.f0, it.f1, it.f2], [0]],
      },
      [TRACE.parab, TRACE.current, TRACE.next]
    );
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  function runCompute() {
    clearError();

    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) return showError(`Invalid function: ${compiled.error}`);

    const x0 = parseFloat(x0Input.value);
    const x1 = parseFloat(x1Input.value);
    const x2 = parseFloat(x2Input.value);
    const tol = parseFloat(tolInput.value);
    const maxIter = parseInt(maxIterInput.value, 10);

    if (Number.isNaN(x0) || Number.isNaN(x1) || Number.isNaN(x2)) return showError("x₀, x₁, x₂ must be numbers.");
    if (x0 === x1 || x1 === x2 || x0 === x2) return showError("x₀, x₁, x₂ must be three distinct points.");
    if (Number.isNaN(tol) || tol <= 0) return showError("Tolerance must be a positive number.");
    if (!Number.isInteger(maxIter) || maxIter < 1) return showError("Max iterations must be a positive integer.");

    let iterations;
    try {
      iterations = Algorithms.runMuller(compiled.fn, x0, x1, x2, tol, maxIter);
    } catch (err) {
      return showError(err.message);
    }

    render(iterations, compiled, x0, x1, x2);
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
    if (saved.x0 !== undefined) x0Input.value = saved.x0;
    if (saved.x1 !== undefined) x1Input.value = saved.x1;
    if (saved.x2 !== undefined) x2Input.value = saved.x2;
    if (saved.tol !== undefined) tolInput.value = saved.tol;
    if (saved.maxIter !== undefined) maxIterInput.value = saved.maxIter;
  }

  updatePreview();
  updateStartCheck();
  if (saved) runCompute();
})();