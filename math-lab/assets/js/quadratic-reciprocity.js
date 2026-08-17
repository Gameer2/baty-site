/* Quadratic reciprocity — DOM wiring. Computes (p/q) and (q/p) by Euler's criterion and checks
   them against the reciprocity sign (−1)^((p−1)(q−1)/4). Demonstrates; does not claim to prove. */
(function () {
  "use strict";

  const pInput = document.getElementById("pInput");
  const qInput = document.getElementById("qInput");
  const form = document.getElementById("recForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statProduct = document.getElementById("statProduct");
  const statPQ = document.getElementById("statPQ");
  const statQP = document.getElementById("statQP");
  const statSign = document.getElementById("statSign");
  const recBlock = document.getElementById("recBlock");
  const recNote = document.getElementById("recNote");
  const eulerBlock = document.getElementById("eulerBlock");
  const eulerNote = document.getElementById("eulerNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { pInput.value = "13"; qInput.value = "17"; clearError(); });

  function parseInput(raw, label) {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) throw new Error(`${label} must be a positive integer.`);
    return BigInt(s);
  }

  function render(p, q) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const pq = NumberTheory.legendreSymbol(p, q);
    const qp = NumberTheory.legendreSymbol(q, p);
    const product = pq * qp;
    const sign = ((p - 1n) * (q - 1n) / 4n) % 2n === 0n ? 1n : -1n;

    statPQ.textContent = pq === 1n ? "+1" : "−1";
    statQP.textContent = qp === 1n ? "+1" : "−1";
    statProduct.textContent = product === 1n ? "+1" : "−1";
    statProduct.parentElement.classList.add("accent");
    statSign.textContent = sign === 1n ? "+1" : "−1";

    Engine.renderKatex(recBlock, `\\left(\\tfrac{${p}}{${q}}\\right)\\left(\\tfrac{${q}}{${p}}\\right) = (${pq === 1n ? "+1" : "-1"})(${qp === 1n ? "+1" : "-1"}) = ${product === 1n ? "+1" : "-1"} = (-1)^{\\frac{(${p}-1)(${q}-1)}{4}} = ${sign === 1n ? "+1" : "-1"}`, true);
    const agrees = product === sign;
    recNote.textContent = agrees
      ? `Reciprocity holds: the product of the symbols equals (−1)^((p−1)(q−1)/4) = ${sign === 1n ? "+1" : "−1"}. ${sign === 1n ? "Both primes are ≡ 1 mod 4, or both ≡ 3 mod 4 — the symbols agree." : "One prime is ≡ 1 mod 4 and the other ≡ 3 mod 4 — the symbols are opposite."} This is a *demonstration*, not a proof: the engine evaluates each symbol by Euler's criterion and observes the law, the way a calculator checks (but does not establish) a theorem.`
      : `Reciprocity law violated — this should not happen for distinct odd primes; please report it.`;

    const e1 = NumberTheory.modPow(p, (q - 1n) / 2n, q);
    const e2 = NumberTheory.modPow(q, (p - 1n) / 2n, p);
    Engine.renderKatex(eulerBlock, `\\left(\\tfrac{${p}}{${q}}\\right) \\equiv ${p}^{\\frac{${q}-1}{2}} \\equiv ${e1} \\pmod{${q}}, \\qquad \\left(\\tfrac{${q}}{${p}}\\right) \\equiv ${q}^{\\frac{${p}-1}{2}} \\equiv ${e2} \\pmod{${p}}`, true);
    eulerNote.textContent = `Euler's criterion turns each Legendre symbol into a single modular exponentiation: a^((p−1)/2) is +1 if a is a QR mod p and −1 (i.e. p−1) otherwise. That is the computational path Gauss's proof ultimately rests on.`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let p, q;
    try { p = parseInput(pInput.value, "p"); q = parseInput(qInput.value, "q"); } catch (err) { return showError(err.message); }
    if (p === q) return showError("p and q must be distinct primes.");
    if (p === 2n || q === 2n) return showError("Both primes must be odd (reciprocity is for odd primes).");
    if (!NumberTheory.millerRabin(p).prime) return showError(`${p} is not prime.`);
    if (!NumberTheory.millerRabin(q).prime) return showError(`${q} is not prime.`);
    render(p, q);
    Proto.saveState("engine-lab:number-theory-quadratic-reciprocity", { p: pInput.value, q: qInput.value });
  });

  const saved = Proto.loadState("engine-lab:number-theory-quadratic-reciprocity");
  if (saved) {
    if (saved.p !== undefined) pInput.value = saved.p;
    if (saved.q !== undefined) qInput.value = saved.q;
    form.requestSubmit();
  }
})();