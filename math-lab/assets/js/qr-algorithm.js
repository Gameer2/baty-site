(function () {
  "use strict";

  const sizeInput = document.getElementById("sizeInput");
  const matrixBody = document.getElementById("matrixBody");
  const tolInput = document.getElementById("tolInput");
  const maxIterInput = document.getElementById("maxIterInput");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("qrForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statEigenvalues = document.getElementById("statEigenvalues");
  const statIters = document.getElementById("statIters");
  const statOffNorm = document.getElementById("statOffNorm");
  const formulaBlock = document.getElementById("formulaBlock");
  const iterTableBody = document.querySelector("#iterTable tbody");
  const matrixDisplay = document.getElementById("matrixDisplay");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  let state = null; // { iterations }
  const TRACE = { current: 1 };

  const DEFAULT_MATRIX = [[2, 1], [1, 2]];

  function buildMatrixGrid(n, values) {
    matrixBody.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const tr = document.createElement("tr");
      for (let j = 0; j < n; j++) {
        const v = values && values[i] && values[i][j] !== undefined ? values[i][j] : (i === j ? 1 : 0);
        tr.innerHTML += `<td><input type="number" class="mat-cell" data-row="${i}" data-col="${j}" value="${v}" step="any" /></td>`;
      }
      matrixBody.appendChild(tr);
    }
  }

  function getMatrix() {
    const n = parseInt(sizeInput.value, 10);
    const A = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < n; j++) {
        const cell = matrixBody.querySelector(`input[data-row="${i}"][data-col="${j}"]`);
        row.push(parseFloat(cell ? cell.value : "0"));
      }
      A.push(row);
    }
    return A;
  }

  function updateStartCheck() {
    const n = parseInt(sizeInput.value, 10);
    if (!Number.isInteger(n) || n < 2 || n > 6) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Matrix size n must be an integer between 2 and 6.";
      return null;
    }
    const A = getMatrix();
    if (A.some((row) => row.some((v) => Number.isNaN(v)))) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Every matrix entry must be numeric.";
      return null;
    }
    const tol = parseFloat(tolInput.value);
    const maxIter = parseInt(maxIterInput.value, 10);
    if (Number.isNaN(tol) || tol <= 0) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Tolerance must be a positive number.";
      return null;
    }
    if (!Number.isInteger(maxIter) || maxIter < 1) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Max iterations must be a positive integer.";
      return null;
    }
    startStatus.className = "status-line ok";
    startStatusText.textContent = `Ready — ${n}×${n} matrix, tol = ${Engine.formatNum(tol, 6)}, max ${maxIter} iterations.`;
    return { A, tol, maxIter };
  }

  const debouncedUpdate = Engine.debounce(updateStartCheck, 200);

  sizeInput.addEventListener("input", () => {
    const n = Math.max(2, Math.min(6, parseInt(sizeInput.value, 10) || 2));
    buildMatrixGrid(n, getMatrix());
    debouncedUpdate();
  });
  [tolInput, maxIterInput].forEach((el) => el.addEventListener("input", debouncedUpdate));
  matrixBody.addEventListener("input", debouncedUpdate);

  exampleBtn.addEventListener("click", () => {
    sizeInput.value = "2";
    buildMatrixGrid(2, DEFAULT_MATRIX);
    tolInput.value = "0.00000001";
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

  function formatMatrix(A) {
    return A.map((row) => row.map((v) => Engine.formatNum(v, 6)).join("  ")).join("\n");
  }

  function render(iterations) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const last = iterations[iterations.length - 1];
    statEigenvalues.textContent = last.diag.map((d) => Engine.formatNum(d, 6)).join(", ");
    statIters.textContent = String(iterations.length);
    statOffNorm.textContent = Engine.formatNum(last.offNorm, 8);

    Engine.renderKatex(
      formulaBlock,
      "A_{k+1} = R_k Q_k \\quad\\text{where } A_k = Q_k R_k",
      true
    );

    iterTableBody.innerHTML = iterations
      .map(
        (it) => `<tr data-n="${it.n}">
          <td>${it.n}</td>
          <td>${it.diag.map((d) => Engine.formatNum(d, 6)).join(", ")}</td>
          <td>${Engine.formatNum(it.offNorm, 8)}</td>
        </tr>`
      )
      .join("");

    // --- off-diagonal norm vs. iteration (log y) ---
    Plotly.newPlot(
      "decayPlot",
      [
        {
          x: iterations.map((it) => it.n),
          y: iterations.map((it) => Math.max(it.offNorm, 1e-16)),
          mode: "lines+markers",
          type: "scatter",
          name: "off-diag norm",
          line: { color: "#5c939f", width: 2 },
          marker: { size: 5, color: "#5c939f" },
        },
        {
          x: [iterations[0].n],
          y: [Math.max(iterations[0].offNorm, 1e-16)],
          mode: "markers",
          type: "scatter",
          name: "current step",
          marker: { size: 13, color: "#e7e7e7", symbol: "circle-open", line: { width: 2, color: "#ed6d40" } },
        },
      ],
      Engine.plotlyBaseLayout({ xaxis: { title: "iteration k" }, yaxis: { title: "off-diagonal Frobenius norm", type: "log" } }),
      Engine.plotlyConfig
    );

    // --- step slider ---
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

    matrixDisplay.textContent = formatMatrix(it.A);

    Plotly.restyle(
      "decayPlot",
      { x: [[it.n]], y: [[Math.max(it.offNorm, 1e-16)]] },
      [TRACE.current]
    );
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();

    const checked = updateStartCheck();
    if (!checked) return showError("Fix the input errors above before computing.");

    const { A, tol, maxIter } = checked;

    let iterations;
    try {
      iterations = Algorithms.runQRAlgorithm(A, tol, maxIter);
    } catch (err) {
      return showError(err.message);
    }
    if (!iterations.length) return showError("No iterations produced — check inputs.");

    render(iterations);
  });

  // initial state
  buildMatrixGrid(2, DEFAULT_MATRIX);
  updateStartCheck();
})();