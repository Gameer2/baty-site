/* Discrete logarithm — DOM wiring. Solves g^x ≡ h (mod n) via baby-step giant-step, reporting the
   solution, the table size m = ⌈√n⌉, and the giant steps consumed. Reports "not found" honestly. */
(function () {
  "use strict";

  const gInput = document.getElementById("gInput");
  const hInput = document.getElementById("hInput");
  const nInput = document.getElementById("nInput");
  const form = document.getElementById("dlForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statX = document.getElementById("statX");
  const statBaby = document.getElementById("statBaby");
  const statGiant = document.getElementById("statGiant");
  const dlBlock = document.getElementById("dlBlock");
  const dlNote = document.getElementById("dlNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { gInput.value = "2"; hInput.value = "3"; nInput.value = "5"; clearError(); });

  function parseInput(raw, label) {
    const s = String(raw).trim();
    if (!/^-?\d+$/.test(s)) throw new Error(`${label} must be an integer.`);
    return BigInt(s);
  }

  function render(g, h, n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const r = NumberTheory.discreteLog(g, h, n, { maxSteps: 200000 });
    statBaby.textContent = NumberTheory.isqrt(n).toString();

    if (!r.ok) {
      statX.textContent = "not found";
      statGiant.textContent = "—";
      statX.parentElement.classList.remove("accent");
      Engine.renderKatex(dlBlock, `${g}^x \\equiv ${h} \\pmod{${n}} \\quad\\Rightarrow\\quad \\text{no solution}`, true);
      dlNote.textContent = `${r.reason}. When g is not a primitive root, h may simply not lie in the cyclic subgroup that g generates — then no x exists, and that's a legitimate answer, not a failure of the algorithm.`;
      return;
    }
    statX.textContent = r.x.toString();
    statX.parentElement.classList.add("accent");
    statGiant.textContent = r.giantSteps.toString();
    Engine.renderKatex(dlBlock, `${g}^{${r.x}} \\equiv ${NumberTheory.modPow(g, r.x, n)} \\equiv ${h} \\pmod{${n}}`, true);
    dlNote.textContent = `Found in ${r.babySteps} baby steps (the table of g^j) plus ${r.giantSteps} giant steps (multiplying h by g^(−m) and checking the table). Total work ~2√n ≈ ${Number(r.babySteps) + Number(r.giantSteps)}, far below the n−1 a brute-force search would take.`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let g, h, n;
    try { g = parseInput(gInput.value, "g"); h = parseInput(hInput.value, "h"); n = parseInput(nInput.value, "n"); } catch (err) { return showError(err.message); }
    if (n <= 0n) return showError("n must be a positive modulus.");
    render(g, h, n);
  });
})();