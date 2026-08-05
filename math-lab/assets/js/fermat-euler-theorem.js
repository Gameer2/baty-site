/* Fermat's little & Euler's theorem — DOM wiring. Computes φ(n), checks primality of n and
   coprimality of (a,n), then demonstrates each theorem (or explains why it doesn't apply). */
(function () {
  "use strict";

  const aInput = document.getElementById("aInput");
  const nInput = document.getElementById("nInput");
  const form = document.getElementById("feForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statPhi = document.getElementById("statPhi");
  const statPrime = document.getElementById("statPrime");
  const statGcd = document.getElementById("statGcd");
  const fermatBlock = document.getElementById("fermatBlock");
  const fermatNote = document.getElementById("fermatNote");
  const eulerBlock = document.getElementById("eulerBlock");
  const eulerNote = document.getElementById("eulerNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { aInput.value = "3"; nInput.value = "9"; clearError(); });

  function parseInput(raw, label) {
    const s = String(raw).trim();
    if (!/^-?\d+$/.test(s)) throw new Error(`${label} must be an integer.`);
    return BigInt(s);
  }

  function render(a, n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const phi = NumberTheory.totient(n);
    const isPrime = NumberTheory.millerRabin(n).prime;
    const g = NumberTheory.gcd(a, n);
    statPhi.textContent = phi.toString();
    statPrime.textContent = isPrime ? "yes" : "no";
    statGcd.textContent = g.toString();

    // Fermat
    const f = NumberTheory.fermatLittleCheck(a, n);
    if (f.applies) {
      Engine.renderKatex(fermatBlock, `${a}^{${n}-1} \\equiv ${f.value} \\pmod{${n}}`, true);
      fermatNote.textContent = `${n} is prime, so Fermat's little theorem applies${a % n === 0n ? " (with a a multiple of p)" : ""}: ${f.equation}. ${f.value === 1n ? "Confirmed — a^(p−1) ≡ 1." : ""}`;
    } else {
      Engine.renderKatex(fermatBlock, `\\text{Fermat does not apply: } ${n} \\text{ is not prime}`, true);
      fermatNote.textContent = `${f.reason}. Euler's theorem (below) is the general form that still works for composite n.`;
    }

    // Euler
    const e = NumberTheory.eulerTheoremCheck(a, n);
    if (e.applies) {
      Engine.renderKatex(eulerBlock, `${a}^{\\varphi(${n})} = ${a}^{${phi}} \\equiv ${e.value} \\pmod{${n}}`, true);
      eulerNote.textContent = `gcd(a, n) = 1, so Euler's theorem applies: ${e.equation}. ${e.equalsOne ? "Confirmed — a^φ(n) ≡ 1." : ""} ${isPrime ? "(Since n is prime, φ(n) = n−1, and this reduces to Fermat.)" : ""}`;
    } else {
      Engine.renderKatex(eulerBlock, `\\text{Euler does not apply: } \\gcd(${a}, ${n}) = ${g} \\neq 1`, true);
      eulerNote.textContent = `${e.reason}. When a and n share a factor, a is not a unit mod n and a^φ(n) need not be 1.`;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let a, n;
    try { a = parseInput(aInput.value, "a"); n = parseInput(nInput.value, "n"); } catch (err) { return showError(err.message); }
    if (n < 1n) return showError("n must be at least 1.");
    render(a, n);
  });
})();