/* Continued fractions of √D — DOM wiring. Shows the periodic expansion and a convergent table
   with the exact Pell residual |p² − D·q²| per row (the integer that signals a Pell solution),
   plus a page-side decimal of p/q computed by BigInt long division (display only). */
(function () {
  "use strict";

  const dInput = document.getElementById("dInput");
  const countInput = document.getElementById("countInput");
  const form = document.getElementById("cfForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statA0 = document.getElementById("statA0");
  const statPeriod = document.getElementById("statPeriod");
  const cfBlock = document.getElementById("cfBlock");
  const cfNote = document.getElementById("cfNote");
  const convTable = document.getElementById("convTable");
  const convNote = document.getElementById("convNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { dInput.value = "2"; countInput.value = "8"; clearError(); });

  function parseInput(raw, label) {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) throw new Error(`${label} must be a non-negative integer.`);
    return BigInt(s);
  }

  // Page-side exact decimal of p/q to `digits` places, via BigInt long division. Display only —
  // the module itself never touches decimal.
  function toDecimal(p, q, digits) {
    const sign = p < 0n ? "-" : "";
    p = p < 0n ? -p : p;
    const intPart = p / q;
    let rem = p - intPart * q;
    let frac = "";
    for (let i = 0; i < digits && rem !== 0n; i++) { rem *= 10n; frac += String(rem / q); rem -= (rem / q) * q; }
    return frac ? `${sign}${intPart}.${frac}` : `${sign}${intPart}`;
  }

  function render(D, count) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const cf = NumberTheory.continuedFractionSqrt(D);
    if (cf.perfectSquare) {
      statA0.textContent = String(cf.a0);
      statPeriod.textContent = "0 (square)";
      Engine.renderKatex(cfBlock, `\\sqrt{${D}} = ${cf.a0}`, true);
      cfNote.textContent = `D = ${D} is a perfect square, so √D is the integer ${cf.a0} — its continued fraction terminates immediately with no period. There is nothing irrational to approximate and no Pell equation to solve. Choose a non-square D.`;
      convTable.innerHTML = "";
      convNote.textContent = "";
      return;
    }

    const a0 = cf.a0, period = cf.period;
    statA0.textContent = String(a0);
    statPeriod.textContent = String(period.length);

    const periodLatex = period.length ? `${period.join(", ")}, \\overline{\\,${period.join(", ")}\\,}` : "";
    const firstShown = `${a0}; ${period.join(", ")}, ${period.join(", ")}, \\ldots`;
    Engine.renderKatex(cfBlock, `\\sqrt{${D}} = [${firstShown}] = [${a0}; \\, \\overline{${period.join(", ")}}]`, true);
    cfNote.textContent = `The expansion is periodic with period ${period.length} (ending in the doubled term 2a₀ = ${2n * a0}). Lagrange's theorem guarantees this for every non-square D; the engine found it by running the standard (m, d, a) recurrence until the term 2a₀ reappears.`;

    const convs = NumberTheory.convergents(a0, period, count);
    let html = `<div class="nt-convergent-row"><span class="ci">n</span><span class="ci">pₙ</span><span class="ci">qₙ</span><span class="ci">pₙ² − D·qₙ²</span></div>`;
    for (let i = 0; i < convs.length; i++) {
      const { p, q } = convs[i];
      const residual = p * p - D * q * q;
      const cls = residual === 1n ? "ok" : residual === -1n ? "ok" : "";
      html += `<div class="nt-convergent-row"><span>${i}</span><span>${p}</span><span>${q}</span><span class="${cls}">${residual > 0n ? "+" : ""}${residual}</span></div>`;
    }
    html += "</div>";
    convTable.innerHTML = html;

    const best = convs.map((c) => toDecimal(c.p, c.q, 12));
    const last = convs[convs.length - 1];
    const lastDec = toDecimal(last.p, last.q, 14);
    convNote.textContent = `Each convergent pₙ/qₙ is a best rational approximation to √${D} at its denominator size; they alternate above and below √${D} and converge faster than any other fraction with the same or smaller q. The last shown, ${last.p}/${last.q} ≈ ${lastDec}, squares to ${toDecimal(last.p * last.p, last.q * last.q, 4)}. The right-hand column is the exact Pell residual pₙ² − ${D}·qₙ²: whenever it reads +1, that convergent is a solution of x² − ${D}·y² = 1 — see the Pell's Equation page.`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let D, count;
    try { D = parseInput(dInput.value, "D"); count = Number(parseInput(countInput.value, "count")); } catch (err) { return showError(err.message); }
    if (D < 2n) return showError("D must be at least 2.");
    if (count < 1 || count > 60) return showError("Show between 1 and 60 convergents.");
    render(D, count);
    Proto.saveState("engine-lab:number-theory-continued-fractions", { D: dInput.value });
  });

  const saved = Proto.loadState("engine-lab:number-theory-continued-fractions");
  if (saved) {
    if (saved.D !== undefined) dInput.value = saved.D;
    form.requestSubmit();
  }
})();