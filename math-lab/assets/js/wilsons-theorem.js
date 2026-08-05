/* Wilson's theorem — DOM wiring. Computes (n−1)! reduced mod n exactly (BigInt) and compares
   with n−1 (i.e. −1 mod n) to read off primality. */
(function () {
  "use strict";

  const nInput = document.getElementById("nInput");
  const form = document.getElementById("wilsonForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statPrime = document.getElementById("statPrime");
  const statFactorial = document.getElementById("statFactorial");
  const statMinusOne = document.getElementById("statMinusOne");
  const wilsonBlock = document.getElementById("wilsonBlock");
  const wilsonNote = document.getElementById("wilsonNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { nInput.value = "9"; clearError(); });

  function parseInput(raw) {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) throw new Error("n must be a non-negative integer.");
    const v = BigInt(s);
    if (v < 2n) throw new Error("n must be at least 2.");
    return v;
  }

  function render(n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const r = NumberTheory.wilsonCheck(n);
    statPrime.textContent = r.prime ? "prime" : "composite";
    statPrime.parentElement.classList.toggle("accent", r.prime);
    statFactorial.textContent = r.factorial.toString();
    statMinusOne.textContent = (n - 1n).toString();

    const equals = r.factorial === (n - 1n);
    Engine.renderKatex(wilsonBlock, `(${n}-1)! \\equiv ${r.factorial} \\pmod{${n}}, \\qquad ${n}-1 = ${n - 1n} \\quad\\Rightarrow\\quad ${r.factorial === n - 1n ? "\\equiv -1" : "\\not\\equiv -1"}`, true);
    wilsonNote.textContent = `${r.note}. ${r.prime ? "Wilson's theorem fires: (n−1)! ≡ −1 (mod n) characterises the primes — but as a *primality test* it's useless, since computing (n−1)! is far harder than just checking divisibility." : "Composite n fails the test (the one exception is n = 4, where (n−1)! ≡ 2 ≡ −2, also not −1)."}`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let n;
    try { n = parseInput(nInput.value); } catch (err) { return showError(err.message); }
    render(n);
  });
})();