/* Pell's equation — DOM wiring. Solves x² − D·y² = 1 via the continued fraction of √D, verifies
   the fundamental solution exactly (BigInt), and explains why brute force would never have found
   it for D like 61 or 109. */
(function () {
  "use strict";

  const dInput = document.getElementById("dInput");
  const form = document.getElementById("pellForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statX = document.getElementById("statX");
  const statY = document.getElementById("statY");
  const statTerms = document.getElementById("statTerms");
  const pellBlock = document.getElementById("pellBlock");
  const pellNote = document.getElementById("pellNote");
  const pathBlock = document.getElementById("pathBlock");
  const pathNote = document.getElementById("pathNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { dInput.value = "109"; clearError(); });

  function parseInput(raw, label) {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) throw new Error(`${label} must be a non-negative integer.`);
    return BigInt(s);
  }

  function digits(n) { return String(n).length; }

  function render(D) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const sol = NumberTheory.pellSolve(D);
    if (!sol.solvable) {
      statX.textContent = "—";
      statY.textContent = "—";
      statTerms.textContent = "—";
      Engine.renderKatex(pellBlock, `x^2 - ${D}\\,y^2 = 1 \\quad \\text{for } D = ${D}`, true);
      pellNote.textContent = sol.reason;
      pathBlock.textContent = "";
      pathNote.textContent = "";
      return;
    }

    const { x, y, termsUsed, periodLength } = sol;
    const check = x * x - D * y * y;
    statX.textContent = String(x);
    statY.textContent = String(y);
    statTerms.textContent = String(termsUsed);
    statX.parentElement.classList.add("accent");

    Engine.renderKatex(pellBlock, `x = ${x}, \\quad y = ${y} \\quad \\Longrightarrow \\quad ${x}^2 - ${D}\\cdot ${y}^2 = ${x * x} - ${D * y * y} = ${check}`, true);
    pellNote.textContent = `Verified exactly: ${x}² − ${D}·${y}² = ${x * x} − ${D * y * y} = ${check}. This is the *fundamental* (smallest positive, y > 0) solution — every other solution is a power of (x + y√${D}): if (x₁, y₁) is fundamental, the next is (x₁² + D·y₁², 2·x₁·y₁), and so on. Brute-forcing this by testing y = 1, 2, 3, … would need ${digits(y)}-digit values of y before landing here; the continued fraction gets there in ${termsUsed} terms.`;

    Engine.renderKatex(pathBlock, `\\sqrt{${D}} = [a_0; \\, \\overline{a_1, \\ldots, a_${periodLength}}], \\quad \\text{period length } r = ${periodLength} \\\\ \\text{scan convergents } p_n/q_n \\text{ for } n = 1, 2, \\ldots: \\text{ first } p_n^2 - ${D}\\, q_n^2 = 1 \\text{ at } n = ${termsUsed}`, true);
    pathNote.textContent = `The continued fraction of √${D} has period length r = ${periodLength}. The fundamental solution is the convergent pₙ/qₙ where pₙ² − ${D}·qₙ² = 1 first holds; for even r it lands within the first period, for odd r within the second. Here it appeared at n = ${termsUsed}. The engine never tested a square — it walked the convergents the Continued Fractions page already computed, which is the whole reason the two pages are linked.`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let D;
    try { D = parseInput(dInput.value, "D"); } catch (err) { return showError(err.message); }
    if (D < 2n) return showError("D must be at least 2.");
    render(D);
    Proto.saveState("engine-lab:number-theory-pells-equation", { D: dInput.value });
  });

  const saved = Proto.loadState("engine-lab:number-theory-pells-equation");
  if (saved) {
    if (saved.D !== undefined) dInput.value = saved.D;
    form.requestSubmit();
  }
})();