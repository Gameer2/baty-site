(function () {
  "use strict";

  const sizeInput = document.getElementById("sizeInput");
  const matrixTable = document.getElementById("matrixTable");
  const x0Row = document.getElementById("x0Row");
  const tolInput = document.getElementById("tolInput");
  const maxIterInput = document.getElementById("maxIterInput");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("powerForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statMu = document.getElementById("statMu");
  const statIters = document.getElementById("statIters");
  const statVec = document.getElementById("statVec");
  const formulaBlock = document.getElementById("formulaBlock");
  const iterTableBody = document.querySelector("#iterTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  let state = null; // { iterations }
  const TRACE = { current: 1 };

  function buildMatrixGrid(n) {
    let html = "";
    for (let i = 0; i < n; i++) {
      html += "<tr>";
      for (let j = 0; j < n; j++) {
        html += `<td><input type="number" class="mat-cell" data-row="${i}" data-col="${j}" value="0" step="any" /></td>`;
      }
      html += "</tr>";
    }
    matrixTable.innerHTML = html;
  }

  function buildX0Inputs(n) {
    let html = "";
    for (let i = 0; i < n; i++) {
      html += `<div class="field"><label for="x0-${i}">x₀[${i}]</label><input type="number" id="x0-${i}" class="x0-cell" data-idx="${i}" value="0" step="any" /></div>`;
    }
    x0Row.innerHTML = html;
  }

  function setSize(n) {
    buildMatrixGrid(n);
    buildX0Inputs(n);
  }

  // UI-only glue: reads the grid into a 2D array. Math lives in algorithms.js.
  function getMatrix() {
    const n = parseInt(sizeInput.value, 10);
    const A = [];
    for (let i = 0; i < n; i++) A.push(new Array(n).fill(0));
    matrixTable.querySelectorAll(".mat-cell").forEach((cell) => {
      const i = Number(cell.dataset.row), j = Number(cell.dataset.col);
      A[i][j] = parseFloat(cell.value);
    });
    return A;
  }

  function getX0() {
    return Array.from(x0Row.querySelectorAll(".x0-cell")).map((inp) => parseFloat(inp.value));
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
    if (A.some((row) => row.some((v) => Number.isNaN(v)))) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Every matrix entry must be numeric.";
      return null;
    }
    if (x0.some((v) => Number.isNaN(v))) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Every starting-vector component must be numeric.";
      return null;
    }
    const maxAbs = Math.max(...x0.map(Math.abs));
    if (maxAbs < 1e-14) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Starting vector cannot be all zero.";
      return null;
    }
    startStatus.className = "status-line ok";
    startStatusText.textContent = `n = ${n}, ‖x₀‖∞ = ${Engine.formatNum(maxAbs, 4)} — ready.`;
    return { A, x0 };
  }

  const debouncedUpdate = Engine.debounce(() => {
    updateStartCheck();
  }, 200);

  sizeInput.addEventListener("input", () => {
    const n = parseInt(sizeInput.value, 10);
    if (Number.isInteger(n) && n >= 2 && n <= 6) setSize(n);
    debouncedUpdate();
  });
  matrixTable.addEventListener("input", debouncedUpdate);
  x0Row.addEventListener("input", debouncedUpdate);

  exampleBtn.addEventListener("click", () => {
    sizeInput.value = "2";
    setSize(2);
    // Default example: A = [[2,1],[1,2]], x0 = [1,0].
    matrixTable.querySelectorAll(".mat-cell").forEach((cell) => {
      const i = Number(cell.dataset.row), j = Number(cell.dataset.col);
      cell.value = i === j ? "2" : "1";
    });
    const x0Inputs = x0Row.querySelectorAll(".x0-cell");
    x0Inputs[0].value = "1";
    x0Inputs[1].value = "0";
    tolInput.value = "0.0000000001";
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

  function formatVec(v) {
    return "(" + v.map((c) => Engine.formatNum(c, 6)).join(", ") + ")";
  }

  function render(iterations) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const last = iterations[iterations.length - 1];
    statMu.textContent = Engine.formatNum(last.mu, 8);
    statIters.textContent = String(iterations.length);
    statVec.textContent = formatVec(last.xNext);

    Engine.renderKatex(
      formulaBlock,
      "A\\,\\mathbf{x}_{n} = \\mu_n\\,\\mathbf{x}_{n+1}",
      true
    );

    iterTableBody.innerHTML = iterations
      .map(
        (it) => `<tr data-n="${it.n}">
          <td>${it.n}</td>
          <td>${formatVec(it.x)}</td>
          <td>${formatVec(it.y)}</td>
          <td>${Engine.formatNum(it.mu, 8)}</td>
          <td>${formatVec(it.xNext)}</td>
          <td>${Engine.formatNum(it.err, 8)}</td>
        </tr>`
      )
      .join("");

    const finalMu = last.mu;
    const nMax = last.n;
    Plotly.newPlot(
      "muPlot",
      [
        {
          x: iterations.map((it) => it.n),
          y: iterations.map((it) => it.mu),
          mode: "lines+markers",
          type: "scatter",
          name: "μₙ",
          line: { color: "#ed6d40", width: 2 },
          marker: { size: 6, color: "#ed6d40" },
        },
        {
          x: [iterations[0].n],
          y: [iterations[0].mu],
          mode: "markers",
          type: "scatter",
          name: "current",
          marker: { size: 13, color: "#e7e7e7", symbol: "circle-open", line: { width: 2, color: "#ed6d40" } },
        },
      ],
      Engine.plotlyBaseLayout({
        xaxis: { title: "iteration n" },
        yaxis: { title: "eigenvalue estimate μₙ" },
        shapes: [
          { type: "line", x0: 0, x1: nMax, y0: finalMu, y1: finalMu, line: { color: "#7d858c", width: 1, dash: "dash" } },
        ],
      }),
      Engine.plotlyConfig
    );

    stepSlider.min = 0;
    stepSlider.max = iterations.length - 1;
    stepSlider.value = 0;
    state = { iterations };
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

    Plotly.restyle("muPlot", { x: [[it.n]], y: [[it.mu]] }, [TRACE.current]);
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();

    const checked = updateStartCheck();
    if (!checked) return;

    const tol = parseFloat(tolInput.value);
    const maxIter = parseInt(maxIterInput.value, 10);

    if (Number.isNaN(tol) || tol <= 0) return showError("Tolerance must be a positive number.");
    if (!Number.isInteger(maxIter) || maxIter < 1) return showError("Max iterations must be a positive integer.");

    let iterations;
    try {
      iterations = Algorithms.runPowerMethod(checked.A, checked.x0, tol, maxIter);
    } catch (err) {
      return showError(err.message);
    }
    if (!iterations.length) return showError("No iterations produced.");
    render(iterations);
  });

  // initial grid + validity check so the page isn't blank on load
  setSize(parseInt(sizeInput.value, 10) || 2);
  updateStartCheck();
})();