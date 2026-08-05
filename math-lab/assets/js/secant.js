(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const x0Input = document.getElementById("x0Input");
  const x1Input = document.getElementById("x1Input");
  const tolInput = document.getElementById("tolInput");
  const maxIterInput = document.getElementById("maxIterInput");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("secantForm");
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
  const TRACE = { curve: 0, zero: 1, points: 2, secant: 3, current: 4, next: 5 };

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
    const x0 = parseFloat(x0Input.value);
    const x1 = parseFloat(x1Input.value);
    if (Number.isNaN(x0) || Number.isNaN(x1)) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter two numeric starting points x₀ and x₁.";
      return null;
    }
    if (x0 === x1) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "x₀ and x₁ must be different points.";
      return null;
    }
    try {
      const f0 = compiled.fn(x0);
      const f1 = compiled.fn(x1);
      startStatus.className = "status-line ok";
      startStatusText.textContent = `f(x₀) = ${Engine.formatNum(f0, 4)}, f(x₁) = ${Engine.formatNum(f1, 4)}`;
      return { compiled };
    } catch {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Could not evaluate f(x) at x₀ or x₁.";
      return null;
    }
  }

  const debouncedUpdate = Engine.debounce(() => {
    updatePreview();
    updateStartCheck();
  }, 200);

  [fxInput, x0Input, x1Input].forEach((el) => el.addEventListener("input", debouncedUpdate));

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "x^3 - x - 2";
    x0Input.value = "1";
    x1Input.value = "2";
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

  function render(iterations, compiled, x0, x1) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const last = iterations[iterations.length - 1];
    statRoot.textContent = Engine.formatNum(last.xNext, 8);
    statIters.textContent = String(iterations.length);
    try { statFRoot.textContent = Engine.formatNum(compiled.fn(last.xNext), 6); }
    catch { statFRoot.textContent = "—"; }
    statError.textContent = Engine.formatNum(last.err, 8);

    Engine.renderKatex(
      formulaBlock,
      "x_{n+1} = x_n - \\dfrac{f(x_n)\\,(x_n - x_{n-1})}{f(x_n) - f(x_{n-1})}",
      true
    );

    iterTableBody.innerHTML = iterations
      .map(
        (it) => `<tr data-n="${it.n}">
          <td>${it.n}</td>
          <td>${Engine.formatNum(it.xPrev, 6)}</td>
          <td>${Engine.formatNum(it.xCurr, 6)}</td>
          <td>${Engine.formatNum(it.fPrev, 6)}</td>
          <td>${Engine.formatNum(it.fCurr, 6)}</td>
          <td>${Engine.formatNum(it.xNext, 6)}</td>
          <td>${Engine.formatNum(it.err, 8)}</td>
        </tr>`
      )
      .join("");

    // --- f(x) + secant-line-per-step plot ---
    const allX = [x0, x1, ...iterations.map((it) => it.xNext)].filter(Number.isFinite);
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
      x: iterations.map((it) => it.xCurr),
      y: iterations.map((it) => it.fCurr),
      mode: "markers",
      type: "scatter",
      name: "xₙ",
      marker: { size: 7, color: iterations.map((it) => it.n), colorscale: [[0, "#5c939f"], [1, "#ed6d40"]], line: { color: "#090909", width: 1 } },
    };
    const first = iterations[0];
    const secantSlope = (first.fCurr - first.fPrev) / (first.xCurr - first.xPrev);
    const secantTrace = {
      x: [xmin, xmax],
      y: [first.fCurr + secantSlope * (xmin - first.xCurr), first.fCurr + secantSlope * (xmax - first.xCurr)],
      mode: "lines", type: "scatter", name: "secant",
      line: { color: "#ed6d40", width: 2, dash: "dot" },
    };
    const currentTrace = {
      x: [first.xPrev, first.xCurr], y: [first.fPrev, first.fCurr], mode: "markers", type: "scatter", name: "current pair",
      marker: { size: 13, color: "#ed6d40", symbol: "circle-open", line: { width: 2, color: "#ed6d40" } },
    };
    const nextTrace = {
      x: [first.xNext], y: [0], mode: "markers", type: "scatter", name: "next",
      marker: { size: 9, color: "#e7e7e7", symbol: "diamond", line: { width: 1.5, color: "#ed6d40" } },
    };

    Plotly.newPlot(
      "fxPlot",
      [curveTrace, zeroTrace, pointsTrace, secantTrace, currentTrace, nextTrace],
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

    const slope = (it.fCurr - it.fPrev) / (it.xCurr - it.xPrev);
    Plotly.restyle(
      "fxPlot",
      {
        x: [[xmin, xmax], [it.xPrev, it.xCurr], [it.xNext]],
        y: [
          [it.fCurr + slope * (xmin - it.xCurr), it.fCurr + slope * (xmax - it.xCurr)],
          [it.fPrev, it.fCurr],
          [0],
        ],
      },
      [TRACE.secant, TRACE.current, TRACE.next]
    );
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();

    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) return showError(`Invalid function: ${compiled.error}`);

    const x0 = parseFloat(x0Input.value);
    const x1 = parseFloat(x1Input.value);
    const tol = parseFloat(tolInput.value);
    const maxIter = parseInt(maxIterInput.value, 10);

    if (Number.isNaN(x0) || Number.isNaN(x1)) return showError("x₀ and x₁ must be numbers.");
    if (x0 === x1) return showError("x₀ and x₁ must be different points.");
    if (Number.isNaN(tol) || tol <= 0) return showError("Tolerance must be a positive number.");
    if (!Number.isInteger(maxIter) || maxIter < 1) return showError("Max iterations must be a positive integer.");

    let iterations;
    try {
      iterations = Algorithms.runSecant(compiled.fn, x0, x1, tol, maxIter);
    } catch (err) {
      return showError(err.message);
    }

    render(iterations, compiled, x0, x1);
  });

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));

  updatePreview();
  updateStartCheck();
})();
