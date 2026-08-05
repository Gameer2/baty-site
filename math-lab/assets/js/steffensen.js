(function () {
  "use strict";

  const gxInput = document.getElementById("gxInput");
  const gxPreview = document.getElementById("gxPreview");
  const x0Input = document.getElementById("x0Input");
  const tolInput = document.getElementById("tolInput");
  const maxIterInput = document.getElementById("maxIterInput");
  const statusLine = document.getElementById("statusLine");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("steffensenForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statRoot = document.getElementById("statRoot");
  const statIters = document.getElementById("statIters");
  const statGx = document.getElementById("statGx");
  const statError = document.getElementById("statError");
  const formulaBlock = document.getElementById("formulaBlock");
  const iterTableBody = document.querySelector("#iterTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  let state = null;
  const CURRENT_TRACE = 2;

  function updatePreview() {
    Engine.renderKatex(gxPreview, `g(x) = ${Engine.toLatex(gxInput.value)}`, false);
    Engine.pulseFlash(gxPreview);
  }

  function updateStatus() {
    const compiled = Engine.compileFx(gxInput.value);
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
    statusLine.textContent = `g(x) valid, starting at x₀ = ${x0}`;
    return compiled;
  }

  const debouncedUpdate = Engine.debounce(() => {
    updatePreview();
    updateStatus();
  }, 200);

  [gxInput, x0Input].forEach((el) => el.addEventListener("input", debouncedUpdate));

  exampleBtn.addEventListener("click", () => {
    gxInput.value = "cos(x)";
    x0Input.value = "0.5";
    tolInput.value = "0.00000001";
    maxIterInput.value = "50";
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
    statGx.textContent = Engine.formatNum(last.gx, 6);
    statError.textContent = Engine.formatNum(last.err, 8);

    Engine.renderKatex(formulaBlock, "\\hat{x} = x_0 - \\dfrac{(g(x_0) - x_0)^2}{g(g(x_0)) - 2g(x_0) + x_0}", true);

    iterTableBody.innerHTML = iterations
      .map(
        (it) => `<tr data-n="${it.n}">
          <td>${it.n}</td>
          <td>${Engine.formatNum(it.x, 6)}</td>
          <td>${Engine.formatNum(it.gx, 6)}</td>
          <td>${Engine.formatNum(it.ggx, 6)}</td>
          <td>${Engine.formatNum(it.xNext, 6)}</td>
          <td>${Engine.formatNum(it.err, 8)}</td>
        </tr>`
      )
      .join("");

    const xmin = Math.min(...iterations.map((it) => it.x)) - 0.5;
    const xmax = Math.max(...iterations.map((it) => it.x)) + 0.5;
    const xs = [], ys = [];
    for (let i = 0; i <= 240; i++) {
      const x = xmin + ((xmax - xmin) * i) / 240;
      let y;
      try { y = compiled.fn(x); } catch { y = null; }
      xs.push(x); ys.push(Number.isFinite(y) ? y : null);
    }

    const curveTrace = { x: xs, y: ys, mode: "lines", type: "scatter", name: "g(x)", line: { color: "#5c939f", width: 2 } };
    const identityTrace = { x: [xmin, xmax], y: [xmin, xmax], mode: "lines", type: "scatter", name: "y = x", line: { color: "#7d858c", width: 1, dash: "dash" }, hoverinfo: "skip" };
    const iterTrace = {
      x: iterations.map((it) => it.x),
      y: iterations.map((it) => it.gx),
      mode: "markers",
      type: "scatter",
      name: "xₙ",
      marker: { size: 7, color: "#5c939f", line: { color: "#090909", width: 1 } },
    };
    const currentTrace = {
      x: [last.x], y: [last.gx], mode: "markers", type: "scatter", name: "current",
      marker: { size: 13, color: "#ed6d40", symbol: "circle-open", line: { width: 2, color: "#ed6d40" } },
    };

    Plotly.newPlot("fxPlot", [curveTrace, identityTrace, iterTrace, currentTrace],
      Engine.plotlyBaseLayout({ xaxis: { title: "x" }, yaxis: { title: "g(x)" } }), Engine.plotlyConfig);

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
    Plotly.restyle("fxPlot", { x: [[it.x]], y: [[it.gx]] }, [CURRENT_TRACE]);
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

    try {
      const iterations = Algorithms.runSteffensen(compiled.fn, x0, tol, maxIter);
      render(iterations, compiled);
    } catch (err) {
      showError(err.message);
    }
  });

  Engine.attachMathKeypad(gxInput, document.getElementById("gxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("gxKeypad"));

  updatePreview();
  updateStatus();
})();
