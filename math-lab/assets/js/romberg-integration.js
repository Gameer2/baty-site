(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const mInput = document.getElementById("mInput");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("rombergForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statTotal = document.getElementById("statTotal");
  const statM = document.getElementById("statM");
  const statBase = document.getElementById("statBase");
  const statErr = document.getElementById("statErr");
  const formulaBlock = document.getElementById("formulaBlock");
  const rombergTableBody = document.querySelector("#rombergTable tbody");

  const STORE_KEY = "engine-lab:numerical-romberg-integration";

  function snapshot() {
    return { fx: fxInput.value, a: aInput.value, b: bInput.value, m: mInput.value };
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
    const m = parseInt(mInput.value, 10);
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
    if (!Number.isInteger(m) || m < 1 || m > 10) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "m must be an integer between 1 and 10.";
      return null;
    }
    try {
      const fa = compiled.fn(a);
      const fb = compiled.fn(b);
      startStatus.className = "status-line ok";
      const orient = a < b
        ? `f(a) = ${Engine.formatNum(fa, 4)}, f(b) = ${Engine.formatNum(fb, 4)}`
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

  [fxInput, aInput, bInput, mInput].forEach((el) => el.addEventListener("input", debouncedUpdate));

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "e^x";
    aInput.value = "0";
    bInput.value = "1";
    mInput.value = "4";
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

  function render(result, compiled, a, b, m) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const R = result.R;
    const total = result.total;

    // Practical convergence indicator: |R[m][m] - R[m-1][m-1]| (last diagonal step).
    let estErr = null;
    if (m >= 2) estErr = Math.abs(R[m][m] - R[m - 1][m - 1]);

    statTotal.textContent = Engine.formatNum(total, 10);
    statM.textContent = String(m);
    statBase.textContent = "1";
    statErr.textContent = estErr == null ? "—" : Engine.formatNum(estErr, 8);

    Engine.renderKatex(
      formulaBlock,
      "R(i,0) = T_{2^i}, \\quad R(i,j) = R(i,j-1) + \\dfrac{R(i,j-1) - R(i-1,j-1)}{4^{j} - 1}",
      true
    );

    // --- Triangular Romberg table (row i shows columns 0..i, blank for j > i) ---
    // Pre-built 11 column slots (i/j up to 10). Final R[m][m] cell gets the accent class.
    rombergTableBody.innerHTML = "";
    for (let i = 0; i <= m; i++) {
      const tr = document.createElement("tr");
      tr.dataset.n = String(i);
      let rowHtml = `<td>${i}</td><td>${Math.pow(2, i)}</td>`;
      for (let j = 0; j <= 10; j++) {
        if (j > i) {
          rowHtml += `<td>—</td>`;
        } else if (i === m && j === m) {
          rowHtml += `<td class="is-current">${Engine.formatNum(R[i][j], 10)}</td>`;
        } else {
          rowHtml += `<td>${Engine.formatNum(R[i][j], 10)}</td>`;
        }
      }
      tr.innerHTML = rowHtml;
      rombergTableBody.appendChild(tr);
    }

    // --- Convergence plot: R(i,i) vs. i (the diagonal — the headline visual) ---
    const diagI = [], diagR = [];
    for (let i = 0; i <= m; i++) {
      diagI.push(i);
      diagR.push(R[i][i]);
    }
    Plotly.newPlot(
      "convPlot",
      [{
        x: diagI,
        y: diagR,
        mode: "lines+markers",
        type: "scatter",
        name: "R(i,i)",
        line: { color: "#ed6d40", width: 2 },
        marker: { size: 7, color: "#ed6d40", line: { color: "#090909", width: 1 } },
      }],
      Engine.plotlyBaseLayout({
        xaxis: { title: "i (extrapolation level)", dtick: 1 },
        yaxis: { title: "R(i,i)" },
      }),
      Engine.plotlyConfig
    );
  }

  function runCompute() {
    clearError();

    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) return showError(`Invalid function: ${compiled.error}`);

    const a = parseFloat(aInput.value);
    const b = parseFloat(bInput.value);
    const m = parseInt(mInput.value, 10);

    if (Number.isNaN(a) || Number.isNaN(b)) return showError("a and b must be numbers.");
    if (a === b) return showError("a and b must be different.");
    if (!Number.isInteger(m) || m < 1 || m > 10) return showError("m must be an integer between 1 and 10.");

    let result;
    try {
      result = Algorithms.runRomberg(compiled.fn, a, b, m);
    } catch (err) {
      return showError(err.message);
    }

    render(result, compiled, a, b, m);
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
    if (saved.m !== undefined) mInput.value = saved.m;
  }

  updatePreview();
  updateStartCheck();
  if (saved) runCompute();
})();