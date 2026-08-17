(function () {
  "use strict";

  const tbody = document.getElementById("pointsTableBody");
  const addPointBtn = document.getElementById("addPointBtn");
  const queryInput = document.getElementById("queryInput");
  const form = document.getElementById("lagrangeForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const rungeBtn = document.getElementById("rungeBtn");
  const modeRow = document.getElementById("modeRow");
  const compareToggle = document.getElementById("compareToggle");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statValueLabel = document.getElementById("statValueLabel");
  const statValue = document.getElementById("statValue");
  const statDegreeLabel = document.getElementById("statDegreeLabel");
  const statDegree = document.getElementById("statDegree");
  const statPoints = document.getElementById("statPoints");
  const rungeNote = document.getElementById("rungeNote");
  const formulaBasisLabel = document.getElementById("formulaBasisLabel");
  const formulaBasis = document.getElementById("formulaBasis");
  const formulaExpandedLabel = document.getElementById("formulaExpandedLabel");
  const formulaExpanded = document.getElementById("formulaExpanded");
  const basisTableHead = document.getElementById("basisTableHead");
  const basisTableBody = document.querySelector("#basisTable tbody");
  const basisTableFoot = document.querySelector("#basisTable tfoot");

  const DEFAULT_POINTS = [
    [0, 1],
    [1, 3],
    [2, 2],
    [4, 5],
  ];

  const RUNGE_FN = (x) => 1 / (1 + 25 * x * x);
  const RUNGE_POINTS = Array.from({ length: 11 }, (_, i) => {
    const x = -1 + (i * 2) / 10;
    return [Number(x.toFixed(4)), Number(RUNGE_FN(x).toFixed(6))];
  });

  let mode = "lagrange"; // "lagrange" | "spline"
  let rungeActive = false;
  const STORE_KEY = "engine-lab:numerical-lagrange-interpolation";

  function snapshot() {
    return {
      points: getPoints().map((p) => `${p.x},${p.y}`).join(";"),
      x0: queryInput.value,
    };
  }

  function updateRemoveButtonsState() {
    const rows = tbody.querySelectorAll("tr");
    const locked = rows.length <= 2;
    rows.forEach((row) => {
      const btn = row.querySelector(".row-remove");
      btn.disabled = locked;
    });
  }

  function addRow(x = "", y = "") {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="number" class="pt-x" value="${x}" step="any" /></td>
      <td><input type="number" class="pt-y" value="${y}" step="any" /></td>
      <td><button type="button" class="row-remove" title="Remove point">×</button></td>
    `;
    tr.querySelector(".row-remove").addEventListener("click", () => {
      if (tbody.querySelectorAll("tr").length <= 2) return;
      tr.remove();
      rungeActive = false;
      updateRemoveButtonsState();
    });
    tbody.appendChild(tr);
    updateRemoveButtonsState();
  }

  function resetPoints(pairs) {
    tbody.innerHTML = "";
    pairs.forEach(([x, y]) => addRow(x, y));
  }

  function setMode(next) {
    mode = next;
    modeRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c.dataset.mode === mode));
  }

  modeRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    setMode(btn.dataset.mode);
    if (resultsArea.style.display !== "none") form.requestSubmit();
  });

  compareToggle.addEventListener("change", () => {
    if (resultsArea.style.display !== "none") form.requestSubmit();
  });

  addPointBtn.addEventListener("click", () => {
    rungeActive = false;
    addRow();
  });

  exampleBtn.addEventListener("click", () => {
    rungeActive = false;
    resetPoints(DEFAULT_POINTS);
    queryInput.value = "2.5";
  });

  rungeBtn.addEventListener("click", () => {
    rungeActive = true;
    resetPoints(RUNGE_POINTS);
    queryInput.value = "0.9";
    setMode("lagrange");
    compareToggle.checked = true;
    form.requestSubmit();
  });

  resetPoints(DEFAULT_POINTS);

  function getPoints() {
    const rows = Array.from(tbody.querySelectorAll("tr"));
    return rows
      .map((row) => ({
        x: parseFloat(row.querySelector(".pt-x").value),
        y: parseFloat(row.querySelector(".pt-y").value),
      }))
      .sort((a, b) => a.x - b.x);
  }

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() {
    formError.style.display = "none";
  }

  function formatCoef(c) {
    const r = Number(c.toPrecision(5));
    return Engine.formatNum(r, 5);
  }

  function polyToLatex(coeffsAsc) {
    const terms = [];
    for (let k = coeffsAsc.length - 1; k >= 0; k--) {
      const c = coeffsAsc[k];
      if (c === 0) continue;
      const sign = c < 0 ? "-" : "+";
      const abs = Math.abs(c);
      let magnitude;
      if (k === 0) magnitude = formatCoef(abs);
      else if (Math.abs(abs - 1) < 1e-9) magnitude = "";
      else magnitude = formatCoef(abs);
      let varPart = k === 0 ? "" : k === 1 ? "x" : `x^{${k}}`;
      terms.push({ sign, text: `${magnitude}${varPart}` });
    }
    if (!terms.length) return "0";
    let latex = (terms[0].sign === "-" ? "-" : "") + terms[0].text;
    for (let i = 1; i < terms.length; i++) latex += ` ${terms[i].sign} ${terms[i].text}`;
    return latex;
  }

  function basisValueAt(points, i, x0) {
    let L = 1;
    for (let j = 0; j < points.length; j++) {
      if (j === i) continue;
      L *= (x0 - points[j].x) / (points[i].x - points[j].x);
    }
    return L;
  }

  function segmentContaining(segments, x0) {
    if (x0 >= segments[segments.length - 1].x1) return segments.length - 1;
    for (let i = 0; i < segments.length; i++) {
      if (x0 >= segments[i].x0 && x0 <= segments[i].x1) return i;
    }
    return 0;
  }

  function segmentToLatex(seg) {
    const dxLabel = "(x - " + formatCoef(seg.x0) + ")";
    const parts = [formatCoef(seg.a)];
    if (seg.b !== 0) parts.push(`${seg.b < 0 ? "-" : "+"} ${formatCoef(Math.abs(seg.b))}${dxLabel}`);
    if (seg.c !== 0) parts.push(`${seg.c < 0 ? "-" : "+"} ${formatCoef(Math.abs(seg.c))}${dxLabel}^2`);
    if (seg.d !== 0) parts.push(`${seg.d < 0 ? "-" : "+"} ${formatCoef(Math.abs(seg.d))}${dxLabel}^3`);
    return parts.join(" ");
  }

  function render(points, x0) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const n = points.length;
    const coeffs = Algorithms.runLagrangeInterpolation(points);
    const segments = Algorithms.runCubicSpline(points);
    const compare = compareToggle.checked;

    const lagrangeAt = (x) => Algorithms.evalPolyAscending(coeffs, x);
    const splineAt = (x) => Algorithms.evalCubicSpline(segments, x);
    const primaryAt = mode === "lagrange" ? lagrangeAt : splineAt;
    const Px0 = primaryAt(x0);

    statValueLabel.textContent = mode === "lagrange" ? "P(x₀) ≈" : "S(x₀) ≈";
    statValue.textContent = Engine.formatNum(Px0, 6);
    statDegreeLabel.textContent = mode === "lagrange" ? "Degree" : "Segments";
    statDegree.textContent = String(n - 1);
    statPoints.textContent = String(n);

    rungeNote.style.display = rungeActive ? "block" : "none";

    if (mode === "lagrange") {
      formulaBasisLabel.textContent = "General form";
      formulaExpandedLabel.textContent = "Computed polynomial";
      Engine.renderKatex(
        formulaBasis,
        "P(x) = \\sum_{i=0}^{n-1} y_i L_i(x), \\qquad L_i(x) = \\prod_{j \\neq i} \\dfrac{x - x_j}{x_i - x_j}",
        true
      );
      Engine.renderKatex(formulaExpanded, `P(x) = ${polyToLatex(coeffs)}`, true);
    } else {
      const segIdx = segmentContaining(segments, x0);
      const seg = segments[segIdx];
      formulaBasisLabel.textContent = "General form (per segment)";
      formulaExpandedLabel.textContent = `Segment containing x₀ (i = ${segIdx}, x ∈ [${formatCoef(seg.x0)}, ${formatCoef(seg.x1)}])`;
      Engine.renderKatex(
        formulaBasis,
        "S_i(x) = a_i + b_i(x-x_i) + c_i(x-x_i)^2 + d_i(x-x_i)^3, \\qquad x \\in [x_i, x_{i+1}]",
        true
      );
      Engine.renderKatex(formulaExpanded, `S(x) = ${segmentToLatex(seg)}`, true);
    }

    if (mode === "lagrange") {
      const Lvals = points.map((_, i) => basisValueAt(points, i, x0));
      const weighted = points.map((p, i) => p.y * Lvals[i]);
      basisTableHead.innerHTML = "<tr><th>i</th><th>xᵢ</th><th>yᵢ</th><th>Lᵢ(x₀)</th><th>yᵢ·Lᵢ(x₀)</th></tr>";
      basisTableBody.innerHTML = points
        .map(
          (p, i) => `<tr>
            <td>${i}</td>
            <td>${Engine.formatNum(p.x, 4)}</td>
            <td>${Engine.formatNum(p.y, 4)}</td>
            <td>${Engine.formatNum(Lvals[i], 6)}</td>
            <td>${Engine.formatNum(weighted[i], 6)}</td>
          </tr>`
        )
        .join("");
      basisTableFoot.innerHTML = `<tr class="is-current">
          <td colspan="4" style="text-align:right;">Σ yᵢ·Lᵢ(x₀) =</td>
          <td>${Engine.formatNum(Px0, 6)}</td>
        </tr>`;
    } else {
      const currentIdx = segmentContaining(segments, x0);
      basisTableHead.innerHTML = "<tr><th>i</th><th>Interval</th><th>a</th><th>b</th><th>c</th><th>d</th></tr>";
      basisTableBody.innerHTML = segments
        .map(
          (seg, i) => `<tr${i === currentIdx ? ' class="is-current"' : ""}>
            <td>${i}</td>
            <td>[${Engine.formatNum(seg.x0, 4)}, ${Engine.formatNum(seg.x1, 4)}]</td>
            <td>${Engine.formatNum(seg.a, 5)}</td>
            <td>${Engine.formatNum(seg.b, 5)}</td>
            <td>${Engine.formatNum(seg.c, 5)}</td>
            <td>${Engine.formatNum(seg.d, 5)}</td>
          </tr>`
        )
        .join("");
      basisTableFoot.innerHTML = `<tr class="is-current">
          <td colspan="5" style="text-align:right;">S(x₀) =</td>
          <td>${Engine.formatNum(Px0, 6)}</td>
        </tr>`;
    }

    const xs = points.map((p) => p.x);
    const minX = Math.min(...xs, x0), maxX = Math.max(...xs, x0);
    const pad = Math.max(0.5, (maxX - minX) * 0.2);
    const curveX = [];
    const lagrangeY = [], splineY = [], rungeY = [];
    for (let i = 0; i <= 240; i++) {
      const x = minX - pad + ((maxX - minX + 2 * pad) * i) / 240;
      curveX.push(x);
      if (mode === "lagrange" || compare) lagrangeY.push(lagrangeAt(x));
      if (mode === "spline" || compare) splineY.push(splineAt(x));
      if (rungeActive) rungeY.push(RUNGE_FN(x));
    }

    const dataTrace = {
      x: points.map((p) => p.x), y: points.map((p) => p.y),
      mode: "markers", type: "scatter", name: "data points",
      marker: { size: 10, color: "#5c939f", line: { color: "#090909", width: 1 } },
    };
    const pointTrace = {
      x: [x0], y: [Px0], mode: "markers", type: "scatter", name: mode === "lagrange" ? "P(x₀)" : "S(x₀)",
      marker: { size: 14, color: "#ed6d40", symbol: "circle-open", line: { width: 2, color: "#ed6d40" } },
    };

    const traces = [];

    if (rungeActive) {
      traces.push({
        x: curveX, y: rungeY, mode: "lines", type: "scatter", name: "f(x) = 1/(1+25x²)",
        line: { color: "#7d858c", width: 1.5, dash: "dot" },
      });
    }

    if (compare) {
      traces.push({
        x: curveX, y: lagrangeY, mode: "lines", type: "scatter", name: "Lagrange P(x)",
        line: { color: "#cb3500", width: mode === "lagrange" ? 3 : 2, dash: mode === "lagrange" ? "solid" : "dash" },
      });
      traces.push({
        x: curveX, y: splineY, mode: "lines", type: "scatter", name: "Cubic spline S(x)",
        line: { color: "#5c939f", width: mode === "spline" ? 3 : 2, dash: mode === "spline" ? "solid" : "dash" },
      });
    } else {
      // basis decomposition: each yᵢ·Lᵢ(x) shown thin/dashed so it's visible how the
      // weighted basis terms sum to the bold P(x) curve above (toggle via legend click).
      if (mode === "lagrange") {
        const palette = ["#5c939f", "#ed6d40", "#59a993", "#dadada", "#cb3500", "#8a6fd1", "#c98a3e", "#3ea6c9"];
        points.forEach((p, i) => {
          const y = curveX.map((x) => p.y * basisValueAt(points, i, x));
          traces.push({
            x: curveX, y, mode: "lines", type: "scatter",
            name: `y${i}·L${i}(x)`,
            line: { color: palette[i % palette.length], width: 1, dash: "dot" },
            opacity: 0.6,
            visible: points.length <= 6 ? true : "legendonly",
          });
        });
        traces.push({ x: curveX, y: lagrangeY, mode: "lines", type: "scatter", name: "P(x)", line: { color: "#e7e7e7", width: 3 } });
      } else {
        traces.push({ x: curveX, y: splineY, mode: "lines", type: "scatter", name: "S(x)", line: { color: "#e7e7e7", width: 3 } });
      }
    }

    traces.push(dataTrace, pointTrace);

    // Runge's-phenomenon comparisons fix the y-axis to the well-behaved curves' range —
    // otherwise the blown-up Lagrange polynomial dominates autorange and squashes the
    // spline/true-function flat, hiding exactly the contrast the demo is meant to show.
    const dataYs = points.map((p) => p.y);
    let yAxisOpts;
    if (rungeActive) {
      const stableYs = [...splineY, ...rungeY, ...dataYs];
      const yMin = Math.min(...stableYs), yMax = Math.max(...stableYs);
      const yPad = Math.max(0.15, (yMax - yMin) * 0.25);
      yAxisOpts = { title: mode === "lagrange" ? "P(x)" : "S(x)", range: [yMin - yPad, yMax + yPad] };
    } else {
      yAxisOpts = { title: mode === "lagrange" ? "P(x)" : "S(x)" };
    }

    const yForRange = rungeActive
      ? [...splineY, ...rungeY, ...dataYs]
      : compare
      ? [...lagrangeY, ...splineY]
      : mode === "lagrange"
      ? lagrangeY
      : splineY;
    const lineY0 = Math.max(Math.min(...yForRange), yAxisOpts.range ? yAxisOpts.range[0] : -Infinity);
    const lineY1 = Math.min(Math.max(Px0, yForRange[0]), yAxisOpts.range ? yAxisOpts.range[1] : Infinity);

    Plotly.newPlot(
      "curvePlot",
      traces,
      Engine.plotlyBaseLayout({
        xaxis: { title: "x" },
        yaxis: yAxisOpts,
        shapes: [
          { type: "line", x0: x0, x1: x0, y0: lineY0, y1: lineY1, line: { color: "#7d858c", width: 1, dash: "dot" } },
        ],
      }),
      Engine.plotlyConfig
    );
  }

  function runCompute() {
    clearError();

    const points = getPoints();
    if (points.some((p) => Number.isNaN(p.x) || Number.isNaN(p.y)))
      return showError("Every point needs numeric x and y values.");
    if (points.length < 2) return showError("Enter at least two points.");

    const xs = points.map((p) => p.x);
    if (new Set(xs).size !== xs.length) return showError("x values must be distinct.");

    const x0 = parseFloat(queryInput.value);
    if (Number.isNaN(x0)) return showError("Enter a numeric value to evaluate at.");

    render(points, x0);
    Proto.saveState(STORE_KEY, snapshot());
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runCompute();
  });

  const saved = Proto.loadState(STORE_KEY);
  if (saved) {
    if (saved.points !== undefined) {
      const pairs = String(saved.points)
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((pair) => pair.split(",").map((v) => Number(v.trim())));
      if (pairs.length >= 2) resetPoints(pairs);
    }
    if (saved.x0 !== undefined) queryInput.value = saved.x0;
    runCompute();
  }
})();
