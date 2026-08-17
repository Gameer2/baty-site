(function () {
  "use strict";

  const pInput = document.getElementById("pInput");
  const pPreview = document.getElementById("pPreview");
  const qInput = document.getElementById("qInput");
  const qPreview = document.getElementById("qPreview");
  const rInput = document.getElementById("rInput");
  const rPreview = document.getElementById("rPreview");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const alphaInput = document.getElementById("alphaInput");
  const betaInput = document.getElementById("betaInput");
  const nInput = document.getElementById("nInput");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("fdForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statMid = document.getElementById("statMid");
  const statGrid = document.getElementById("statGrid");
  const statH = document.getElementById("statH");
  const formulaBlock = document.getElementById("formulaBlock");
  const iterTableBody = document.querySelector("#iterTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  let state = null; // { grid, bounds }
  const TRACE = { solution: 0, current: 1 };
  const STORE_KEY = "engine-lab:numerical-finite-difference-bvp";

  function snapshot() {
    return {
      p: pInput.value,
      q: qInput.value,
      r: rInput.value,
      a: aInput.value,
      b: bInput.value,
      alpha: alphaInput.value,
      beta: betaInput.value,
      n: nInput.value,
    };
  }

  function updatePreview() {
    Engine.renderKatex(pPreview, `p(x) = ${Engine.toLatex(pInput.value)}`, false);
    Engine.pulseFlash(pPreview);
    Engine.renderKatex(qPreview, `q(x) = ${Engine.toLatex(qInput.value)}`, false);
    Engine.pulseFlash(qPreview);
    Engine.renderKatex(rPreview, `r(x) = ${Engine.toLatex(rInput.value)}`, false);
    Engine.pulseFlash(rPreview);
  }

  function updateStartCheck() {
    const cp = Engine.compileFx(pInput.value);
    const cq = Engine.compileFx(qInput.value);
    const cr = Engine.compileFx(rInput.value);
    if (!cp.ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = `p(x): ${cp.error}`;
      return null;
    }
    if (!cq.ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = `q(x): ${cq.error}`;
      return null;
    }
    if (!cr.ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = `r(x): ${cr.error}`;
      return null;
    }
    const a = parseFloat(aInput.value);
    const b = parseFloat(bInput.value);
    const alpha = parseFloat(alphaInput.value);
    const beta = parseFloat(betaInput.value);
    const n = parseInt(nInput.value, 10);
    if ([a, b, alpha, beta].some((v) => Number.isNaN(v))) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter numeric values for a, b, α, β.";
      return null;
    }
    if (a === b) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Interval endpoints a and b must differ.";
      return null;
    }
    if (!Number.isInteger(n) || n < 2) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "n must be an integer ≥ 2.";
      return null;
    }
    try {
      const xa = a + ((b - a) / n);
      cp.fn(xa); cq.fn(xa); cr.fn(xa);
      startStatus.className = "status-line ok";
      startStatusText.textContent = `BVP y'' = p(x)y' + q(x)y + r(x) on [${Engine.formatNum(a, 4)}, ${Engine.formatNum(b, 4)}], ${n} subintervals — ready.`;
      return { cp, cq, cr };
    } catch {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Could not evaluate p(x), q(x), or r(x) on the interval.";
      return null;
    }
  }

  const debouncedUpdate = Engine.debounce(() => {
    updatePreview();
    updateStartCheck();
  }, 200);

  [pInput, qInput, rInput, aInput, bInput, alphaInput, betaInput, nInput].forEach((el) =>
    el.addEventListener("input", debouncedUpdate)
  );

  exampleBtn.addEventListener("click", () => {
    pInput.value = "0";
    qInput.value = "-1";
    rInput.value = "0";
    aInput.value = "0";
    bInput.value = "1.5707963267948966";
    alphaInput.value = "0";
    betaInput.value = "1";
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

  function render(result, n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const { grid, h } = result;
    const a = grid[0].x, b = grid[grid.length - 1].x;
    const midX = (a + b) / 2;
    let nearest = grid[0];
    for (const g of grid) {
      if (Math.abs(g.x - midX) < Math.abs(nearest.x - midX)) nearest = g;
    }

    statMid.textContent = Engine.formatNum(nearest.w, 8);
    statGrid.textContent = String(grid.length);
    statH.textContent = Engine.formatNum(h, 8);

    Engine.renderKatex(
      formulaBlock,
      "A_i = -1 - \\tfrac{h}{2}\\,p(x_i), \\quad B_i = 2 + h^2 q(x_i), \\\\[4pt] "
      + "C_i = -1 + \\tfrac{h}{2}\\,p(x_i), \\quad D_i = -h^2 r(x_i)",
      true
    );

    iterTableBody.innerHTML = grid
      .map(
        (g) => `<tr data-n="${g.i}">
          <td>${g.i}</td>
          <td>${Engine.formatNum(g.x, 6)}</td>
          <td>${Engine.formatNum(g.w, 6)}</td>
        </tr>`
      )
      .join("");

    const xs = grid.map((g) => g.x);
    const ws = grid.map((g) => g.w);
    const xmin = xs[0], xmax = xs[xs.length - 1];

    const solutionTrace = {
      x: xs, y: ws,
      mode: "lines+markers",
      type: "scatter",
      name: "w_i (FD solution)",
      line: { color: "#ed6d40", width: 2 },
      marker: { size: 7, color: "#ed6d40", line: { color: "#090909", width: 1 } },
    };
    const first = grid[0];
    const currentTrace = {
      x: [first.x], y: [first.w],
      mode: "markers", type: "scatter", name: "current node",
      marker: { size: 15, color: "#e7e7e7", symbol: "circle-open", line: { width: 2, color: "#5c939f" } },
    };

    Plotly.newPlot(
      "fdPlot",
      [solutionTrace, currentTrace],
      Engine.plotlyBaseLayout({
        xaxis: { title: "x" },
        yaxis: { title: "y (w_i)" },
        showlegend: true,
      }),
      Engine.plotlyConfig
    );

    stepSlider.min = 0;
    stepSlider.max = grid.length - 1;
    stepSlider.value = 0;
    state = { grid };
    updateStep(0);
  }

  function updateStep(idx) {
    if (!state) return;
    const g = state.grid[idx];
    stepLabel.textContent = `node i = ${g.i} / ${state.grid.length - 1}`;
    document.querySelectorAll("#iterTable tbody tr").forEach((row) => {
      row.classList.toggle("is-current", Number(row.dataset.n) === g.i);
    });
    const rowEl = document.querySelector(`#iterTable tbody tr[data-n="${g.i}"]`);
    if (rowEl) rowEl.scrollIntoView({ block: "nearest" });

    Plotly.restyle(
      "fdPlot",
      { x: [[g.x]], y: [[g.w]] },
      [TRACE.current]
    );
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  function runCompute() {
    clearError();

    const cp = Engine.compileFx(pInput.value);
    if (!cp.ok) return showError(`Invalid p(x): ${cp.error}`);
    const cq = Engine.compileFx(qInput.value);
    if (!cq.ok) return showError(`Invalid q(x): ${cq.error}`);
    const cr = Engine.compileFx(rInput.value);
    if (!cr.ok) return showError(`Invalid r(x): ${cr.error}`);

    const a = parseFloat(aInput.value);
    const b = parseFloat(bInput.value);
    const alpha = parseFloat(alphaInput.value);
    const beta = parseFloat(betaInput.value);
    const n = parseInt(nInput.value, 10);

    if ([a, b, alpha, beta].some((v) => Number.isNaN(v))) return showError("a, b, α, β must be numbers.");
    if (a === b) return showError("Interval endpoints a and b must differ.");
    if (!Number.isInteger(n) || n < 2) return showError("n must be an integer ≥ 2.");

    let result;
    try {
      result = Algorithms.runFiniteDifference(cp.fn, cq.fn, cr.fn, a, b, alpha, beta, n);
    } catch (err) {
      return showError(err.message);
    }

    render(result, n);
    Proto.saveState(STORE_KEY, snapshot());
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runCompute();
  });

  Engine.attachMathKeypad(pInput, document.getElementById("pKeypad"));
  Engine.attachKeypadToggle(document.getElementById("pKeypadToggle"), document.getElementById("pKeypad"));
  Engine.attachMathKeypad(qInput, document.getElementById("qKeypad"));
  Engine.attachKeypadToggle(document.getElementById("qKeypadToggle"), document.getElementById("qKeypad"));
  Engine.attachMathKeypad(rInput, document.getElementById("rKeypad"));
  Engine.attachKeypadToggle(document.getElementById("rKeypadToggle"), document.getElementById("rKeypad"));

  const saved = Proto.loadState(STORE_KEY);
  if (saved) {
    if (saved.p !== undefined) pInput.value = saved.p;
    if (saved.q !== undefined) qInput.value = saved.q;
    if (saved.r !== undefined) rInput.value = saved.r;
    if (saved.a !== undefined) aInput.value = saved.a;
    if (saved.b !== undefined) bInput.value = saved.b;
    if (saved.alpha !== undefined) alphaInput.value = saved.alpha;
    if (saved.beta !== undefined) betaInput.value = saved.beta;
    if (saved.n !== undefined) nInput.value = saved.n;
  }

  updatePreview();
  updateStartCheck();
  if (saved) runCompute();
})();