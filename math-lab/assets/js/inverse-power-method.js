(function () {
  "use strict";

  const sizeInput = document.getElementById("sizeInput");
  const matrixTableBody = document.getElementById("matrixTableBody");
  const x0Row = document.getElementById("x0Row");
  const tolInput = document.getElementById("tolInput");
  const maxIterInput = document.getElementById("maxIterInput");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("inversePowerForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statLambdaMin = document.getElementById("statLambdaMin");
  const statIters = document.getElementById("statIters");
  const statEigenvector = document.getElementById("statEigenvector");
  const formulaBlock = document.getElementById("formulaBlock");
  const iterTableBody = document.querySelector("#iterTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  let state = null; // { iterations }
  const TRACE = { mu: 0, current: 1 };

  // Default example: n=2, A=[[3.5,1.5],[1.5,3.5]], x0=[1,0]
  const DEFAULT_MATRIX = [[3.5, 1.5], [1.5, 3.5]];
  const DEFAULT_X0 = [1, 0];
  const STORE_KEY = "engine-lab:numerical-inverse-power-method";

  function snapshot() {
    return {
      matrix: getMatrix().map((row) => row.join(",")).join(";"),
      x0: getX0().join(","),
      tol: tolInput.value,
      maxIter: maxIterInput.value,
    };
  }

  function buildMatrixGrid(n, fill) {
    matrixTableBody.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const tr = document.createElement("tr");
      for (let j = 0; j < n; j++) {
        const td = document.createElement("td");
        const inp = document.createElement("input");
        inp.type = "number";
        inp.className = "mat-cell";
        inp.dataset.row = String(i);
        inp.dataset.col = String(j);
        inp.step = "any";
        inp.value = fill && fill[i] && fill[i][j] !== undefined ? fill[i][j] : 0;
        td.appendChild(inp);
        tr.appendChild(td);
      }
      matrixTableBody.appendChild(tr);
    }
  }

  function buildX0Row(n, fill) {
    x0Row.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const cell = document.createElement("div");
      cell.className = "field";
      const label = document.createElement("label");
      label.textContent = `x₀[${i}]`;
      const inp = document.createElement("input");
      inp.type = "number";
      inp.className = "x0-cell";
      inp.dataset.idx = String(i);
      inp.step = "any";
      inp.value = fill && fill[i] !== undefined ? fill[i] : 0;
      cell.appendChild(label);
      cell.appendChild(inp);
      x0Row.appendChild(cell);
    }
  }

  function getMatrix() {
    const n = parseInt(sizeInput.value, 10);
    const A = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < n; j++) {
        const cell = matrixTableBody.querySelector(
          `input.mat-cell[data-row="${i}"][data-col="${j}"]`
        );
        const v = parseFloat(cell.value);
        row.push(Number.isFinite(v) ? v : 0);
      }
      A.push(row);
    }
    return A;
  }

  function getX0() {
    const n = parseInt(sizeInput.value, 10);
    const x0 = [];
    for (let i = 0; i < n; i++) {
      const cell = x0Row.querySelector(`input.x0-cell[data-idx="${i}"]`);
      const v = parseFloat(cell.value);
      x0.push(Number.isFinite(v) ? v : 0);
    }
    return x0;
  }

  function updateStartCheck() {
    const n = parseInt(sizeInput.value, 10);
    if (!Number.isInteger(n) || n < 2 || n > 6) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Matrix size n must be an integer between 2 and 6.";
      return null;
    }
    const A = getMatrix();
    const x0 = getX0();
    const allZero = x0.every((v) => Math.abs(v) < 1e-14);
    if (allZero) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Starting vector cannot be all zero.";
      return null;
    }
    const maxAbs = Math.max(...x0.map(Math.abs));
    startStatus.className = "status-line ok";
    startStatusText.textContent = `A is ${n}×${n}, ‖x₀‖∞ = ${Engine.formatNum(maxAbs, 4)}. A singular matrix will throw at solve time.`;
    return { A, x0 };
  }

  function rebuildGrid() {
    const n = parseInt(sizeInput.value, 10);
    if (!Number.isInteger(n) || n < 2 || n > 6) return;
    // Preserve as much of the existing matrix/x0 as fits the new size.
    const prevMatrix = state && state.lastMatrix ? state.lastMatrix : null;
    const prevX0 = state && state.lastX0 ? state.lastX0 : null;
    buildMatrixGrid(n, prevMatrix);
    buildX0Row(n, prevX0);
  }

  sizeInput.addEventListener("input", () => {
    rebuildGrid();
    updateStartCheck();
  });

  exampleBtn.addEventListener("click", () => {
    sizeInput.value = "2";
    buildMatrixGrid(2, DEFAULT_MATRIX);
    buildX0Row(2, DEFAULT_X0);
    tolInput.value = "0.000001";
    maxIterInput.value = "100";
    updateStartCheck();
  });

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() {
    formError.style.display = "none";
  }

  function render(iterations) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const last = iterations[iterations.length - 1];
    statLambdaMin.textContent = Engine.formatNum(last.lambdaMin, 8);
    statIters.textContent = String(iterations.length);
    statEigenvector.textContent = `[${last.xNext.map((v) => Engine.formatNum(v, 6)).join(", ")}]`;

    Engine.renderKatex(
      formulaBlock,
      "A^{-1}\\mathbf{x}_n \\text{ via solving } A\\mathbf{y}=\\mathbf{x}_n,\\quad \\lambda_{\\min} = 1/\\mu_n",
      true
    );

    iterTableBody.innerHTML = iterations
      .map(
        (it) => `<tr data-n="${it.n}">
          <td>${it.n}</td>
          <td>[${it.x.map((v) => Engine.formatNum(v, 6)).join(", ")}]</td>
          <td>[${it.y.map((v) => Engine.formatNum(v, 6)).join(", ")}]</td>
          <td>${Engine.formatNum(it.mu, 8)}</td>
          <td>${Engine.formatNum(it.lambdaMin, 8)}</td>
          <td>${Engine.formatNum(it.err, 8)}</td>
        </tr>`
      )
      .join("");

    const ns = iterations.map((it) => it.n);
    const mus = iterations.map((it) => it.mu);

    const muTrace = {
      x: ns,
      y: mus,
      mode: "lines+markers",
      type: "scatter",
      name: "μ_n",
      line: { color: "#5c939f", width: 2 },
      marker: { size: 7, color: "#5c939f", line: { color: "#090909", width: 1 } },
    };
    const currentTrace = {
      x: [ns[0]],
      y: [mus[0]],
      mode: "markers",
      type: "scatter",
      name: "current",
      marker: { size: 14, color: "#ed6d40", symbol: "circle-open", line: { width: 2, color: "#ed6d40" } },
    };

    Plotly.newPlot(
      "muPlot",
      [muTrace, currentTrace],
      Engine.plotlyBaseLayout({ xaxis: { title: "iteration n" }, yaxis: { title: "μ_n  (→ 1/λ_min)" } }),
      Engine.plotlyConfig
    );

    stepSlider.min = 0;
    stepSlider.max = iterations.length - 1;
    stepSlider.value = 0;
    state = { iterations, lastMatrix: getMatrix(), lastX0: getX0() };
    updateStep(0);
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

    Plotly.restyle(
      "muPlot",
      { x: [[it.n]], y: [[it.mu]] },
      [TRACE.current]
    );
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  function runCompute() {
    clearError();

    const checked = updateStartCheck();
    if (!checked) {
      return showError("Fix the input errors before computing.");
    }
    const { A, x0 } = checked;

    const tol = parseFloat(tolInput.value);
    const maxIter = parseInt(maxIterInput.value, 10);

    if (Number.isNaN(tol) || tol <= 0) return showError("Tolerance must be a positive number.");
    if (!Number.isInteger(maxIter) || maxIter < 1) return showError("Max iterations must be a positive integer.");

    let iterations;
    try {
      iterations = Algorithms.runInversePowerMethod(A, x0, tol, maxIter);
    } catch (err) {
      return showError(err.message);
    }
    if (!iterations.length) return showError("No iterations produced — increase max iterations.");

    render(iterations);
    Proto.saveState(STORE_KEY, snapshot());
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runCompute();
  });

  // Initial build so the page isn't blank on load.
  buildMatrixGrid(2, DEFAULT_MATRIX);
  buildX0Row(2, DEFAULT_X0);

  const saved = Proto.loadState(STORE_KEY);
  if (saved && saved.matrix !== undefined) {
    const rows = String(saved.matrix).split(";").map((r) => r.split(",").map(Number));
    const n = rows.length;
    if (n >= 2 && n <= 6 && rows.every((row) => row.length === n)) {
      sizeInput.value = String(n);
      buildMatrixGrid(n, rows);
      const x0 = saved.x0 !== undefined ? String(saved.x0).split(",").map(Number) : null;
      buildX0Row(n, x0);
      if (saved.tol !== undefined) tolInput.value = saved.tol;
      if (saved.maxIter !== undefined) maxIterInput.value = saved.maxIter;
      runCompute();
    }
  }

  updateStartCheck();
})();