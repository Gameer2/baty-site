/* Divisor functions — DOM wiring. Generates divisors from the factorisation, computes τ and σ,
   and classifies n as deficient/perfect/abundant via the aliquot sum σ(n) − n. */
(function () {
  "use strict";

  const nInput = document.getElementById("nInput");
  const form = document.getElementById("divForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statTau = document.getElementById("statTau");
  const statSigma = document.getElementById("statSigma");
  const statClass = document.getElementById("statClass");
  const divisorList = document.getElementById("divisorList");
  const divisorNote = document.getElementById("divisorNote");
  const divBlock = document.getElementById("divBlock");
  const divNote = document.getElementById("divNote");

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

    const divs = NumberTheory.divisors(n);
    const tau = NumberTheory.tau(n);
    const sigma = NumberTheory.sigma(n);
    const cls = NumberTheory.aliquotClass(n);

    statTau.textContent = tau.toString();
    statSigma.textContent = sigma.toString();
    statClass.textContent = cls.class;
    statClass.parentElement.classList.toggle("accent", cls.class === "perfect");

    divisorList.innerHTML = divs.map((d, i) => `<span class="pipe ${d === n ? "is-warn" : i === 0 ? "is-accent" : ""}">${d}</span>`).join("");
    divisorNote.textContent = `${divs.length} divisors. The proper divisors (all but n itself) sum to the aliquot sum ${cls.sum}.`;

    const f = NumberTheory.factorizeFull(n);
    const tauLatex = f.factors.map((fac) => `(${fac.e}+1)`).join(" \\cdot ");
    const sigmaLatex = f.factors.map((fac) => `\\frac{${fac.p}^{${fac.e + 1n}}-1}{${fac.p}-1}`).join(" \\cdot ");
    Engine.renderKatex(divBlock, `\\tau(${n}) = ${tauLatex} = ${tau}, \\qquad \\sigma(${n}) = ${sigmaLatex} = ${sigma}`, true);

    let note;
    if (cls.class === "perfect") note = `${n} is PERFECT: the sum of its proper divisors (${cls.sum}) equals n itself. Only a handful are known; 6, 28, 496, 8128 are the first four, and even perfect numbers are 2^(p−1)(2^p − 1) for Mersenne primes 2^p − 1.`;
    else if (cls.class === "abundant") note = `${n} is ABUNDANT: its proper divisors (${cls.sum}) sum to more than n. Most integers are abundant once they're large enough.`;
    else note = `${n} is DEFICIENT: its proper divisors (${cls.sum}) sum to less than n. Every prime and prime power is deficient.`;
    divNote.textContent = note;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let n;
    try { n = parseInput(nInput.value); } catch (err) { return showError(err.message); }
    render(n);
  });
})();