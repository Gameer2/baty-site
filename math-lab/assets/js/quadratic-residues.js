/* Quadratic residues & Legendre symbol — DOM wiring. Lists the QRs mod p, evaluates (a/p) via
   Euler's criterion, and computes the modular square root (Tonelli–Shanks) when a is a residue. */
(function () {
  "use strict";

  const pInput = document.getElementById("pInput");
  const aInput = document.getElementById("aInput");
  const form = document.getElementById("qrForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statLegendre = document.getElementById("statLegendre");
  const statCount = document.getElementById("statCount");
  const statRoot = document.getElementById("statRoot");
  const qrList = document.getElementById("qrList");
  const qrNote = document.getElementById("qrNote");
  const qrBlock = document.getElementById("qrBlock");
  const qrANote = document.getElementById("qrANote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { pInput.value = "13"; aInput.value = "10"; clearError(); });

  function parseInput(raw, label) {
    const s = String(raw).trim();
    if (!/^-?\d+$/.test(s)) throw new Error(`${label} must be an integer.`);
    return BigInt(s);
  }

  function render(p, a) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    if (!NumberTheory.millerRabin(p).prime || p === 2n) return; // guarded by submit
    const leg = NumberTheory.legendreSymbol(a, p);
    const qrs = NumberTheory.quadraticResidues(p);
    statLegendre.textContent = leg === 1n ? "+1 (residue)" : leg === -1n ? "−1 (non-residue)" : "0 (p | a)";
    statLegendre.parentElement.classList.toggle("accent", leg === 1n);
    statCount.textContent = String(qrs.length);
    qrList.innerHTML = qrs.map((q) => `<span class="pipe is-accent">${q}</span>`).join("");
    qrNote.textContent = `${qrs.length} quadratic residues mod ${p} — exactly (p−1)/2 = ${(p - 1n) / 2n} of the ${p - 1n} non-zero residues are squares.`;

    const eul = NumberTheory.modPow(a, (p - 1n) / 2n, p);
    Engine.renderKatex(qrBlock, `\\left(\\tfrac{${a}}{${p}}\\right) = ${a}^{\\frac{${p}-1}{2}} \\bmod ${p} = ${eul} \\;\\Rightarrow\\; ${leg === 1n ? "+1 \\text{ (QR)}" : leg === -1n ? "-1 \\text{ (non-residue)}" : "0"}`, true);

    if (leg === 1n) {
      const root = NumberTheory.tonelliShanks(a, p);
      statRoot.textContent = root === null ? "—" : `±${root}`;
      qrANote.textContent = `a = ${a} IS a quadratic residue mod ${p}: ${root}² ≡ ${(root * root) % p} ≡ ${a} (mod ${p}). The other root is ${p - root}.`;
    } else if (leg === -1n) {
      statRoot.textContent = "none";
      qrANote.textContent = `a = ${a} is a NON-residue mod ${p}: no integer squares to ${a} mod ${p}, so a^(½) mod p does not exist.`;
    } else {
      statRoot.textContent = "0";
      qrANote.textContent = `a = ${a} is divisible by ${p}, so the residue is 0.`;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let p, a;
    try { p = parseInput(pInput.value, "p"); a = parseInput(aInput.value, "a"); } catch (err) { return showError(err.message); }
    if (p <= 2n) return showError("p must be an odd prime greater than 2.");
    if (!NumberTheory.millerRabin(p).prime) return showError(`${p} is not prime — the Legendre symbol is defined for an odd prime p.`);
    render(p, a);
  });
})();