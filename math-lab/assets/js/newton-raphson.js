(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const x0Input = document.getElementById("x0Input");
  const tolInput = document.getElementById("tolInput");
  const maxIterInput = document.getElementById("maxIterInput");
  const derivStatus = document.getElementById("derivStatus");
  const derivStatusText = document.getElementById("derivStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("newtonForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statRoot = document.getElementById("statRoot");
  const statIters = document.getElementById("statIters");
  const statFRoot = document.getElementById("statFRoot");
  const statError = document.getElementById("statError");
  const formulaBlock = document.getElementById("formulaBlock");
  const derivFormulaBlock = document.getElementById("derivFormulaBlock");
  const iterTableBody = document.querySelector("#iterTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  let state = null; // { iterations, bounds }
  const TRACE = { curve: 0, zero: 1, points: 2, tangent: 3, current: 4, next: 5 };
  const STORE_KEY = "engine-lab:numerical-newton-raphson";

  function snapshot() {
    return {
      fx: fxInput.value,
      x0: x0Input.value,
      tol: tolInput.value,
      maxIter: maxIterInput.value,
    };
  }

  function updatePreview() {
    Engine.renderKatex(fxPreview, `f(x) = ${Engine.toLatex(fxInput.value)}`, false);
    Engine.pulseFlash(fxPreview);
  }

  function updateDerivCheck() {
    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) {
      derivStatus.className = "status-line bad";
      derivStatusText.textContent = compiled.error;
      return null;
    }
    const x0 = parseFloat(x0Input.value);
    if (Number.isNaN(x0)) {
      derivStatus.className = "status-line bad";
      derivStatusText.textContent = "Enter a numeric starting guess x₀.";
      return null;
    }
    const deriv = Engine.derivativeFx(compiled.node);
    if (!deriv.ok) {
      derivStatus.className = "status-line bad";
      derivStatusText.textContent = "Could not differentiate f(x) symbolically.";
      return null;
    }
    try {
      const fp0 = deriv.fn(x0);
      if (Math.abs(fp0) > 1e-12) {
        derivStatus.className = "status-line ok";
        derivStatusText.textContent = `f′(x₀) = ${Engine.formatNum(fp0, 4)} — tangent is well-defined`;
      } else {
        derivStatus.className = "status-line bad";
        derivStatusText.textContent = "f′(x₀) ≈ 0 — horizontal tangent, Newton's method fails here";
      }
      return { compiled, deriv };
    } catch {
      derivStatus.className = "status-line bad";
      derivStatusText.textContent = "Could not evaluate f′ at x₀.";
      return null;
    }
  }

  const debouncedUpdate = Engine.debounce(() => {
    updatePreview();
    updateDerivCheck();
  }, 200);

  [fxInput, x0Input].forEach((el) => el.addEventListener("input", debouncedUpdate));

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "x^3 - x - 2";
    x0Input.value = "1.5";
    tolInput.value = "0.000001";
    maxIterInput.value = "30";
    updatePreview();
    updateDerivCheck();
  });

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() {
    formError.style.display = "none";
  }

  function render(iterations, compiled, deriv, x0) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const last = iterations[iterations.length - 1];
    statRoot.textContent = Engine.formatNum(last.xNext, 8);
    statIters.textContent = String(iterations.length);
    try { statFRoot.textContent = Engine.formatNum(compiled.fn(last.xNext), 6); }
    catch { statFRoot.textContent = "—"; }
    statError.textContent = Engine.formatNum(last.err, 8);

    Engine.renderKatex(formulaBlock, "x_{n+1} = x_n - \\dfrac{f(x_n)}{f'(x_n)}", true);
    Engine.renderKatex(derivFormulaBlock, `f'(x) = ${deriv.latex}`, true);

    iterTableBody.innerHTML = iterations
      .map(
        (it) => `<tr data-n="${it.n}">
          <td>${it.n}</td>
          <td>${Engine.formatNum(it.x, 6)}</td>
          <td>${Engine.formatNum(it.fx, 6)}</td>
          <td>${Engine.formatNum(it.fpx, 6)}</td>
          <td>${Engine.formatNum(it.xNext, 6)}</td>
          <td>${Engine.formatNum(it.err, 8)}</td>
        </tr>`
      )
      .join("");

    // --- f(x) + tangent-line-per-step plot ---
    const allX = [x0, ...iterations.map((it) => it.xNext)].filter(Number.isFinite);
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
      x: iterations.map((it) => it.x),
      y: iterations.map((it) => it.fx),
      mode: "markers",
      type: "scatter",
      name: "xₙ",
      marker: { size: 7, color: iterations.map((it) => it.n), colorscale: [[0, "#5c939f"], [1, "#ed6d40"]], line: { color: "#090909", width: 1 } },
    };
    const first = iterations[0];
    const tangentTrace = {
      x: [xmin, xmax],
      y: [first.fx + first.fpx * (xmin - first.x), first.fx + first.fpx * (xmax - first.x)],
      mode: "lines", type: "scatter", name: "tangent",
      line: { color: "#ed6d40", width: 2, dash: "dot" },
    };
    const currentTrace = {
      x: [first.x], y: [first.fx], mode: "markers", type: "scatter", name: "current",
      marker: { size: 13, color: "#ed6d40", symbol: "circle-open", line: { width: 2, color: "#ed6d40" } },
    };
    const nextTrace = {
      x: [first.xNext], y: [0], mode: "markers", type: "scatter", name: "next",
      marker: { size: 9, color: "#e7e7e7", symbol: "diamond", line: { width: 1.5, color: "#ed6d40" } },
    };

    Plotly.newPlot(
      "fxPlot",
      [curveTrace, zeroTrace, pointsTrace, tangentTrace, currentTrace, nextTrace],
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

    Plotly.restyle(
      "fxPlot",
      {
        x: [[xmin, xmax], [it.x], [it.xNext]],
        y: [
          [it.fx + it.fpx * (xmin - it.x), it.fx + it.fpx * (xmax - it.x)],
          [it.fx],
          [0],
        ],
      },
      [TRACE.tangent, TRACE.current, TRACE.next]
    );
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  function runCompute() {
    clearError();

    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) return showError(`Invalid function: ${compiled.error}`);

    const deriv = Engine.derivativeFx(compiled.node);
    if (!deriv.ok) return showError(`Could not differentiate f(x): ${deriv.error}`);

    const x0 = parseFloat(x0Input.value);
    const tol = parseFloat(tolInput.value);
    const maxIter = parseInt(maxIterInput.value, 10);

    if (Number.isNaN(x0)) return showError("x₀ must be a number.");
    if (Number.isNaN(tol) || tol <= 0) return showError("Tolerance must be a positive number.");
    if (!Number.isInteger(maxIter) || maxIter < 1) return showError("Max iterations must be a positive integer.");

    let iterations;
    try {
      iterations = Algorithms.runNewton(compiled.fn, deriv.fn, x0, tol, maxIter);
    } catch (err) {
      return showError(err.message);
    }

    render(iterations, compiled, deriv, x0);
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
    if (saved.tol !== undefined) tolInput.value = saved.tol;
    if (saved.maxIter !== undefined) maxIterInput.value = saved.maxIter;
  }

  updatePreview();
  updateDerivCheck();
  if (saved) runCompute();
})();
