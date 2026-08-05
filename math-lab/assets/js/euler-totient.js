/* Euler's totient — DOM wiring. Factorises n, then builds φ from the product formula
   φ(n) = n · ∏(1 − 1/p), showing the per-prime term. */
(function () {
  "use strict";

  const nInput = document.getElementById("nInput");
  const form = document.getElementById("phiForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statPhi = document.getElementById("statPhi");
  const statOmega = document.getElementById("statOmega");
  const statN = document.getElementById("statN");
  const factorList = document.getElementById("factorList");
  const phiBlock = document.getElementById("phiBlock");
  const phiNote = document.getElementById("phiNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { nInput.value = "1000"; clearError(); });

  function parseInput(raw) {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) throw new Error("n must be a non-negative integer.");
    const v = BigInt(s);
    if (v < 1n) throw new Error("n must be at least 1.");
    return v;
  }

  function render(n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const phi = NumberTheory.totient(n);
    const f = NumberTheory.factorizeFull(n);
    statPhi.textContent = phi.toString();
    statOmega.textContent = String(f.factors.length);
    statN.textContent = n.toString();

    factorList.innerHTML = f.factors.map((fac) => fac.e === 1n ? `<div class="nt-factor-row"><span class="pf">${fac.p}</span></div>` : `<div class="nt-factor-row"><span class="pf">${fac.p}<span class="pe">^${fac.e}</span></span></div>`).join("");

    if (n === 1n) {
      Engine.renderKatex(phiBlock, "\\varphi(1) = 1", true);
      phiNote.textContent = "By convention φ(1) = 1: 1 is coprime to itself.";
      return;
    }
    // product formula: φ(n) = n · ∏(1 − 1/p) = ∏ p^(e−1)(p−1)
    const termParts = f.factors.map((fac) => `${fac.p}^{${fac.e - 1n}} \\cdot (${fac.p}-1)`);
    const productLatex = termParts.join(" \\cdot ");
    Engine.renderKatex(phiBlock, `\\varphi(${n}) = ${n} \\cdot \\prod_{p \\mid ${n}} \\left(1 - \\tfrac{1}{p}\\right) = ${productLatex} = ${phi}`, true);
    const primeList = f.factors.map((fac) => fac.p).join(", ");
    phiNote.textContent = `Distinct prime factors of ${n}: ${primeList}. Each contributes a factor (1 − 1/p); since φ is multiplicative on coprime parts, the whole product collapses to ${phi}. (For a prime p, φ(p) = p − 1.)`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let n;
    try { n = parseInput(nInput.value); } catch (err) { return showError(err.message); }
    render(n);
  });
})();