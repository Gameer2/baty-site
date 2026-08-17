(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const tolInput = document.getElementById("tolInput");
  const maxIterInput = document.getElementById("maxIterInput");
  const signStatus = document.getElementById("signStatus");
  const signStatusText = document.getElementById("signStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("bisectionForm");
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

  const bracketFill = document.getElementById("bracketFill");
  const markerA = document.getElementById("markerA");
  const markerB = document.getElementById("markerB");
  const markerC = document.getElementById("markerC");
  const markerALabel = document.getElementById("markerALabel");
  const markerBLabel = document.getElementById("markerBLabel");
  const markerCLabel = document.getElementById("markerCLabel");
  const scaleMin = document.getElementById("scaleMin");
  const scaleMax = document.getElementById("scaleMax");

  let state = null; // { iterations, range0 }
  const CURRENT_TRACE = 3;
  const STORE_KEY = "engine-lab:numerical-bisection";

  function snapshot() {
    return {
      fx: fxInput.value,
      a: aInput.value,
      b: bInput.value,
      tol: tolInput.value,
      maxIter: maxIterInput.value,
    };
  }

  function updatePreview() {
    Engine.renderKatex(fxPreview, `f(x) = ${Engine.toLatex(fxInput.value)}`, false);
    Engine.pulseFlash(fxPreview);
  }

  function updateSignCheck() {
    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) {
      signStatus.className = "status-line bad";
      signStatusText.textContent = compiled.error;
      return null;
    }
    const a = parseFloat(aInput.value);
    const b = parseFloat(bInput.value);
    if (Number.isNaN(a) || Number.isNaN(b)) {
      signStatus.className = "status-line bad";
      signStatusText.textContent = "Enter numeric bounds a and b.";
      return null;
    }
    try {
      const fa = compiled.fn(a);
      const fb = compiled.fn(b);
      if (fa * fb < 0) {
        signStatus.className = "status-line ok";
        signStatusText.textContent = `f(a)·f(b) < 0 — bracket is valid (f(a)=${Engine.formatNum(fa, 4)}, f(b)=${Engine.formatNum(fb, 4)})`;
        return compiled;
      }
      signStatus.className = "status-line bad";
      signStatusText.textContent = `f(a)·f(b) ≥ 0 — no guaranteed sign change in [a, b]`;
      return null;
    } catch (err) {
      signStatus.className = "status-line bad";
      signStatusText.textContent = "Could not evaluate f at a or b.";
      return null;
    }
  }

  const debouncedUpdate = Engine.debounce(() => {
    updatePreview();
    updateSignCheck();
  }, 200);

  [fxInput, aInput, bInput].forEach((el) => el.addEventListener("input", debouncedUpdate));

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "x^3 - x - 2";
    aInput.value = "1";
    bInput.value = "2";
    tolInput.value = "0.000001";
    maxIterInput.value = "40";
    updatePreview();
    updateSignCheck();
  });

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() {
    formError.style.display = "none";
  }

  function render(iterations, compiled, bounds) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const last = iterations[iterations.length - 1];
    statRoot.textContent = Engine.formatNum(last.c, 8);
    statIters.textContent = String(iterations.length);
    statFRoot.textContent = Engine.formatNum(last.fc, 6);
    statError.textContent = Engine.formatNum(last.err, 8);

    Engine.renderKatex(formulaBlock, "c_n = \\dfrac{a_n + b_n}{2}", true);

    iterTableBody.innerHTML = iterations
      .map(
        (it) => `<tr data-n="${it.n}">
          <td>${it.n}</td>
          <td>${Engine.formatNum(it.a, 6)}</td>
          <td>${Engine.formatNum(it.b, 6)}</td>
          <td>${Engine.formatNum(it.c, 6)}</td>
          <td>${Engine.formatNum(it.fc, 6)}</td>
          <td>${Engine.formatNum(it.err, 8)}</td>
        </tr>`
      )
      .join("");

    // --- f(x) + root trace plot ---
    const pad = Math.max(0.5, (bounds.b - bounds.a) * 0.6);
    const xmin = bounds.a - pad, xmax = bounds.b + pad;
    const xs = [], ys = [];
    for (let i = 0; i <= 240; i++) {
      const x = xmin + ((xmax - xmin) * i) / 240;
      let y;
      try { y = compiled.fn(x); } catch { y = null; }
      xs.push(x); ys.push(Number.isFinite(y) ? y : null);
    }

    const curveTrace = { x: xs, y: ys, mode: "lines", type: "scatter", name: "f(x)", line: { color: "#5c939f", width: 2 } };
    const zeroTrace = { x: [xmin, xmax], y: [0, 0], mode: "lines", type: "scatter", name: "y = 0", line: { color: "#7d858c", width: 1, dash: "dash" }, hoverinfo: "skip" };
    const cTrace = {
      x: iterations.map((it) => it.c),
      y: iterations.map((it) => it.fc),
      mode: "markers",
      type: "scatter",
      name: "cₙ",
      marker: { size: 7, color: iterations.map((it) => it.n), colorscale: [[0, "#5c939f"], [1, "#ed6d40"]], line: { color: "#090909", width: 1 } },
    };
    const currentTrace = {
      x: [last.c], y: [last.fc], mode: "markers", type: "scatter", name: "current",
      marker: { size: 13, color: "#ed6d40", symbol: "circle-open", line: { width: 2, color: "#ed6d40" } },
    };

    Plotly.newPlot(
      "fxPlot",
      [curveTrace, zeroTrace, cTrace, currentTrace],
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

    // --- step slider + bracket number-line (range fixed to the original [a0, b0]) ---
    stepSlider.min = 0;
    stepSlider.max = iterations.length - 1;
    stepSlider.value = iterations.length - 1;
    state = { iterations, range0: { a: bounds.a, b: bounds.b } };
    scaleMin.textContent = Engine.formatNum(bounds.a, 4);
    scaleMax.textContent = Engine.formatNum(bounds.b, 4);
    updateStep(iterations.length - 1);
  }

  function updateBracketViz(it) {
    const { a: r0, b: r1 } = state.range0;
    const span = r1 - r0 || 1;
    const pct = (v) => Math.min(100, Math.max(0, ((v - r0) / span) * 100));
    const pa = pct(it.a), pb = pct(it.b), pc = pct(it.c);
    bracketFill.style.left = `${pa}%`;
    bracketFill.style.width = `${Math.max(0, pb - pa)}%`;
    markerA.style.left = `${pa}%`;
    markerB.style.left = `${pb}%`;
    markerC.style.left = `${pc}%`;
    markerALabel.textContent = `a=${Engine.formatNum(it.a, 4)}`;
    markerBLabel.textContent = `b=${Engine.formatNum(it.b, 4)}`;
    markerCLabel.textContent = `c=${Engine.formatNum(it.c, 4)}`;
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
    Plotly.restyle("fxPlot", { x: [[it.c]], y: [[it.fc]] }, [CURRENT_TRACE]);
    updateBracketViz(it);
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  function runCompute() {
    clearError();

    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) return showError(`Invalid function: ${compiled.error}`);

    const a = parseFloat(aInput.value);
    const b = parseFloat(bInput.value);
    const tol = parseFloat(tolInput.value);
    const maxIter = parseInt(maxIterInput.value, 10);

    if (Number.isNaN(a) || Number.isNaN(b)) return showError("a and b must be numbers.");
    if (a >= b) return showError("Require a < b.");
    if (Number.isNaN(tol) || tol <= 0) return showError("Tolerance must be a positive number.");
    if (!Number.isInteger(maxIter) || maxIter < 1) return showError("Max iterations must be a positive integer.");

    let fa, fb;
    try { fa = compiled.fn(a); fb = compiled.fn(b); } catch { return showError("f(x) could not be evaluated at a or b."); }
    if (fa * fb >= 0) return showError("f(a) and f(b) must have opposite signs.");

    const iterations = Algorithms.runBisection(compiled.fn, a, b, tol, maxIter);
    render(iterations, compiled, { a, b });
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
    if (saved.tol !== undefined) tolInput.value = saved.tol;
    if (saved.maxIter !== undefined) maxIterInput.value = saved.maxIter;
  }

  updatePreview();
  updateSignCheck();
  if (saved) runCompute();
})();
