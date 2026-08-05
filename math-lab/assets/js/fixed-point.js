(function () {
  "use strict";

  const gxInput = document.getElementById("gxInput");
  const gxPreview = document.getElementById("gxPreview");
  const x0Input = document.getElementById("x0Input");
  const tolInput = document.getElementById("tolInput");
  const maxIterInput = document.getElementById("maxIterInput");
  const convStatus = document.getElementById("convStatus");
  const convStatusText = document.getElementById("convStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("fpForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statRoot = document.getElementById("statRoot");
  const statIters = document.getElementById("statIters");
  const statGRoot = document.getElementById("statGRoot");
  const statError = document.getElementById("statError");
  const formulaBlock = document.getElementById("formulaBlock");
  const iterTableBody = document.querySelector("#iterTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  let state = null; // { iterations, x0 }
  const CURRENT_TRACE = 3; // index of the "current" marker trace in the cobweb plot

  function updatePreview() {
    Engine.renderKatex(gxPreview, `g(x) = ${Engine.toLatex(gxInput.value)}`, false);
    Engine.pulseFlash(gxPreview);
  }

  function updateConvergenceCheck() {
    const compiled = Engine.compileFx(gxInput.value);
    if (!compiled.ok) {
      convStatus.className = "status-line bad";
      convStatusText.textContent = compiled.error;
      return null;
    }
    const x0 = parseFloat(x0Input.value);
    if (Number.isNaN(x0)) {
      convStatus.className = "status-line bad";
      convStatusText.textContent = "Enter a numeric starting guess x₀.";
      return null;
    }
    const deriv = Engine.derivativeFx(compiled.node);
    if (!deriv.ok) {
      convStatus.className = "status-line bad";
      convStatusText.textContent = "Could not differentiate g(x) symbolically.";
      return null;
    }
    try {
      const gPrime0 = deriv.fn(x0);
      const mag = Math.abs(gPrime0);
      if (mag < 1) {
        convStatus.className = "status-line ok";
        convStatusText.textContent = `|g′(x₀)| = ${Engine.formatNum(mag, 4)} < 1 — likely to converge`;
      } else {
        convStatus.className = "status-line bad";
        convStatusText.textContent = `|g′(x₀)| = ${Engine.formatNum(mag, 4)} ≥ 1 — likely to diverge near x₀`;
      }
      return compiled;
    } catch {
      convStatus.className = "status-line bad";
      convStatusText.textContent = "Could not evaluate g′ at x₀.";
      return null;
    }
  }

  const debouncedUpdate = Engine.debounce(() => {
    updatePreview();
    updateConvergenceCheck();
  }, 200);

  [gxInput, x0Input].forEach((el) => el.addEventListener("input", debouncedUpdate));

  exampleBtn.addEventListener("click", () => {
    gxInput.value = "cos(x)";
    x0Input.value = "0.5";
    tolInput.value = "0.000001";
    maxIterInput.value = "40";
    updatePreview();
    updateConvergenceCheck();
  });

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() {
    formError.style.display = "none";
  }

  function render(iterations, compiled, x0) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const last = iterations[iterations.length - 1];
    statRoot.textContent = Engine.formatNum(last.gx, 8);
    statIters.textContent = String(iterations.length);
    try { statGRoot.textContent = Engine.formatNum(compiled.fn(last.gx), 6); }
    catch { statGRoot.textContent = "—"; }
    statError.textContent = Engine.formatNum(last.err, 8);

    Engine.renderKatex(formulaBlock, "x_{n+1} = g(x_n)", true);

    iterTableBody.innerHTML = iterations
      .map(
        (it) => `<tr data-n="${it.n}">
          <td>${it.n}</td>
          <td>${Engine.formatNum(it.x, 6)}</td>
          <td>${Engine.formatNum(it.gx, 6)}</td>
          <td>${Engine.formatNum(it.err, 8)}</td>
        </tr>`
      )
      .join("");

    // --- cobweb diagram: y = g(x), y = x, and the staircase between them ---
    const allX = [x0, ...iterations.map((it) => it.gx)].filter(Number.isFinite);
    const lo = Math.min(...allX), hi = Math.max(...allX);
    const span = Math.max(hi - lo, 1);
    const pad = span * 0.5 + 0.5;
    const xmin = lo - pad, xmax = hi + pad;

    const gxs = [], gys = [];
    for (let i = 0; i <= 200; i++) {
      const x = xmin + ((xmax - xmin) * i) / 200;
      let y;
      try { y = compiled.fn(x); } catch { y = null; }
      gxs.push(x); gys.push(Number.isFinite(y) ? y : null);
    }

    const gCurve = { x: gxs, y: gys, mode: "lines", type: "scatter", name: "y = g(x)", line: { color: "#5c939f", width: 2 } };
    const identityLine = { x: [xmin, xmax], y: [xmin, xmax], mode: "lines", type: "scatter", name: "y = x", line: { color: "#7d858c", width: 1, dash: "dash" }, hoverinfo: "skip" };

    const pathX = [x0], pathY = [x0];
    let px = x0;
    iterations.forEach((it) => {
      pathX.push(px, it.gx);
      pathY.push(it.gx, it.gx);
      px = it.gx;
    });
    const cobwebTrace = { x: pathX, y: pathY, mode: "lines", type: "scatter", name: "iterates", line: { color: "#ed6d40", width: 1.5 } };
    const currentTrace = {
      x: [x0], y: [x0], mode: "markers", type: "scatter", name: "current",
      marker: { size: 13, color: "#ed6d40", symbol: "circle-open", line: { width: 2, color: "#ed6d40" } },
    };

    Plotly.newPlot(
      "cobwebPlot",
      [gCurve, identityLine, cobwebTrace, currentTrace],
      Engine.plotlyBaseLayout({ xaxis: { title: "x" }, yaxis: { title: "y" } }),
      Engine.plotlyConfig
    );

    // --- step slider ---
    stepSlider.min = 0;
    stepSlider.max = iterations.length - 1;
    stepSlider.value = iterations.length - 1;
    state = { iterations, x0 };
    updateStep(iterations.length - 1);
  }

  function updateStep(idx) {
    if (!state) return;
    const it = state.iterations[idx];
    stepLabel.textContent = `step ${it.n} / ${state.iterations.length}`;
    document.querySelectorAll("#iterTable tbody tr").forEach((row) => {
      row.classList.toggle("is-current", Number(row.dataset.n) === it.n);
    });
    const rowEl = document.querySelector(`#iterTable tbody tr[data-n="${it.n}"]`);
    if (rowEl) rowEl.scrollIntoView({ block: "nearest" });
    Plotly.restyle("cobwebPlot", { x: [[it.gx]], y: [[it.gx]] }, [CURRENT_TRACE]);
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();

    const compiled = Engine.compileFx(gxInput.value);
    if (!compiled.ok) return showError(`Invalid function: ${compiled.error}`);

    const x0 = parseFloat(x0Input.value);
    const tol = parseFloat(tolInput.value);
    const maxIter = parseInt(maxIterInput.value, 10);

    if (Number.isNaN(x0)) return showError("x₀ must be a number.");
    if (Number.isNaN(tol) || tol <= 0) return showError("Tolerance must be a positive number.");
    if (!Number.isInteger(maxIter) || maxIter < 1) return showError("Max iterations must be a positive integer.");

    let iterations;
    try {
      iterations = Algorithms.runFixedPoint(compiled.fn, x0, tol, maxIter);
    } catch (err) {
      return showError(err.message);
    }

    render(iterations, compiled, x0);
  });

  Engine.attachMathKeypad(gxInput, document.getElementById("gxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("gxKeypad"));

  updatePreview();
  updateConvergenceCheck();
})();
