/* Modular arithmetic — DOM wiring. Renders the add and multiply tables mod n as heatmaps and
   lists the units (residues coprime to n, i.e. with gcd 1). */
(function () {
  "use strict";

  const nInput = document.getElementById("nInput");
  const form = document.getElementById("modForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statUnits = document.getElementById("statUnits");
  const statZeroDiv = document.getElementById("statZeroDiv");
  const mulHeatmap = document.getElementById("mulHeatmap");
  const addHeatmap = document.getElementById("addHeatmap");
  const mulN = document.getElementById("mulN");
  const addN = document.getElementById("addN");
  const mulNote = document.getElementById("mulNote");
  const unitList = document.getElementById("unitList");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { nInput.value = "12"; clearError(); });

  function parseInput(raw) {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) throw new Error("n must be a positive integer.");
    const v = BigInt(s);
    if (v < 2n) throw new Error("n must be at least 2.");
    if (v > 30n) throw new Error("n must be at most 30 so the tables stay readable.");
    return v;
  }

  function heatColor(val, n) {
    // 0 → dim, larger → electric-teal; show 0 distinctly (zero divisor)
    if (val === 0) return "rgba(237,109,64,.18)";
    const t = val / (n - 1);
    const r = Math.round(92 + (237 - 92) * (1 - t));
    const g = Math.round(147 + (109 - 147) * (1 - t));
    const b = Math.round(159 + (64 - 159) * (1 - t));
    return `rgb(${r},${g},${b})`;
  }

  function renderTable(table, n, isMul) {
    const N = Number(n);
    const frag = document.createDocumentFragment();
    // header row (column index), with corner blank
    const headRow = document.createElement("div");
    headRow.style.display = "contents";
    const corner = document.createElement("div"); corner.className = "hm-cell hm-head"; corner.textContent = isMul ? "×" : "+"; headRow.appendChild(corner);
    for (let j = 0; j < N; j++) { const h = document.createElement("div"); h.className = "hm-cell hm-head"; h.textContent = String(j); headRow.appendChild(h); }
    frag.appendChild(headRow);
    for (let i = 0; i < N; i++) {
      const lab = document.createElement("div"); lab.className = "hm-cell hm-rowlabel"; lab.textContent = String(i); frag.appendChild(lab);
      for (let j = 0; j < N; j++) {
        const v = isMul ? (i * j) % N : (i + j) % N;
        const cell = document.createElement("div");
        cell.className = "hm-cell";
        cell.textContent = String(v);
        cell.style.background = heatColor(v, N);
        if (v === 0) cell.classList.add("hm-zero");
        frag.appendChild(cell);
      }
    }
    table.innerHTML = "";
    table.style.gridTemplateColumns = `34px repeat(${N}, 34px)`;
    table.appendChild(frag);
  }

  function render(n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";
    const N = Number(n);
    mulN.textContent = String(n); addN.textContent = String(n);
    renderTable(mulHeatmap, n, true);
    renderTable(addHeatmap, n, false);

    const units = [];
    for (let a = 1; a < N; a++) if (NumberTheory.gcd(BigInt(a), n) === 1n) units.push(a);
    statUnits.textContent = String(units.length);
    statZeroDiv.textContent = String((N - 1) - units.length);
    unitList.innerHTML = units.length ? units.map((u) => `<span class="pipe is-accent">${u}</span>`).join("") : '<span class="pipe">none</span>';
    mulNote.textContent = `φ(${n}) = ${units.length}. A row has an inverse mod ${n} exactly when it contains no 0 — i.e. when gcd(row, ${n}) = 1. The ${N - 1 - units.length} rows that do hit 0 mark the zero divisors.`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let n;
    try { n = parseInput(nInput.value); } catch (err) { return showError(err.message); }
    render(n);
    Proto.saveState("engine-lab:number-theory-modular-arithmetic", { n: nInput.value });
  });

  const saved = Proto.loadState("engine-lab:number-theory-modular-arithmetic");
  if (saved) {
    if (saved.n !== undefined) nInput.value = saved.n;
    form.requestSubmit();
  }
})();