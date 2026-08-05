/* Matrix input/output UI — shared by every Linear Algebra Engine page.
   DOM only: no matrix mathematics lives here (that is assets/js/linalg-algorithms.js).
   Every page needs an editable grid of numbers and a way to render a result matrix, so
   this exists once rather than being re-implemented on ten pages. */
(function (root) {
  "use strict";

  const MatrixUI = {};

  const CELL_STYLE = "width:100%;min-width:52px;background:var(--core-black);border:1px solid rgba(255,255,255,.14);" +
    "border-radius:var(--radius-sm);color:var(--off-white);padding:8px 6px;font-family:var(--font-mono);" +
    "font-size:14px;text-align:center;";

  // Formats a number for display: integers stay bare, everything else gets trimmed
  // to 4 decimals with trailing zeros removed, and -0 is normalised to 0.
  MatrixUI.format = function (x) {
    if (!Number.isFinite(x)) return String(x);
    if (Object.is(x, -0)) x = 0;
    if (Number.isInteger(x)) return String(x);
    const s = x.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    return s === "-0" ? "0" : s;
  };

  // Builds an editable rows x cols grid of number inputs inside `container`.
  // opts: { rows, cols, values, onChange, labelPrefix }
  MatrixUI.createGrid = function (container, opts) {
    opts = opts || {};
    const rows = opts.rows || 3;
    const cols = opts.cols || 3;
    const values = opts.values || null;
    container.innerHTML = "";
    container.dataset.rows = String(rows);
    container.dataset.cols = String(cols);
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = `repeat(${cols}, minmax(52px, 1fr))`;
    grid.style.gap = "6px";
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.className = "mono matrix-cell";
        input.setAttribute("aria-label", `${opts.labelPrefix || "entry"} row ${i + 1} column ${j + 1}`);
        input.dataset.row = String(i);
        input.dataset.col = String(j);
        input.style.cssText = CELL_STYLE;
        const v = values && values[i] && values[i][j] !== undefined ? values[i][j] : 0;
        input.value = String(v);
        if (opts.onChange) input.addEventListener("input", opts.onChange);
        grid.appendChild(input);
      }
    }
    container.appendChild(grid);
  };

  // Reads a grid back as a number[][]. Throws with a specific, human-readable message
  // naming the offending cell rather than returning NaN.
  MatrixUI.readGrid = function (container) {
    const rows = Number(container.dataset.rows);
    const cols = Number(container.dataset.cols);
    const cells = container.querySelectorAll("input.matrix-cell");
    if (cells.length !== rows * cols) throw new Error("The grid is out of sync — re-enter the size.");
    const M = Array.from({ length: rows }, () => new Array(cols).fill(0));
    cells.forEach((cell) => {
      const i = Number(cell.dataset.row), j = Number(cell.dataset.col);
      const raw = cell.value.trim();
      const v = raw === "" ? 0 : Number(raw);
      if (!Number.isFinite(v)) throw new Error(`Row ${i + 1}, column ${j + 1} is not a valid number.`);
      M[i][j] = v;
    });
    return M;
  };

  // Overwrites a grid's values, resizing it first when the shape differs.
  MatrixUI.setGrid = function (container, M, opts) {
    MatrixUI.createGrid(container, Object.assign({}, opts, { rows: M.length, cols: M[0].length, values: M }));
  };

  // Renders a read-only matrix with square brackets. `opts.highlightCols` draws the given
  // column indices in the accent colour (used for pivot columns).
  MatrixUI.renderMatrix = function (el, M, opts) {
    opts = opts || {};
    if (!M || !M.length) { el.innerHTML = '<span class="mono">(empty)</span>'; return; }
    const hl = new Set(opts.highlightCols || []);
    const hlRows = new Set(opts.highlightRows || []);
    const body = M.map((row, i) => {
      const cells = row.map((v, j) => {
        const accent = hl.has(j) || hlRows.has(i);
        const style = `padding:3px 10px;text-align:right;font-family:var(--font-mono);font-size:14px;` +
          (accent ? "color:var(--electric-teal);font-weight:600;" : "color:var(--off-white);");
        return `<td style="${style}">${MatrixUI.format(v)}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    el.innerHTML =
      `<div style="display:inline-flex;align-items:stretch;gap:4px;">
         <span style="width:8px;border:1px solid rgba(255,255,255,.35);border-right:none;border-radius:2px 0 0 2px;"></span>
         <table style="border-collapse:collapse;"><tbody>${body}</tbody></table>
         <span style="width:8px;border:1px solid rgba(255,255,255,.35);border-left:none;border-radius:0 2px 2px 0;"></span>
       </div>`;
  };

  // Renders a column vector (an array) using the same bracket styling.
  MatrixUI.renderVector = function (el, v, opts) {
    MatrixUI.renderMatrix(el, v.map((x) => [x]), opts);
  };

  // Renders a list of vectors side by side, each labelled — used for subspace bases and
  // eigenvector lists. Returns early with a caller-supplied message when the list is empty.
  MatrixUI.renderVectorList = function (el, vectors, opts) {
    opts = opts || {};
    if (!vectors || vectors.length === 0) {
      el.innerHTML = `<span class="mono" style="opacity:.7;">${opts.emptyMessage || "(none)"}</span>`;
      return;
    }
    el.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start;";
    vectors.forEach((v, k) => {
      const item = document.createElement("div");
      item.style.cssText = "display:flex;flex-direction:column;gap:6px;align-items:center;";
      const label = document.createElement("span");
      label.className = "mono";
      label.style.cssText = "font-size:12px;opacity:.75;letter-spacing:.06em;";
      label.textContent = (opts.labels && opts.labels[k]) || `${opts.prefix || "v"}${k + 1}`;
      const box = document.createElement("div");
      MatrixUI.renderVector(box, v);
      item.appendChild(label);
      item.appendChild(box);
      wrap.appendChild(item);
    });
    el.appendChild(wrap);
  };

  // Parses pasted text into a matrix. Rows are separated by newlines or semicolons,
  // entries by commas or whitespace — so output copied from a spreadsheet, from NumPy, or
  // typed by hand all work. Throws naming the offending row rather than returning NaN.
  MatrixUI.parseText = function (text) {
    const rows = String(text).split(/[\n;]+/).map((r) => r.trim()).filter((r) => r.length);
    if (!rows.length) throw new Error("Enter at least one row of numbers.");
    const M = rows.map((line, i) => {
      const parts = line.replace(/[\[\]()]/g, " ").split(/[\s,]+/).filter((p) => p.length);
      return parts.map((p) => {
        const v = Number(p);
        if (!Number.isFinite(v)) throw new Error(`Row ${i + 1}: "${p}" is not a number.`);
        return v;
      });
    });
    const width = M[0].length;
    if (!width) throw new Error("Row 1 has no numbers in it.");
    M.forEach((r, i) => {
      if (r.length !== width) throw new Error(`Row ${i + 1} has ${r.length} entries but row 1 has ${width} — every row must be the same length.`);
    });
    return M;
  };

  // Renders a matrix as aligned text, for the paste box.
  MatrixUI.toText = function (M) {
    const cells = M.map((r) => r.map((v) => MatrixUI.format(v)));
    const width = Math.max(...cells.flat().map((s) => s.length));
    return cells.map((r) => r.map((s) => s.padStart(width)).join("  ")).join("\n");
  };

  // Wires a rows/cols size control pair to a grid, preserving any values that still fit.
  MatrixUI.attachSizeControls = function (rowsInput, colsInput, container, opts) {
    opts = opts || {};
    function resize() {
      const r = Math.max(1, Math.min(opts.max || 6, parseInt(rowsInput.value, 10) || 1));
      const c = colsInput ? Math.max(1, Math.min(opts.max || 6, parseInt(colsInput.value, 10) || 1)) : r;
      rowsInput.value = String(r);
      if (colsInput) colsInput.value = String(c);
      let existing = null;
      try { existing = MatrixUI.readGrid(container); } catch (e) { existing = null; }
      const values = Array.from({ length: r }, (_, i) =>
        Array.from({ length: c }, (_, j) => (existing && existing[i] && existing[i][j] !== undefined ? existing[i][j] : 0)));
      MatrixUI.createGrid(container, Object.assign({}, opts, { rows: r, cols: c, values }));
      if (opts.onResize) opts.onResize(r, c);
    }
    rowsInput.addEventListener("change", resize);
    if (colsInput) colsInput.addEventListener("change", resize);
    return resize;
  };

  root.MatrixUI = MatrixUI;
})(typeof self !== "undefined" ? self : this);
