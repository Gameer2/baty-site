/* Systems of ODEs page wiring. Parses the matrix/forcing/IC inputs, calls ODESystems.solve,
   renders the result through the existing ODERender.bigBox, and — at n=2 only — draws the
   phase portrait: a vector-field arrow grid (the exact Plotly `shapes`-line-segment technique
   already used in ode-direction-fields.js, fed (dx/dt, dy/dt) instead of a scalar slope) plus a
   handful of ODESystems.rk4System trajectories from points around the equilibrium. */
(function () {
  "use strict";

  const matrixInput = document.getElementById("matrixInput");
  const gInput = document.getElementById("gInput");
  const icToggle = document.getElementById("icToggle");
  const icFields = document.getElementById("icFields");
  const form = document.getElementById("systemsForm");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const portraitWrap = document.getElementById("portraitWrap");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function setStatus(ok, msg) {
    startStatus.className = "status-line " + (ok ? "ok" : "bad");
    startStatusText.textContent = msg;
  }

  function parseMatrix(raw) {
    const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    return lines.map((line) =>
      line.split(",").map((s) => s.trim()).filter(Boolean).map(Number));
  }

  function parseGRow(raw) {
    return raw.split(",").map((s) => s.trim() || "0");
  }

  function rebuildIcFields(n) {
    icFields.innerHTML = "";
    if (n <= 0) return;
    const row = document.createElement("div");
    row.className = "field-row";
    row.style.flexWrap = "wrap";
    for (let i = 0; i < n; i++) {
      const f = document.createElement("div");
      f.className = "field";
      f.innerHTML = `<label>x${i + 1}(0)</label><input type="number" class="ic-input" data-role="ic${i}" value="${i === 0 ? 1 : 0}" step="any" />`;
      row.appendChild(f);
    }
    icFields.appendChild(row);
  }

  function readIc(n) {
    if (!icToggle.checked) return null;
    const values = [];
    for (let i = 0; i < n; i++) {
      const el = icFields.querySelector(`[data-role="ic${i}"]`);
      const v = el ? parseFloat(el.value) : NaN;
      if (Number.isNaN(v)) return { invalid: true };
      values.push(v);
    }
    return values;
  }

  icToggle.addEventListener("change", () => {
    icFields.style.display = icToggle.checked ? "" : "none";
  });

  document.querySelectorAll("#exampleChips .tag").forEach((btn) => {
    btn.addEventListener("click", () => {
      matrixInput.value = btn.dataset.a;
      gInput.value = btn.dataset.g;
    });
  });

  function drawPhasePortrait(matrixRows, gExprList) {
    let gFn = null;
    if (gExprList.some((g) => g !== "0")) {
      const compiled = gExprList.map((g) => ODESolver.compileRealFx(g));
      if (compiled.every((c) => c.ok)) {
        gFn = (t) => compiled.map((c) => c.fn({ t }));
      }
    }

    const RANGE = 3;
    const GRID = 14;
    const shapes = [];
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        const gx = -RANGE + (i / GRID) * 2 * RANGE;
        const gy = -RANGE + (j / GRID) * 2 * RANGE;
        const dx = matrixRows[0][0] * gx + matrixRows[0][1] * gy;
        const dy = matrixRows[1][0] * gx + matrixRows[1][1] * gy;
        const norm = Math.sqrt(dx * dx + dy * dy) || 1;
        const len = (2 * RANGE / GRID) * 0.6;
        const ux = (dx / norm) * len, uy = (dy / norm) * len;
        shapes.push({ type: "line", x0: gx - ux / 2, y0: gy - uy / 2, x1: gx + ux / 2, y1: gy + uy / 2, line: { color: "rgba(255,255,255,0.16)", width: 1.5 } });
      }
    }

    const starts = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [1, 1], [-1, -1]];
    const traces = starts.map((x0, idx) => {
      const path = ODESystems.rk4System(matrixRows, gFn, x0, 0.02, 250);
      return { x: path.map((p) => p.x[0]), y: path.map((p) => p.x[1]), mode: "lines", name: `trajectory ${idx + 1}`, showlegend: false, line: { color: "#59a993", width: 2 } };
    });

    portraitWrap.style.display = "";
    Plotly.react("portraitPlot", traces, Engine.plotlyBaseLayout({
      shapes,
      xaxis: { title: "x₁", range: [-RANGE, RANGE] },
      yaxis: { title: "x₂", range: [-RANGE, RANGE] },
    }), Engine.plotlyConfig);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    portraitWrap.style.display = "none";

    let matrixRows;
    try {
      matrixRows = parseMatrix(matrixInput.value);
    } catch (err) {
      setStatus(false, "Couldn't parse the matrix.");
      return;
    }
    const n = matrixRows.length;
    if (n === 0 || !matrixRows.every((row) => row.length === n && row.every(Number.isFinite))) {
      setStatus(false, "The matrix must be square, with numeric entries in every row.");
      return;
    }
    const gList = parseGRow(gInput.value);
    if (gList.length !== n) {
      setStatus(false, `The forcing row needs exactly ${n} entries (one per state variable).`);
      return;
    }

    rebuildIcFields(n);
    const ic = readIc(n);
    if (ic && ic.invalid) { setStatus(false, "The initial condition needs numeric values in every field."); return; }

    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    if (submitBtn) submitBtn.textContent = "Solving…";

    ODESystems.solve(matrixRows, gList, ic).then((out) => {
      placeholderPanel.style.display = "none";
      resultsArea.style.display = "";
      if (!out.ok) {
        resultsArea.innerHTML = "";
        showError(out.reason);
        setStatus(false, out.reason);
        return;
      }
      const varNames = out.components.map((_, i) => `x_{${i + 1}}(t)`);
      const lines = "\\begin{gathered}" +
        out.components.map((c, i) => `${varNames[i]} = ${ODESymbolic.toLatex(c)}`).join("\\\\") +
        "\\end{gathered}";
      const classLine = out.classification
        ? `Equilibrium: ${out.classification.type} (${out.classification.stability}) — solved by SymPy, verified.`
        : `Stability: ${out.stability} — solved by SymPy, verified.`;
      ODERender.bigBox(resultsArea, {
        classificationLine: classLine,
        generalSolution: lines,
        particularSolution: null,
      });
      setStatus(true, "Solved.");
      if (n === 2) drawPhasePortrait(matrixRows, gList);
    }).catch((err) => {
      showError(err.message || String(err));
      setStatus(false, err.message || String(err));
    }).then(() => {
      if (submitBtn) submitBtn.textContent = "Solve";
    });
  });
})();
