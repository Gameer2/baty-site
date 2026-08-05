/* Complex Logarithms & Powers — branch cuts — page wiring.
   Numeric, same as domain-coloring.js's own reasoning: log and non-integer power have no
   symbolic "u(x,y), v(x,y)" this engine will compute for them (complex-symbolic.js's decompose()
   refuses sqrt/log/fractional powers by name, precisely because they're multivalued — see
   COMPLEX_ANALYSIS_ENGINE_PLAN.md §4). What IS computable, exactly, is the principal branch
   (Complex.log / Complex.pow, both in complex.js) and every OTHER branch at a given point
   (Complex.logBranch / Complex.powBranch) — this page is built entirely on those. */
(function () {
  "use strict";

  const modeRow = document.getElementById("modeRow");
  const rationalFields = document.getElementById("rationalFields");
  const complexFields = document.getElementById("complexFields");
  const pInput = document.getElementById("pInput");
  const qInput = document.getElementById("qInput");
  const wReInput = document.getElementById("wReInput");
  const wImInput = document.getElementById("wImInput");
  const rangeInput = document.getElementById("rangeInput");
  const form = document.getElementById("branchForm");
  const exampleChips = document.getElementById("exampleChips");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const branchBanner = document.getElementById("branchBanner");
  const canvas = document.getElementById("domainCanvas");
  const legendCanvas = document.getElementById("legendCanvas");
  const renderTime = document.getElementById("renderTime");
  const branchCount = document.getElementById("branchCount");
  const branchTableBody = document.querySelector("#branchTable tbody");

  const CANVAS_SIZE = 380;
  let bounds = null;
  let currentSpec = null; // { mode, p, q, wRe, wIm }

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }
  function reduceFraction(p, q) { const g = gcd(p, q); return { p: p / g, q: q / g }; }

  function currentMode() {
    const checked = modeRow.querySelector('input[name="mode"]:checked');
    return checked ? checked.value : "log";
  }

  function updateModeFields() {
    const m = currentMode();
    rationalFields.style.display = m === "rational" ? "flex" : "none";
    complexFields.style.display = m === "complex" ? "flex" : "none";
  }
  modeRow.addEventListener("change", updateModeFields);

  function readSpec() {
    const mode = currentMode();
    if (mode === "rational") {
      const p = parseInt(pInput.value, 10), q = parseInt(qInput.value, 10);
      return { mode, p: Number.isFinite(p) ? p : 1, q: Number.isFinite(q) && q >= 1 ? q : 2 };
    }
    if (mode === "complex") {
      const wRe = parseFloat(wReInput.value), wIm = parseFloat(wImInput.value);
      return { mode, wRe: Number.isFinite(wRe) ? wRe : 0.5, wIm: Number.isFinite(wIm) ? wIm : 0 };
    }
    return { mode: "log" };
  }

  // evalFn(re, im) -> {re, im} | throws — same contract DomainColoring.render expects.
  function makeEvalFn(spec) {
    if (spec.mode === "log") return (re, im) => Complex.log({ re, im });
    if (spec.mode === "rational") return (re, im) => Complex.pow({ re, im }, { re: spec.p / spec.q, im: 0 });
    return (re, im) => Complex.pow({ re, im }, { re: spec.wRe, im: spec.wIm });
  }

  function renderBanner(spec) {
    const base = `Principal branch: <span class="k0">Arg(z) ∈ (−π, π]</span>. Branch cut: the negative real axis (z ≤ 0) — the value is undefined exactly at z = 0 and jumps discontinuously crossing z < 0.`;
    if (spec.mode === "log") {
      branchBanner.innerHTML = `${base}<br/>log(z) has <b>infinitely many</b> branches: log(z) + 2πik for every integer k. This page returns k = 0.`;
    } else if (spec.mode === "rational") {
      const { p, q } = reduceFraction(spec.p, spec.q);
      branchBanner.innerHTML = `${base}<br/>z^(${spec.p}/${spec.q}) has exactly <b>${q}</b> distinct branch${q === 1 ? "" : "es"} (reduced exponent ${p}/${q}) — the same count, and for p=1 the same values, as the ${q}th roots of unity on the Complex Arithmetic page. This page returns branch k = 0.`;
    } else {
      branchBanner.innerHTML = `${base}<br/>z^w for a complex or irrational w has <b>infinitely many</b> distinct branches (each k gives a genuinely different value, not just a relabelling). This page returns k = 0.`;
    }
  }

  function compute() {
    const spec = readSpec();
    currentSpec = spec;
    const evalFn = makeEvalFn(spec);

    const range = parseFloat(rangeInput.value);
    bounds = { xmin: -range, xmax: range, ymin: -range, ymax: range };

    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";
    renderBanner(spec);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(CANVAS_SIZE * dpr);
    canvas.width = size; canvas.height = size;
    canvas.style.width = CANVAS_SIZE + "px"; canvas.style.height = CANVAS_SIZE + "px";
    const ctx = canvas.getContext("2d");

    const t0 = performance.now();
    DomainColoring.render(ctx, evalFn, bounds, { mode: "modulus" });
    const elapsed = performance.now() - t0;
    renderTime.textContent = `${size}×${size} px in ${elapsed.toFixed(0)} ms`;

    drawLegend();
    probeAt(Math.max(1, range * 0.4), Math.max(1, range * 0.4) * 0.6);

    canvas.onclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
      const re = bounds.xmin + ((bounds.xmax - bounds.xmin) * px) / (canvas.width - 1);
      const im = bounds.ymax - ((bounds.ymax - bounds.ymin) * py) / (canvas.height - 1);
      probeAt(re, im);
    };
  }

  function drawLegend() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(120 * dpr);
    legendCanvas.width = size; legendCanvas.height = size;
    legendCanvas.style.width = "120px"; legendCanvas.style.height = "120px";
    const ctx = legendCanvas.getContext("2d");
    DomainColoring.renderLegend(ctx, size / 2, size / 2, size / 2 - 2 * dpr);
  }

  function probeAt(re, im) {
    const spec = currentSpec;
    if (!spec) return;
    const z0 = { re, im };
    if (z0.re === 0 && z0.im === 0) { branchCount.textContent = "z = 0 — every branch is undefined here."; branchTableBody.innerHTML = ""; return; }

    let rows = [];
    if (spec.mode === "log") {
      branchCount.textContent = `z = ${Complex.format(z0, 4)} — showing 5 of infinitely many branches.`;
      for (let k = -2; k <= 2; k++) {
        const v = Complex.logBranch(z0, k);
        const back = Complex.exp(v);
        rows.push({ k, value: v, check: `e^(value) = ${Complex.format(back, 4)}` });
      }
    } else if (spec.mode === "rational") {
      const { q } = reduceFraction(spec.p, spec.q);
      branchCount.textContent = `z = ${Complex.format(z0, 4)} — exactly ${q} distinct branch${q === 1 ? "" : "es"}.`;
      const zp = Complex.powInt(z0, spec.p);
      for (let k = 0; k < q; k++) {
        const v = Complex.powBranch(z0, { re: spec.p / spec.q, im: 0 }, k);
        const backQ = Complex.powInt(v, q);
        rows.push({ k, value: v, check: `value^${q} = ${Complex.format(backQ, 4)} (z^${spec.p} = ${Complex.format(zp, 4)})` });
      }
    } else {
      branchCount.textContent = `z = ${Complex.format(z0, 4)} — showing 5 of infinitely many branches.`;
      const principal = Complex.powBranch(z0, { re: spec.wRe, im: spec.wIm }, 0);
      for (let k = -2; k <= 2; k++) {
        const v = Complex.powBranch(z0, { re: spec.wRe, im: spec.wIm }, k);
        const ratio = Complex.div(v, principal);
        rows.push({ k, value: v, check: k === 0 ? "principal value" : `÷ principal = ${Complex.format(ratio, 4)}` });
      }
    }

    branchTableBody.innerHTML = rows
      .map((r) => `<tr class="${r.k === 0 ? "is-current" : ""}"><td>${r.k}${r.k === 0 ? " (returned)" : ""}</td><td>${Complex.format(r.value, 5)}</td><td>${r.check}</td></tr>`)
      .join("");
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); compute(); });

  exampleChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const mode = chip.dataset.mode;
    modeRow.querySelector(`input[name="mode"][value="${mode}"]`).checked = true;
    if (mode === "rational") { pInput.value = chip.dataset.p; qInput.value = chip.dataset.q; }
    if (mode === "complex") { wReInput.value = chip.dataset.wre; wImInput.value = chip.dataset.wim; }
    updateModeFields();
    compute();
  });

  updateModeFields();
  compute();
})();
