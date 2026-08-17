/* Linear congruences — DOM wiring. Solves ax ≡ b (mod n), reporting the gcd, the reduced class,
   and the full solution set, or a clear unsolvability reason. */
(function () {
  "use strict";

  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const nInput = document.getElementById("nInput");
  const form = document.getElementById("lcForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statSolvable = document.getElementById("statSolvable");
  const statGcd = document.getElementById("statGcd");
  const statCount = document.getElementById("statCount");
  const solveBlock = document.getElementById("solveBlock");
  const solveNote = document.getElementById("solveNote");
  const solutionList = document.getElementById("solutionList");
  const solNote = document.getElementById("solNote");
  const solutionsPanel = document.getElementById("solutionsPanel");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { aInput.value = "3"; bInput.value = "1"; nInput.value = "7"; clearError(); });

  function parseInput(raw, label) {
    const s = String(raw).trim();
    if (!/^-?\d+$/.test(s)) throw new Error(`${label} must be an integer.`);
    return BigInt(s);
  }

  function render(a, b, n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const r = NumberTheory.solveLinearCongruence(a, b, n);
    statGcd.textContent = r.gcd.toString();

    if (!r.solvable) {
      statSolvable.textContent = "no";
      statCount.textContent = "0";
      Engine.renderKatex(solveBlock, `\\gcd(${a}, ${n}) = ${r.gcd} \\nmid ${b} \\quad\\Rightarrow\\quad \\text{no solution}`, true);
      solveNote.textContent = r.reason;
      solutionsPanel.style.display = "none";
      return;
    }

    statSolvable.textContent = "yes";
    statCount.textContent = String(r.count);
    Engine.renderKatex(solveBlock, `\\gcd(${a}, ${n}) = ${r.gcd} \\mid ${b} \\quad\\Rightarrow\\quad ${r.count} \\text{ solution(s) mod } ${n}`, true);
    solveNote.textContent = r.count === 1
      ? `gcd(a, n) = 1, so the solution is unique mod ${n}. The inverse of ${a} mod ${n} carries b across.`
      : `gcd(a, n) = ${r.gcd} divides b, so ${r.gcd} solutions mod ${n}. One particular solution is x₀ = ${r.x0} (mod ${r.modulusClass}); the rest fan out by adding ${r.modulusClass} repeatedly.`;
    solutionsPanel.style.display = "block";
    solutionList.innerHTML = r.solutions.map((x, i) => `<span class="pipe ${i === 0 ? "is-accent" : ""}">x ≡ ${x}</span>`).join("");
    solNote.textContent = `particular solution x₀ = ${r.x0}; solution class mod ${r.modulusClass}.`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let a, b, n;
    try { a = parseInput(aInput.value, "a"); b = parseInput(bInput.value, "b"); n = parseInput(nInput.value, "n"); } catch (err) { return showError(err.message); }
    if (n <= 0n) return showError("n must be a positive modulus.");
    render(a, b, n);
    Proto.saveState("engine-lab:number-theory-linear-congruences", { a: aInput.value, b: bInput.value, n: nInput.value });
  });

  const saved = Proto.loadState("engine-lab:number-theory-linear-congruences");
  if (saved) {
    if (saved.a !== undefined) aInput.value = saved.a;
    if (saved.b !== undefined) bInput.value = saved.b;
    if (saved.n !== undefined) nInput.value = saved.n;
    form.requestSubmit();
  }
})();