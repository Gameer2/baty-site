/* Shared page wiring for the Linear Algebra Engine.
   Every method page has the same shell — a sized matrix grid, optional b vector, Compute
   and Try Example buttons, a stat strip, output blocks and a row-operation table. That
   wiring lives here once; each page's own file supplies only its example input, its call
   into LinAlg, and how to render the result. No matrix mathematics in this file. */
(function (root) {
  "use strict";

  const LinAlgPage = {};

  // config: { square, vector, example: {A, b}, compute(A, b) -> result, render(result, ui),
  //   storeKey } — storeKey is optional; when present the page's starting matrix (and vector,
  //   if config.vector) round-trips through Proto.saveState/loadState under that key instead of
  //   always starting from config.example, the same convention every other engine's pages
  //   already use. This is what lets the canvas node's "Open in the lab" portal actually prefill
  //   a linear-algebra page — see canvas/syntropy-app/syntropy/portalPrefill.ts.
  LinAlgPage.init = function (config) {
    const form = document.getElementById("laForm");
    const rowsInput = document.getElementById("rowsInput");
    const colsInput = document.getElementById("colsInput");
    const matrixGrid = document.getElementById("matrixGrid");
    const vectorGrid = document.getElementById("vectorGrid");
    const statusLine = document.getElementById("statusLine");
    const statusText = document.getElementById("statusText");
    const formError = document.getElementById("formError");
    const formErrorText = document.getElementById("formErrorText");
    const placeholderPanel = document.getElementById("placeholderPanel");
    const resultsArea = document.getElementById("resultsArea");
    const statStrip = document.getElementById("statStrip");
    const outputBlocks = document.getElementById("outputBlocks");
    const stepsPanel = document.getElementById("stepsPanel");
    const stepsBody = document.getElementById("stepsBody");
    const exampleBtn = document.getElementById("exampleBtn");
    const modeNote = document.getElementById("modeNote");

    // A grid of spinboxes stops being usable well before the arithmetic struggles, so
    // above this many entries the page switches to a paste box instead. The maths itself
    // is fine far beyond this (row reduction on a 150x150 runs in ~30 ms).
    const GRID_MAX_ENTRIES = 144; // 12 x 12
    const SIZE_MAX = 60;
    let textMode = false;

    function currentSize() {
      const r = Math.max(1, Math.min(SIZE_MAX, parseInt(rowsInput.value, 10) || 1));
      const c = config.square ? r : Math.max(1, Math.min(SIZE_MAX, parseInt(colsInput.value, 10) || 1));
      return { r, c };
    }

    // Builds the paste box in place of the grid, seeded with the current values.
    function buildTextArea(container, M, label) {
      container.innerHTML = "";
      const ta = document.createElement("textarea");
      ta.className = "mono matrix-text";
      ta.rows = Math.min(14, Math.max(3, M.length));
      ta.spellcheck = false;
      ta.setAttribute("aria-label", label);
      ta.style.cssText = "width:100%;background:var(--core-black);border:1px solid rgba(255,255,255,.14);" +
        "border-radius:var(--radius-sm);color:var(--off-white);padding:12px 14px;" +
        "font-family:var(--font-mono);font-size:13px;resize:vertical;line-height:1.6;";
      ta.value = MatrixUI.toText(M);
      ta.addEventListener("input", setDirty);
      container.appendChild(ta);
    }

    // Reads whichever input is currently showing.
    function readMatrix(container) {
      const ta = container.querySelector("textarea.matrix-text");
      if (ta) return MatrixUI.parseText(ta.value);
      return MatrixUI.readGrid(container);
    }

    function syncVectorGrid() {
      if (!config.vector || !vectorGrid) return;
      const { r } = currentSize();
      let existing = null;
      try { existing = readMatrix(vectorGrid); } catch (e) { existing = null; }
      const values = Array.from({ length: r }, (_, i) => [existing && existing[i] ? existing[i][0] : 0]);
      if (textMode) buildTextArea(vectorGrid, values, "right-hand side b, one entry per line");
      else MatrixUI.createGrid(vectorGrid, { rows: r, cols: 1, values, labelPrefix: "b", onChange: setDirty });
    }

    function rebuildGrid(values) {
      const { r, c } = currentSize();
      const vals = Array.from({ length: r }, (_, i) =>
        Array.from({ length: c }, (_, j) => (values && values[i] && values[i][j] !== undefined ? values[i][j] : 0)));
      textMode = r * c > GRID_MAX_ENTRIES;
      if (textMode) buildTextArea(matrixGrid, vals, "matrix A, one row per line");
      else MatrixUI.createGrid(matrixGrid, { rows: r, cols: c, values: vals, labelPrefix: "A", onChange: setDirty });
      if (modeNote) {
        modeNote.textContent = textMode
          ? `${r}x${c} is too large for a grid — edit it as text, one row per line (commas or spaces between entries).`
          : "";
        modeNote.style.display = textMode ? "" : "none";
      }
      syncVectorGrid();
    }

    function setDirty() {
      statusLine.className = "status-line";
      statusText.textContent = "Input changed — press Compute to update.";
    }

    function onResize() {
      let existing = null;
      try { existing = readMatrix(matrixGrid); } catch (e) { existing = null; }
      rebuildGrid(existing);
      setDirty();
    }

    rowsInput.addEventListener("change", onResize);
    if (colsInput) colsInput.addEventListener("change", onResize);

    function showError(message) {
      formError.style.display = "block";
      formErrorText.textContent = message;
      statusLine.className = "status-line bad";
      statusText.textContent = "Could not compute.";
      resultsArea.style.display = "none";
      placeholderPanel.style.display = "";
    }

    function clearError() { formError.style.display = "none"; }

    // The small rendering API handed to each page's render().
    function makeUI() {
      // Release any 3-D scenes before their canvases are torn out below: wiping innerHTML
      // drops the DOM but leaves the WebGL context allocated and Scene3D's rAF loop running,
      // and browsers cap live contexts (~16). Without this, re-running a solve a dozen times
      // exhausts them and every later 3-D plot silently fails to draw.
      if (window.LinAlgViz && LinAlgViz.disposeAll) LinAlgViz.disposeAll();
      statStrip.innerHTML = "";
      outputBlocks.innerHTML = "";
      stepsBody.innerHTML = "";
      stepsPanel.style.display = "none";

      function panel(title) {
        const p = document.createElement("div");
        p.className = "panel crosshair-host";
        p.style.marginTop = "20px";
        const t = document.createElement("span");
        t.className = "panel-title";
        t.textContent = title;
        p.appendChild(t);
        const body = document.createElement("div");
        body.style.marginTop = "12px";
        p.appendChild(body);
        outputBlocks.appendChild(p);
        return body;
      }

      return {
        stat(label, value, accent) {
          const d = document.createElement("div");
          d.className = "result-stat" + (accent ? " accent" : "");
          d.innerHTML = `<div class="label"></div><div class="value"></div>`;
          d.querySelector(".label").textContent = label;
          d.querySelector(".value").textContent = value;
          statStrip.appendChild(d);
        },
        matrix(title, M, opts) {
          const body = panel(title);
          MatrixUI.renderMatrix(body, M, opts);
        },
        vectors(title, list, opts) {
          const body = panel(title);
          MatrixUI.renderVectorList(body, list, opts);
        },
        html(title, markup) {
          const body = panel(title);
          body.innerHTML = markup;
        },
        plot(title, draw, height) {
          // A plot panel: `draw(el)` returns false when Plotly is unavailable or the data
          // cannot be drawn (wrong dimension, say), in which case the empty panel is
          // removed rather than left as a blank box.
          const body = panel(title);
          const host = document.createElement("div");
          host.className = "plot-wrap crosshair-host";
          host.style.cssText = `height:${height || 320}px;margin:0;`;
          body.appendChild(host);
          let drew = false;
          try { drew = draw(host) !== false; } catch (e) { drew = false; }
          if (!drew) body.parentNode.remove();
        },
        note(title, text, tone) {
          const body = panel(title);
          const line = document.createElement("div");
          line.className = "status-line" + (tone ? " " + tone : "");
          line.innerHTML = `<span class="status-dot"></span><span></span>`;
          line.querySelector("span:last-child").textContent = text;
          body.appendChild(line);
        },
        steps(list, omitted) {
          if (omitted) {
            const body = panel("Row operations");
            const line = document.createElement("div");
            line.className = "status-line";
            line.innerHTML = `<span class="status-dot"></span><span></span>`;
            line.querySelector("span:last-child").textContent =
              "The step-by-step log is kept only for matrices small enough to read (up to 12x12). " +
              "The result above is computed the same way either way.";
            body.appendChild(line);
            return;
          }
          if (!list || !list.length) return;
          stepsPanel.style.display = "";
          stepsBody.innerHTML = list.map((s, i) => {
            const m = s.matrix
              ? s.matrix.map((r) => r.map((v) => MatrixUI.format(v)).join("&nbsp;&nbsp;")).join("<br>")
              : (s.vector ? s.vector.map((v) => MatrixUI.format(v)).join("&nbsp;&nbsp;") : "");
            return `<tr><td>${i + 1}</td><td class="mono">${s.description}</td><td class="mono" style="line-height:1.5;">${m}</td></tr>`;
          }).join("");
        },
      };
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearError();
      let A, b = null;
      try {
        A = readMatrix(matrixGrid);
        if (config.square && A.length !== A[0].length) {
          return showError(`This method needs a square matrix; you entered ${A.length}x${A[0].length}.`);
        }
        // A pasted matrix may not match the size boxes — trust the paste and update them.
        rowsInput.value = String(A.length);
        if (colsInput) colsInput.value = String(A[0].length);
        if (config.vector) {
          const bm = readMatrix(vectorGrid);
          b = bm.map((r) => r[0]);
          if (b.length !== A.length) return showError(`b has ${b.length} entries but A has ${A.length} rows.`);
        }
      } catch (err) { return showError(err.message); }

      let result;
      try { result = config.compute(A, b); }
      catch (err) { return showError(err.message); }

      placeholderPanel.style.display = "none";
      resultsArea.style.display = "";
      statusLine.className = "status-line ok";
      statusText.textContent = "Computed.";
      // Serialized the same delimited-string way every other engine's port spec already stores
      // its inputs ("1,2;3,4" rows, "1,2,3" vector) — not a raw array — so this round-trips
      // through portalPrefill.ts's generic buildPageState() without that seam needing to know
      // about matrix/vector shapes specifically. See parseComposite.ts for the parse side.
      if (config.storeKey && window.Proto) {
        const stateOut = { A: A.map((row) => row.join(",")).join(";") };
        if (config.vector) stateOut.b = b.join(",");
        Proto.saveState(config.storeKey, stateOut);
      }
      try { config.render(result, makeUI(), A, b); }
      catch (err) { showError("Rendering failed: " + err.message); }
    });

    exampleBtn.addEventListener("click", () => {
      const ex = config.example;
      rowsInput.value = String(ex.A.length);
      if (colsInput) colsInput.value = String(ex.A[0].length);
      rebuildGrid(ex.A);
      if (config.vector && ex.b) syncVectorGrid();
      clearError();
      statusLine.className = "status-line";
      statusText.textContent = "Example loaded — press Compute.";
    });

    // Parses the same "1,2;3,4" / "1,2,3" delimited strings parseComposite.ts's
    // parseMatrix/parseNumberList use — see the save side above for why it's a string, not a
    // real array.
    function parseMatrixString(s) {
      return String(s).split(";").map((r) => r.split(",").map(Number));
    }
    function parseVectorString(s) {
      return String(s).split(",").map(Number);
    }

    // Start from a node's prefilled values if the portal opened this page with any (see
    // storeKey above); otherwise the example, so the page is never blank either way.
    const saved = config.storeKey && window.Proto ? Proto.loadState(config.storeKey) : null;
    const savedA = saved && saved.A !== undefined ? parseMatrixString(saved.A) : null;
    const savedB = saved && saved.b !== undefined ? parseVectorString(saved.b) : null;
    const validA = savedA && savedA.length && savedA.every((row) =>
      row.length === savedA[0].length && row.every(Number.isFinite));
    const startA = validA ? savedA : config.example.A;
    const startB = validA && savedB && savedB.every(Number.isFinite) ? savedB : config.example.b;
    rowsInput.value = String(startA.length);
    if (colsInput) colsInput.value = String(startA[0].length);
    rebuildGrid(startA);
    if (config.vector && startB) {
      const cells = vectorGrid.querySelectorAll("input.matrix-cell");
      if (cells.length === startB.length) {
        cells.forEach((c) => { c.value = String(startB[Number(c.dataset.row)]); });
      }
    }
    if (saved) {
      statusLine.className = "status-line";
      statusText.textContent = "Loaded from the canvas node — press Compute.";
    }
  };

  root.LinAlgPage = LinAlgPage;
})(typeof self !== "undefined" ? self : this);
