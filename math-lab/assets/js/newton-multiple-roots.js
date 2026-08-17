(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const x0Input = document.getElementById("x0Input");
  const tolInput = document.getElementById("tolInput");
  const maxIterInput = document.getElementById("maxIterInput");
  const statusLine = document.getElementById("statusLine");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("newtonMultipleForm");
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

  let state = null;
  const CURRENT_TRACE = 2;
  const STORE_KEY = "engine-lab:numerical-newton-multiple-roots";

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

  function updateStatus() {
    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) {
      statusLine.className = "status-line bad";
      statusLine.textContent = compiled.error;
      return null;
    }
    const x0 = parseFloat(x0Input.value);
    if (Number.isNaN(x0)) {
      statusLine.className = "status-line bad";
      statusLine.textContent = "Enter a numeric starting guess x₀.";
      return null;
    }
    statusLine.className = "status-line ok";
    statusLine.textContent = `f(x) valid, starting at x₀ = ${x0}`;
    return compiled;
  }

  const debouncedUpdate = Engine.debounce(() => {
    updatePreview();
    updateStatus();
  }, 200);

  [fxInput, x0Input].forEach((el) => el.addEventListener("input", debouncedUpdate));

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "(x - 2)^2";
    x0Input.value = "0";
    tolInput.value = "0.000001";
    maxIterInput.value = "20";
    updatePreview();
    updateStatus();
  });

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() {
    formError.style.display = "none";
  }

  function render(iterations, compiled) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const last = iterations[iterations.length - 1];
    statRoot.textContent = Engine.formatNum(last.xNext, 8);
    statIters.textContent = String(iterations.length);
    statFRoot.textContent = Engine.formatNum(last.fx, 6);
    statError.textContent = Engine.formatNum(last.err, 8);

    Engine.renderKatex(formulaBlock, "x_{n+1} = x_n - \\dfrac{f(x_n)\\,f'(x_n)}{[f'(x_n)]^2 - f(x_n)\\,f''(x_n)}", true);

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

    const xmin = Math.min(...iterations.map((it) => it.x)) - 1;
    const xmax = Math.max(...iterations.map((it) => it.x)) + 1;
    const xs = [], ys = [];
    for (let i = 0; i <= 240; i++) {
      const x = xmin + ((xmax - xmin) * i) / 240;
      let y;
      try { y = compiled.fn(x); } catch { y = null; }
      xs.push(x); ys.push(Number.isFinite(y) ? y : null);
    }

    const curveTrace = { x: xs, y: ys, mode: "lines", type: "scatter", name: "f(x)", line: { color: "#5c939f", width: 2 } };
    const zeroTrace = { x: [xmin, xmax], y: [0, 0], mode: "lines", type: "scatter", name: "y = 0", line: { color: "#7d858c", width: 1, dash: "dash" }, hoverinfo: "skip" };
    const iterTrace = {
      x: iterations.map((it) => it.x),
      y: iterations.map((it) => it.fx),
      mode: "markers",
      type: "scatter",
      name: "xₙ",
      marker: { size: 7, color: "#5c939f", line: { color: "#090909", width: 1 } },
    };
    const currentTrace = {
      x: [last.x], y: [last.fx], mode: "markers", type: "scatter", name: "current",
      marker: { size: 13, color: "#ed6d40", symbol: "circle-open", line: { width: 2, color: "#ed6d40" } },
    };

    Plotly.newPlot("fxPlot", [curveTrace, zeroTrace, iterTrace, currentTrace],
      Engine.plotlyBaseLayout({ xaxis: { title: "x" }, yaxis: { title: "f(x)" } }), Engine.plotlyConfig);

    Plotly.newPlot("errorPlot", [{
      x: iterations.map((it) => it.n),
      y: iterations.map((it) => Math.max(it.err, 1e-16)),
      mode: "lines+markers", type: "scatter",
      line: { color: "#ed6d40", width: 2 }, marker: { size: 5, color: "#ed6d40" },
    }], Engine.plotlyBaseLayout({ xaxis: { title: "iteration n" }, yaxis: { title: "|error|", type: "log" } }), Engine.plotlyConfig);

    stepSlider.min = 0;
    stepSlider.max = iterations.length - 1;
    stepSlider.value = iterations.length - 1;
    state = { iterations };
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
    Plotly.restyle("fxPlot", { x: [[it.x]], y: [[it.fx]] }, [CURRENT_TRACE]);
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  function runCompute() {
    clearError();

    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) return showError(`Invalid function: ${compiled.error}`);

    const x0 = parseFloat(x0Input.value);
    const tol = parseFloat(tolInput.value);
    const maxIter = parseInt(maxIterInput.value, 10);

    if (Number.isNaN(x0)) return showError("x₀ must be a number.");
    if (Number.isNaN(tol) || tol <= 0) return showError("Tolerance must be a positive number.");
    if (!Number.isInteger(maxIter) || maxIter < 1) return showError("Max iterations must be a positive integer.");

    const fp = Engine.derivativeFx(compiled.node, "x");
    if (!fp.ok) return showError(`Could not compute f'(x): ${fp.error}`);
    const fpp = Engine.derivativeFx(fp.node, "x");
    if (!fpp.ok) return showError(`Could not compute f''(x): ${fpp.error}`);

    try {
      const iterations = Algorithms.runNewtonMultiple(compiled.fn, fp.fn, fpp.fn, x0, tol, maxIter);
      render(iterations, compiled);
      Proto.saveState(STORE_KEY, snapshot());
    } catch (err) {
      showError(err.message);
    }
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
  updateStatus();
  if (saved) runCompute();
})();
