(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const tolInput = document.getElementById("tolInput");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("adaptiveForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statTotal = document.getElementById("statTotal");
  const statLeaves = document.getElementById("statLeaves");
  const statTol = document.getElementById("statTol");
  const statDepth = document.getElementById("statDepth");
  const formulaBlock = document.getElementById("formulaBlock");
  const formulaNote = document.getElementById("formulaNote");
  const leafTableBody = document.querySelector("#leafTable tbody");

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
    const tol = parseFloat(tolInput.value);
    if (Number.isNaN(tol) || tol <= 0) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Tolerance must be a positive number.";
      return null;
    }
    try {
      const fa = compiled.fn(a);
      const fb = compiled.fn(b);
      startStatus.className = "status-line ok";
      startStatusText.textContent = `f(a) = ${Engine.formatNum(fa, 4)}, f(b) = ${Engine.formatNum(fb, 4)}`;
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

  [fxInput, aInput, bInput, tolInput].forEach((el) => el.addEventListener("input", debouncedUpdate));

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "4 / (1 + x^2)";
    aInput.value = "0";
    bInput.value = "1";
    tolInput.value = "0.000001";
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

  // Map a leaf depth to a band fill color: shallow leaves stay close to the teal
  // base, deeper leaves shift toward the infrared accent so refinement hotspots
  // stand out at a glance. Returns an rgba string with alpha scaled by depth.
  function bandColor(depth, maxDepth) {
    const t = maxDepth > 0 ? depth / maxDepth : 0;
    // Lerp between teal (92,147,159) and accent (237,109,64).
    const r = Math.round(92 + (237 - 92) * t);
    const g = Math.round(147 + (109 - 147) * t);
    const b = Math.round(159 + (64 - 159) * t);
    const alpha = 0.18 + 0.42 * t;
    return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  }

  function render(result, compiled, a, b) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const leaves = result.leaves;
    const total = result.total;
    const maxDepth = leaves.reduce((m, l) => Math.max(m, l.depth), 0);

    statTotal.textContent = Engine.formatNum(total, 8);
    statLeaves.textContent = String(leaves.length);
    statTol.textContent = Engine.formatNum(parseFloat(tolInput.value), 8);
    statDepth.textContent = String(maxDepth);

    Engine.renderKatex(
      formulaBlock,
      "\\int_{p}^{q} f(x)\\,dx \\approx \\frac{q-p}{6}\\left[f(p) + 4f\\!\\left(\\tfrac{p+q}{2}\\right) + f(q)\\right]",
      true
    );
    formulaNote.style.display = "block";
    formulaNote.textContent = "Accept a split when |S_left + S_right − S_whole| < 15·tol; otherwise recurse on each half with tol/2. Deeper-shaded bands below mark where the algorithm refined further.";

    leafTableBody.innerHTML = leaves
      .map((leaf, i) => `<tr data-n="${i}">
          <td>${i + 1}</td>
          <td>${Engine.formatNum(leaf.a, 5)} → ${Engine.formatNum(leaf.b, 5)}</td>
          <td>${leaf.depth}</td>
          <td>${Engine.formatNum(leaf.estimate, 8)}</td>
        </tr>`)
      .join("");

    // --- f(x) curve + depth-shaded leaf bands along the x-axis ---
    const pad = Math.max(1e-6, (b - a) * 0.12);
    const xmin = a - pad, xmax = b + pad;
    const xs = [], ys = [];
    for (let i = 0; i <= 240; i++) {
      const x = xmin + ((xmax - xmin) * i) / 240;
      let y;
      try { y = compiled.fn(x); } catch { y = null; }
      xs.push(x); ys.push(Number.isFinite(y) ? y : null);
    }

    const traces = [];
    // Thin axis-aligned bands: each leaf is a rectangle strip from y=0 up to a
    // small fixed visual height scaled by depth (deeper = taller + more saturated),
    // so refinement hotspots visibly rise above the baseline. We render each band
    // as a toself polygon traced along its top edge and back along y=0.
    const bandHeightUnit = Math.max(1e-6, (b - a) * 0.04);
    leaves.forEach((leaf) => {
      const h = bandHeightUnit * (1 + leaf.depth);
      traces.push({
        x: [leaf.a, leaf.b, leaf.b, leaf.a, leaf.a],
        y: [0, 0, h, h, 0],
        mode: "lines",
        type: "scatter",
        fill: "toself",
        fillcolor: bandColor(leaf.depth, maxDepth),
        line: { color: "rgba(125,133,140,0.25)", width: 0.5 },
        hoverinfo: "skip",
        showlegend: false,
      });
    });

    const curveTrace = { x: xs, y: ys, mode: "lines", type: "scatter", name: "f(x)", line: { color: "#5c939f", width: 2 } };
    const zeroTrace = { x: [xmin, xmax], y: [0, 0], mode: "lines", type: "scatter", name: "y = 0", line: { color: "#7d858c", width: 1, dash: "dash" }, hoverinfo: "skip" };

    Plotly.newPlot(
      "fxPlot",
      [...traces, curveTrace, zeroTrace],
      Engine.plotlyBaseLayout({ xaxis: { title: "x" }, yaxis: { title: "f(x)" } }),
      Engine.plotlyConfig
    );
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();

    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) return showError(`Invalid function: ${compiled.error}`);

    const a = parseFloat(aInput.value);
    const b = parseFloat(bInput.value);
    const tol = parseFloat(tolInput.value);

    if (Number.isNaN(a) || Number.isNaN(b)) return showError("a and b must be numbers.");
    if (a === b) return showError("a and b must be different.");
    if (Number.isNaN(tol) || tol <= 0) return showError("Tolerance must be a positive number.");

    let result;
    try {
      result = Algorithms.runAdaptiveQuadrature(compiled.fn, a, b, tol);
    } catch (err) {
      return showError(err.message);
    }

    render(result, compiled, a, b);
  });

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));

  updatePreview();
  updateStartCheck();
})();