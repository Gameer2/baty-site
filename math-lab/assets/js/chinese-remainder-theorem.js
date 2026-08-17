/* Chinese Remainder Theorem — DOM wiring. Parses comma-separated residues and moduli, runs the
   consistent (non-coprime-tolerant) CRT, and reports the unique solution or a consistency error. */
(function () {
  "use strict";

  const rInput = document.getElementById("rInput");
  const mInput = document.getElementById("mInput");
  const form = document.getElementById("crtForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statX = document.getElementById("statX");
  const statM = document.getElementById("statM");
  const statCoprime = document.getElementById("statCoprime");
  const crtBlock = document.getElementById("crtBlock");
  const crtNote = document.getElementById("crtNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { rInput.value = "3, 1"; mInput.value = "6, 4"; clearError(); });

  function parseList(raw, label) {
    const parts = String(raw).split(",").map((s) => s.trim()).filter((s) => s.length);
    if (!parts.length) throw new Error(`${label} must not be empty.`);
    return parts.map((s) => {
      if (!/^-?\d+$/.test(s)) throw new Error(`${label}: "${s}" is not an integer.`);
      return BigInt(s);
    });
  }

  function render(residues, moduli) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    // pairwise coprime check (for display)
    let coprime = true;
    for (let i = 0; i < moduli.length; i++) for (let j = i + 1; j < moduli.length; j++) {
      if (NumberTheory.gcd(moduli[i], moduli[j]) !== 1n) coprime = false;
    }
    statCoprime.textContent = coprime ? "yes" : "no";

    const r = NumberTheory.crt(residues, moduli);
    if (!r.ok) {
      statX.textContent = "no solution";
      statM.textContent = "—";
      const system = residues.map((rr, i) => `x \\equiv ${rr} \\pmod{${moduli[i]}}`).join(",\\quad ");
      Engine.renderKatex(crtBlock, `${system} \\quad\\Rightarrow\\quad \\text{no solution}`, true);
      crtNote.textContent = `Inconsistent system: ${r.reason}. When moduli share a factor, the residues must agree modulo that factor — here they don't, so no integer x satisfies all of them at once.`;
      return;
    }
    statX.textContent = r.x.toString();
    statM.textContent = r.modulus.toString();
    const system = residues.map((rr, i) => `x \\equiv ${rr} \\pmod{${moduli[i]}}`).join(",\\quad ");
    Engine.renderKatex(crtBlock, `${system} \\quad\\Rightarrow\\quad x \\equiv ${r.x} \\pmod{${r.modulus}}`, true);
    crtNote.textContent = coprime
      ? `Moduli are pairwise coprime, so the solution is unique mod ${r.modulus} = ${moduli.join("·")}.`
      : `Moduli are not coprime, but the residues are consistent, so a solution still exists — unique mod lcm(${moduli.join(", ")}) = ${r.modulus}.`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let residues, moduli;
    try { residues = parseList(rInput.value, "residues"); moduli = parseList(mInput.value, "moduli"); } catch (err) { return showError(err.message); }
    if (residues.length !== moduli.length) return showError(`residues (${residues.length}) and moduli (${moduli.length}) must have the same length.`);
    for (const m of moduli) if (m <= 0n) return showError("all moduli must be positive.");
    render(residues, moduli);
    Proto.saveState("engine-lab:number-theory-chinese-remainder-theorem", { residues: rInput.value, moduli: mInput.value });
  });

  const saved = Proto.loadState("engine-lab:number-theory-chinese-remainder-theorem");
  if (saved) {
    if (saved.residues !== undefined) rInput.value = saved.residues;
    if (saved.moduli !== undefined) mInput.value = saved.moduli;
    form.requestSubmit();
  }
})();