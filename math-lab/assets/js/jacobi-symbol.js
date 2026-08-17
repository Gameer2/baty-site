/* Jacobi symbol — DOM wiring. Computes (a/n) by the reciprocity-based algorithm (no factoring),
   then factors n and shows the SAME value as a product of Legendre symbols ∏(a/pᵢ)^eᵢ.
   Makes the composite-n trap explicit: (a/n)=+1 does not imply a is a square mod n. */
(function () {
  "use strict";

  const aInput = document.getElementById("aInput");
  const nInput = document.getElementById("nInput");
  const form = document.getElementById("jacForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statJac = document.getElementById("statJac");
  const statPrime = document.getElementById("statPrime");
  const jacBlock = document.getElementById("jacBlock");
  const jacNote = document.getElementById("jacNote");
  const prodBlock = document.getElementById("prodBlock");
  const prodNote = document.getElementById("prodNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { aInput.value = "2"; nInput.value = "9"; clearError(); });

  function parseInput(raw, label) {
    const s = String(raw).trim();
    if (!/^-?\d+$/.test(s)) throw new Error(`${label} must be an integer.`);
    return BigInt(s);
  }

  function sym(v) { return v === 1n ? "+1" : v === -1n ? "-1" : "0"; }

  function render(a, n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const jac = NumberTheory.jacobiSymbol(a, n);
    statJac.textContent = sym(jac);
    statJac.parentElement.classList.toggle("accent", jac === 1n);

    const isPrime = NumberTheory.millerRabin(n).prime;
    statPrime.textContent = isPrime ? "yes" : "no (composite)";

    Engine.renderKatex(jacBlock, `\\left(\\frac{${a}}{${n}}\\right) = ${sym(jac)}`, true);

    if (isPrime) {
      jacNote.textContent = `n = ${n} is prime, so the Jacobi symbol IS the Legendre symbol — and here ${jac === 1n ? "a IS a square mod n" : jac === -1n ? "a is NOT a square mod n" : "n divides a"}. For prime n the symbol is a perfect square-test.`;
    } else if (jac === 1n) {
      jacNote.textContent = `n = ${n} is COMPOSITE and (a/n) = +1 — yet this does NOT mean a is a square mod n. The Jacobi symbol only says the product of the per-prime Legendre symbols is +1; an even number of −1 factors cancels to +1 while a is still a non-residue at every one of them. This is exactly why the Solovay–Strassen primality test works: for composite n there always exists an a with (a/n) ≠ a^((n−1)/2) mod n.`;
    } else if (jac === -1n) {
      jacNote.textContent = `n = ${n} is composite and (a/n) = −1 — so a is definitely NOT a square mod n (an odd number of per-prime −1 factors). The −1 case is safe in both directions; only +1 on composite n is ambiguous.`;
    } else {
      jacNote.textContent = `(a/n) = 0 because gcd(a, n) ≠ 1.`;
    }

    // Product-of-Legendre demonstration: (a/n) = ∏ (a/pᵢ)^eᵢ.
    const f = NumberTheory.factorizeFull(n);
    if (!f.ok) {
      prodNote.textContent = `Could not fully factor n = ${n} within the operation budget, so the Legendre-product view is unavailable here. The Jacobi value above was still computed without factoring — that speed is the whole point.`;
      Engine.renderKatex(prodBlock, `\\text{(factorization incomplete)}}`, false);
      return;
    }

    const terms = [];
    let prod = 1n;
    for (const fac of f.factors) {
      const leg = NumberTheory.legendreSymbol(a, fac.p);
      const powered = leg === 0n ? 0n : (fac.e % 2n === 0n ? 1n : leg);
      prod *= powered;
      const base = `\\left(\\tfrac{${a}}{${fac.p}}\\right)`;
      terms.push(fac.e === 1n ? `${base}^{\\,{${sym(leg)}}}` : `${base}^{${fac.e}\\cdot${sym(leg)}}`);
    }
    const prodLatex = `\\left(\\frac{${a}}{${n}}\\right) = \\prod_i \\left(\\frac{${a}}{p_i}\\right)^{e_i} = ${terms.join(" \\cdot ")} = ${sym(prod)}`;
    Engine.renderKatex(prodBlock, prodLatex, true);

    const agree = prod === jac;
    prodNote.textContent = agree
      ? `The product of the per-prime Legendre symbols equals ${sym(prod)} — agreeing with the direct Jacobi computation ${sym(jac)}. The reciprocity algorithm reaches the same answer without ever factoring n, which is why it scales to n with hundreds of digits while the product view does not. (The Kronecker symbol generalises this further to even and negative n.)`
      : `Mismatch between product (${sym(prod)}) and Jacobi (${sym(jac)}) — this should not happen; please report it.`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let a, n;
    try { a = parseInput(aInput.value, "a"); n = parseInput(nInput.value, "n"); } catch (err) { return showError(err.message); }
    if (n <= 0n) return showError("n must be a positive integer.");
    if (n % 2n === 0n) return showError("n must be odd — the Jacobi symbol is defined for odd positive n only.");
    if (n === 1n) return showError("n = 1 is trivial ((a/1) = 1 for all a); choose an odd n > 1.");
    render(a, n);
    Proto.saveState("engine-lab:number-theory-jacobi-symbol", { a: aInput.value, n: nInput.value });
  });

  const saved = Proto.loadState("engine-lab:number-theory-jacobi-symbol");
  if (saved) {
    if (saved.a !== undefined) aInput.value = saved.a;
    if (saved.n !== undefined) nInput.value = saved.n;
    form.requestSubmit();
  }
})();