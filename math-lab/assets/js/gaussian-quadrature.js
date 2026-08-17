(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const modeRow = document.getElementById("modeRow");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("gqForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statTotal = document.getElementById("statTotal");
  const statOrder = document.getElementById("statOrder");
  const statDegree = document.getElementById("statDegree");
  const statNodes = document.getElementById("statNodes");
  const formulaBlock = document.getElementById("formulaBlock");
  const nodeTableBody = document.querySelector("#nodeTable tbody");

  let state = null; // { points, order, bounds, curveX, curveY }
  const STORE_KEY = "engine-lab:numerical-gaussian-quadrature";

  function snapshot() {
    return { fx: fxInput.value, a: aInput.value, b: bInput.value, order: currentOrder() };
  }

  function currentOrder() {
    const active = modeRow.querySelector(".chip.is-active");
    return active ? Number(active.dataset.order) : 2;
  }

  function setOrder(order) {
    modeRow.querySelectorAll(".chip").forEach((c) =>
      c.classList.toggle("is-active", Number(c.dataset.order) === order)
    );
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
    try {
      const fa = compiled.fn(a);
      const fb = compiled.fn(b);
      startStatus.className = "status-line ok";
      const orient = a < b
        ? `f(a) = ${Engine.formatNum(fa, 4)}, f(b) = ${Engine.formatNum(fb, 4)}, order = ${currentOrder()}-point`
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

  [fxInput, aInput, bInput].forEach((el) => el.addEventListener("input", debouncedUpdate));

  modeRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    setOrder(Number(btn.dataset.order));
    updateStartCheck();
  });

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "x^3";
    aInput.value = "0";
    bInput.value = "1";
    setOrder(2);
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

  function render(result, compiled, a, b) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const points = result.points;
    const total = result.total;
    const order = result.order;

    statTotal.textContent = Engine.formatNum(total, 8);
    statOrder.textContent = `${order}-point`;
    statDegree.textContent = String(2 * order - 1);
    statNodes.textContent = String(points.length);

    Engine.renderKatex(
      formulaBlock,
      "\\int_a^b f(x)\\,dx \\approx \\frac{b-a}{2} \\sum_{i=1}^{k} w_i\\, f\\!\\left( \\frac{b-a}{2}\\, t_i + \\frac{a+b}{2} \\right)",
      true
    );

    nodeTableBody.innerHTML = points
      .map(
        (p, i) => `<tr data-n="${i}">
          <td>${i}</td>
          <td>${Engine.formatNum(p.node, 8)}</td>
          <td>${Engine.formatNum(p.x, 6)}</td>
          <td>${Engine.formatNum(p.weight, 8)}</td>
          <td>${Engine.formatNum(p.fx, 6)}</td>
          <td>${Engine.formatNum(p.contribution, 8)}</td>
        </tr>`
      )
      .join("");

    // --- f(x) curve + Gauss nodes (marker size ~ weight) ---
    const allX = points.map((p) => p.x);
    const lo = Math.min(a, b, ...allX), hi = Math.max(a, b, ...allX);
    const pad = Math.max(1e-6, (hi - lo) * 0.15);
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
    // Map weight (≤1) to a visible marker size; floor at 8 so weights never vanish.
    const wMin = Math.min(...points.map((p) => p.weight));
    const wMax = Math.max(...points.map((p) => p.weight));
    const sizeFor = (w) => {
      if (wMax === wMin) return 14;
      return 8 + 18 * ((w - wMin) / (wMax - wMin));
    };
    const nodeTrace = {
      x: points.map((p) => p.x),
      y: points.map((p) => p.fx),
      mode: "markers",
      type: "scatter",
      name: `Gauss nodes (size ∝ wᵢ)`,
      marker: {
        size: points.map((p) => sizeFor(p.weight)),
        color: "#ed6d40",
        line: { color: "#090909", width: 1 },
        symbol: "circle",
      },
      text: points.map((p, i) => `node ${i}<br>t=${Engine.formatNum(p.node, 6)}<br>x=${Engine.formatNum(p.x, 6)}<br>w=${Engine.formatNum(p.weight, 6)}`),
      hoverinfo: "text",
    };
    // Endpoint markers (a, b) in light grey for reference, so the asymmetric
    // node placement reads clearly against the interval edges.
    const endpointTrace = {
      x: [a, b],
      y: [compiled.fn(a), compiled.fn(b)],
      mode: "markers",
      type: "scatter",
      name: "endpoints a, b",
      marker: { size: 8, color: "#e7e7e7", symbol: "diamond", line: { width: 1, color: "#7d858c" } },
      hoverinfo: "x+y",
    };

    Plotly.newPlot(
      "fxPlot",
      [curveTrace, zeroTrace, endpointTrace, nodeTrace],
      Engine.plotlyBaseLayout({ xaxis: { title: "x" }, yaxis: { title: "f(x)" } }),
      Engine.plotlyConfig
    );

    state = { points, order, bounds: { xmin, xmax } };
  }

  function runCompute() {
    clearError();

    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) return showError(`Invalid function: ${compiled.error}`);

    const a = parseFloat(aInput.value);
    const b = parseFloat(bInput.value);
    const order = currentOrder();

    if (Number.isNaN(a) || Number.isNaN(b)) return showError("a and b must be numbers.");
    if (a === b) return showError("a and b must be different.");
    if (order !== 2 && order !== 3) return showError("Order must be 2 or 3.");

    let result;
    try {
      result = Algorithms.runGaussLegendre(compiled.fn, a, b, order);
    } catch (err) {
      return showError(err.message);
    }

    render(result, compiled, a, b);
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
    if (saved.order === 2 || saved.order === 3) setOrder(saved.order);
  }

  updatePreview();
  updateStartCheck();
  if (saved) runCompute();
})();