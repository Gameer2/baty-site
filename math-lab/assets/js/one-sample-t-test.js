(function () {
  "use strict";

  const dataInput = document.getElementById("dataInput");
  const mu0Input = document.getElementById("mu0Input");
  const alphaInput = document.getElementById("alphaInput");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const verdictLine = document.getElementById("verdictLine");
  const verdictText = document.getElementById("verdictText");
  const form = document.getElementById("ttestForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statN = document.getElementById("statN");
  const statMean = document.getElementById("statMean");
  const statSd = document.getElementById("statSd");
  const statT = document.getElementById("statT");
  const formulaT = document.getElementById("formulaT");
  const formulaP = document.getElementById("formulaP");

  const STORE_KEY = "engine-lab:statistics:ttest";
  let shownOnce = false;

  // Parse a pasted textarea of numbers into a number[] — DOM-input handling lives here,
  // not in stats-algorithms.js (per the shared conventions).
  function parseData(raw) {
    return raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
  }

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() { formError.style.display = "none"; }

  function render() {
    const data = parseData(dataInput.value);
    const mu0 = parseFloat(mu0Input.value);
    const alpha = parseFloat(alphaInput.value);

    if (data.length < 2) {
      showError("Enter at least two numeric values.");
      verdictLine.className = "status-line";
      verdictText.textContent = "Enter at least two values, then compute.";
      return;
    }
    if (Number.isNaN(mu0)) { showError("H₀: μ must be a number."); return; }
    if (Number.isNaN(alpha) || alpha <= 0 || alpha >= 1) { showError("Significance α must be between 0 and 1."); return; }
    clearError();

    let result;
    try { result = StatsAlgorithms.runOneSampleTTest(data, mu0); }
    catch (err) { return showError(err.message); }

    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";
    shownOnce = true;

    statN.textContent = String(result.n);
    statMean.textContent = Engine.formatNum(result.mean, 3);
    statSd.textContent = Engine.formatNum(result.sd, 3);
    statT.textContent = Engine.formatNum(result.t, 3);

    Engine.renderKatex(formulaT,
      `t = \\dfrac{\\bar{x} - \\mu_0}{s / \\sqrt{n}} = \\dfrac{${Engine.formatNum(result.mean, 2)} - ${Engine.formatNum(mu0, 2)}}{${Engine.formatNum(result.sd, 2)} / \\sqrt{${result.n}}} \\approx ${Engine.formatNum(result.t, 3)}`, true);
    Engine.renderKatex(formulaP,
      `p \\approx ${Engine.formatNum(result.p, 4)}\\ \\ (\\text{df} = ${result.df})`, true);

    const reject = result.p < alpha;
    verdictLine.classList.toggle("bad", reject);
    verdictLine.classList.toggle("ok", !reject);
    verdictText.textContent = reject
      ? `Reject H₀ — the sample mean differs significantly from ${Engine.formatNum(mu0, 2)} (p < α).`
      : `Fail to reject H₀ — not enough evidence the mean differs from ${Engine.formatNum(mu0, 2)} (p ≥ α).`;

    Plotly.react("histPlot", [{
      x: data, type: "histogram", marker: { color: "rgba(201,154,60,0.5)", line: { color: "#c99a3c", width: 1 } }, name: "sample"
    }], Engine.plotlyBaseLayout({
      showlegend: false,
      shapes: [
        { type: "line", x0: result.mean, x1: result.mean, y0: 0, y1: 1, yref: "paper", line: { color: "#c99a3c", width: 2 } },
        { type: "line", x0: mu0, x1: mu0, y0: 0, y1: 1, yref: "paper", line: { color: "#ed6d40", width: 2, dash: "dash" } }
      ],
      annotations: [
        { x: result.mean, y: 1, yref: "paper", text: "x̄", showarrow: false, yshift: 12, font: { color: "#c99a3c" } },
        { x: mu0, y: 1, yref: "paper", text: "μ₀", showarrow: false, yshift: 12, font: { color: "#ed6d40" } }
      ]
    }), Engine.plotlyConfig);

    Proto.saveState(STORE_KEY, snapshot());
  }

  function snapshot() {
    return { data: dataInput.value, mu0: mu0Input.value, alpha: alphaInput.value };
  }

  // After the first explicit Compute, keep the result live as the user edits (debounced),
  // preserving the original prototype's live feel on top of the submit-driven skeleton.
  const debouncedRender = Engine.debounce(() => { if (shownOnce) render(); }, 200);
  [dataInput, mu0Input, alphaInput].forEach((el) => el.addEventListener("input", debouncedRender));

  exampleBtn.addEventListener("click", () => {
    dataInput.value = "78, 85, 92, 67, 74, 88, 95, 81, 73, 90, 84, 79";
    mu0Input.value = "75";
    alphaInput.value = "0.05";
    render();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    render();
  });

  const saved = Proto.loadState(STORE_KEY);
  if (saved) {
    if (saved.data !== undefined) dataInput.value = saved.data;
    if (saved.mu0 !== undefined) mu0Input.value = saved.mu0;
    if (saved.alpha !== undefined) alphaInput.value = saved.alpha;
  }
})();