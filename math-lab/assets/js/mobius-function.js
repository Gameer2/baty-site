/* Möbius function & inversion — DOM wiring. Computes μ(n), ω(n), Ω(n), λ(n) from one
   factorisation, and explains the square-free / parity logic behind each. */
(function () {
  "use strict";

  const nInput = document.getElementById("nInput");
  const form = document.getElementById("mobForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statMu = document.getElementById("statMu");
  const statOmega = document.getElementById("statOmega");
  const statOmegaTotal = document.getElementById("statOmegaTotal");
  const statLambda = document.getElementById("statLambda");
  const factorList = document.getElementById("factorList");
  const squareFreeNote = document.getElementById("squareFreeNote");
  const mobBlock = document.getElementById("mobBlock");
  const mobNote = document.getElementById("mobNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { nInput.value = "12"; clearError(); });

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

    const f = NumberTheory.factorizeFull(n);
    const mu = NumberTheory.mobius(n);
    const omega = NumberTheory.omegaDistinct(n);
    const omegaT = NumberTheory.omegaTotal(n);
    const lambda = NumberTheory.liouville(n);
    const squareFree = f.factors.every((fac) => fac.e === 1n);

    statMu.textContent = mu.toString();
    statOmega.textContent = omega.toString();
    statOmegaTotal.textContent = omegaT.toString();
    statLambda.textContent = lambda.toString();

    factorList.innerHTML = f.factors.map((fac) => fac.e === 1n ? `<div class="nt-factor-row"><span class="pf">${fac.p}</span></div>` : `<div class="nt-factor-row"><span class="pf">${fac.p}<span class="pe">^${fac.e}</span></span></div>`).join("");
    squareFreeNote.textContent = n === 1n
      ? "1 is square-free by convention (no prime factors)."
      : squareFree ? `${n} is square-free: every prime appears exactly once.`
      : `${n} is NOT square-free — a prime repeats (an exponent ≥ 2) — so μ = 0 and Liouville ≠ μ is possible.`;

    if (n === 1n) {
      Engine.renderKatex(mobBlock, "\\mu(1)=1,\\quad \\omega(1)=0,\\quad \\Omega(1)=0,\\quad \\lambda(1)=1", true);
      mobNote.textContent = "1 is the empty product: square-free with zero prime factors (even), so μ = λ = +1 and both ω and Ω are 0.";
      return;
    }
    Engine.renderKatex(mobBlock, `\\mu(${n})=${mu},\\quad \\omega(${n})=${omega},\\quad \\Omega(${n})=${omegaT},\\quad \\lambda(${n})=${lambda}`, true);
    let note = `ω counts DISTINCT primes (${omega}); Ω counts WITH multiplicity (${omegaT}). They agree only when n is square-free. μ = ${mu}: ${squareFree ? (omega % 2n === 0n ? "even number of distinct primes → +1" : "odd number of distinct primes → −1") : "not square-free → 0"}. Liouville λ = (−1)^Ω = ${lambda} always (it never goes to 0).`;
    mobNote.textContent = note;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let n;
    try { n = parseInput(nInput.value); } catch (err) { return showError(err.message); }
    render(n);
    Proto.saveState("engine-lab:number-theory-mobius-function", { n: nInput.value });
  });

  const saved = Proto.loadState("engine-lab:number-theory-mobius-function");
  if (saved) {
    if (saved.n !== undefined) nInput.value = saved.n;
    form.requestSubmit();
  }
})();