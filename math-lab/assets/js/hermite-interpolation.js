(function () {
  "use strict";

  const tbody = document.getElementById("pointsTableBody");
  const addPointBtn = document.getElementById("addPointBtn");
  const queryInput = document.getElementById("queryInput");
  const compareToggle = document.getElementById("compareToggle");
  const form = document.getElementById("hermiteForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statValue = document.getElementById("statValue");
  const statDegree = document.getElementById("statDegree");
  const statNodes = document.getElementById("statNodes");
  const statMid = document.getElementById("statMid");
  const formulaBlock = document.getElementById("formulaBlock");
  const ddTableHead = document.getElementById("ddTableHead");
  const ddTableBody = document.querySelector("#ddTable tbody");

  // "Try Example": x³ through two points — f(x)=x³, f'(x)=3x² at x=0,1.
  const DEFAULT_POINTS = [
    [0, 0, 0],
    [1, 1, 3],
  ];

  function updateRemoveButtonsState() {
    const rows = tbody.querySelectorAll("tr");
    const locked = rows.length <= 2;
    rows.forEach((row) => {
      const btn = row.querySelector(".row-remove");
      if (btn) btn.disabled = locked;
    });
  }

  function addRow(x = "", f = "", fp = "") {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="number" class="pt-x" value="${x}" step="any" /></td>
      <td><input type="number" class="pt-f" value="${f}" step="any" /></td>
      <td><input type="number" class="pt-fp" value="${fp}" step="any" /></td>
      <td><button type="button" class="row-remove" title="Remove point">×</button></td>
    `;
    tr.querySelector(".row-remove").addEventListener("click", () => {
      if (tbody.querySelectorAll("tr").length <= 2) return;
      tr.remove();
      updateRemoveButtonsState();
    });
    tbody.appendChild(tr);
    updateRemoveButtonsState();
  }

  function resetPoints(triples) {
    tbody.innerHTML = "";
    triples.forEach(([x, f, fp]) => addRow(x, f, fp));
  }

  addPointBtn.addEventListener("click", () => addRow());

  exampleBtn.addEventListener("click", () => {
    resetPoints(DEFAULT_POINTS);
    queryInput.value = "0.5";
  });

  compareToggle.addEventListener("change", () => {
    if (resultsArea.style.display !== "none") form.requestSubmit();
  });

  resetPoints(DEFAULT_POINTS);

  function getPoints() {
    const rows = Array.from(tbody.querySelectorAll("tr"));
    return rows
      .map((row) => ({
        x: parseFloat(row.querySelector(".pt-x").value),
        f: parseFloat(row.querySelector(".pt-f").value),
        fp: parseFloat(row.querySelector(".pt-fp").value),
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

  // Local Lagrange overlay (presentation-only, kept out of algorithms.js — same pattern
  // lagrange.js uses for its own overlay curve).
  function multiplyPoly(a, b) {
    const out = new Array(a.length + b.length - 1).fill(0);
    for (let i = 0; i < a.length; i++)
      for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
    return out;
  }
  function lagrangeCoeffs(points) {
    const n = points.length;
    const total = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let poly = [1];
      let denom = 1;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        poly = multiplyPoly(poly, [-points[j].x, 1]);
        denom *= points[i].x - points[j].x;
      }
      const scale = points[i].f / denom;
      for (let k = 0; k < poly.length; k++) total[k] += poly[k] * scale;
    }
    const maxAbs = Math.max(...total.map(Math.abs), 1);
    return total.map((c) => (Math.abs(c) < maxAbs * 1e-10 ? 0 : c));
  }
  function evalPoly(coeffsAsc, x) {
    let result = 0;
    for (let k = coeffsAsc.length - 1; k >= 0; k--) result = result * x + coeffsAsc[k];
    return result;
  }

  // Tangent segment length (in x) drawn at each node — fixed small span so the slope
  // constraint being matched is visually obvious without dominating the curve.
  const TANGENT_HALF_SPAN = 0.18;

  function render(points, x0) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const n = points.length - 1;
    const degree = 2 * n + 1;
    const compare = compareToggle.checked;

    let z, Q;
    try {
      ({ z, Q } = Algorithms.runHermite(points));
    } catch (err) {
      return showError(err.message);
    }
    const hermiteAt = (x) => Algorithms.evalHermite(z, Q, x);

    const lagrangePts = points.map((p) => ({ x: p.x, y: p.f }));
    const lgCoeffs = compare ? lagrangeCoeffs(lagrangePts) : null;
    const lagrangeAt = (x) => evalPoly(lgCoeffs, x);

    const Hx0 = hermiteAt(x0);
    statValue.textContent = Engine.formatNum(Hx0, 6);
    statDegree.textContent = String(degree);
    statNodes.textContent = String(points.length);
    const midX = (points[0].x + points[points.length - 1].x) / 2;
    statMid.textContent = Engine.formatNum(hermiteAt(midX), 6);

    Engine.renderKatex(
      formulaBlock,
      "H(x) = Q_{0,0} + \\sum_{k=1}^{2n+1} Q_{k,k}\\,\\prod_{j=0}^{k-1}(x - z_j), \\quad z_{2i}=z_{2i+1}=x_i",
      true
    );

    // --- Divided-difference table (rows = z_i, columns = each difference order) ---
    const m = z.length - 1;
    const head = ["<tr><th>k</th><th>z_k</th>"];
    for (let j = 0; j <= m; j++) head.push(`<th>Q[k][${j}]</th>`);
    head.push("</tr>");
    ddTableHead.innerHTML = head.join("");
    const rows = [];
    for (let i = 0; i <= m; i++) {
      const cells = [`<td>${i}</td><td>${Engine.formatNum(z[i], 4)}</td>`];
      for (let j = 0; j <= m; j++) {
        cells.push(`<td>${j <= i ? Engine.formatNum(Q[i][j], 5) : ""}</td>`);
      }
      rows.push(`<tr>${cells.join("")}</tr>`);
    }
    ddTableBody.innerHTML = rows.join("");

    // --- Plot: H(x) curve, node markers, tangent segments, optional Lagrange overlay ---
    const xs = points.map((p) => p.x);
    const minX = Math.min(...xs, x0), maxX = Math.max(...xs, x0);
    const pad = Math.max(0.5, (maxX - minX) * 0.2);
    const xmin = minX - pad, xmax = maxX + pad;
    const curveX = [], hermiteY = [], lagrangeY = [];
    for (let i = 0; i <= 240; i++) {
      const x = xmin + ((xmax - xmin) * i) / 240;
      curveX.push(x);
      hermiteY.push(hermiteAt(x));
      if (compare) lagrangeY.push(lagrangeAt(x));
    }

    const traces = [];

    if (compare) {
      traces.push({
        x: curveX, y: lagrangeY, mode: "lines", type: "scatter", name: "Lagrange P(x)",
        line: { color: "#7d858c", width: 2, dash: "dash" },
      });
    }

    traces.push({
      x: curveX, y: hermiteY, mode: "lines", type: "scatter", name: "Hermite H(x)",
      line: { color: "#5c939f", width: 3 },
    });

    // Tangent segment at each node: short line of fixed x-span centered on (x_i, f_i)
    // with slope f'_i — visually confirms the derivative constraint is being met.
    const tangX = [], tangY = [];
    points.forEach((p) => {
      const dx = TANGENT_HALF_SPAN * (xmax - xmin);
      tangX.push(p.x - dx, p.x + dx, null);
      tangY.push(p.f - p.fp * dx, p.f + p.fp * dx, null);
    });
    traces.push({
      x: tangX, y: tangY, mode: "lines", type: "scatter", name: "tangent f′(xᵢ)",
      line: { color: "#ed6d40", width: 2, dash: "solid" },
      hoverinfo: "skip",
    });

    traces.push({
      x: points.map((p) => p.x), y: points.map((p) => p.f),
      mode: "markers", type: "scatter", name: "nodes (xᵢ, fᵢ)",
      marker: { size: 9, color: "#e7e7e7", line: { color: "#5c939f", width: 1.5 } },
    });

    traces.push({
      x: [x0], y: [Hx0], mode: "markers", type: "scatter", name: "H(x₀)",
      marker: { size: 14, color: "#ed6d40", symbol: "circle-open", line: { width: 2, color: "#ed6d40" } },
    });

    Plotly.newPlot(
      "curvePlot",
      traces,
      Engine.plotlyBaseLayout({
        xaxis: { title: "x" },
        yaxis: { title: "H(x)" },
        shapes: [
          { type: "line", x0: x0, x1: x0, y0: 0, y1: Hx0, line: { color: "#7d858c", width: 1, dash: "dot" } },
        ],
      }),
      Engine.plotlyConfig
    );
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();

    const points = getPoints();
    if (points.some((p) => Number.isNaN(p.x) || Number.isNaN(p.f) || Number.isNaN(p.fp)))
      return showError("Every point needs numeric x, f(x), and f′(x) values.");
    if (points.length < 2) return showError("Enter at least two points.");

    const xs = points.map((p) => p.x);
    if (new Set(xs).size !== xs.length) return showError("x values must be distinct.");

    const x0 = parseFloat(queryInput.value);
    if (Number.isNaN(x0)) return showError("Enter a numeric value to evaluate at.");

    render(points, x0);
  });
})();