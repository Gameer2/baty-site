/* Frobenius / coin problem — DOM wiring. Computes g(a,b) = ab − a − b for coprime a, b, marks
   the number line reachable/unreachable by testing a·x + b·y = n over non-negative x, y, and
   reports the full unreachable set (there are (a−1)(b−1)/2 of them). */
(function () {
  "use strict";

  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const uptoInput = document.getElementById("uptoInput");
  const form = document.getElementById("frobForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statG = document.getElementById("statG");
  const statCount = document.getElementById("statCount");
  const statGcd = document.getElementById("statGcd");
  const coinLine = document.getElementById("coinLine");
  const coinNote = document.getElementById("coinNote");
  const frobBlock = document.getElementById("frobBlock");
  const frobNote = document.getElementById("frobNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { aInput.value = "5"; bInput.value = "8"; uptoInput.value = "40"; clearError(); });

  function parseInput(raw, label) {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) throw new Error(`${label} must be a non-negative integer.`);
    return BigInt(s);
  }

  // Is n representable as a*x + b*y with x, y >= 0? Exact BigInt check.
  function reachable(n, a, b) {
    if (n < 0n) return false;
    if (n === 0n) return true;
    if (n % a === 0n || n % b === 0n) return true;
    // try y = 0..⌊n/b⌋, check (n - b*y) divisible by a
    let y = 0n;
    let rem = n;
    while (rem >= 0n) {
      if (rem % a === 0n) return true;
      rem -= b;
      if (rem < 0n) break;
    }
    return false;
  }

  function render(a, b, upto) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const g = NumberTheory.gcd(a, b);
    statGcd.textContent = String(g);

    if (g !== 1n) {
      statG.textContent = "∞";
      statCount.textContent = "∞";
      statG.parentElement.classList.remove("accent");
      Engine.renderKatex(frobBlock, `\\gcd(${a}, ${b}) = ${g} \\neq 1`, true);
      frobNote.textContent = `a = ${a} and b = ${b} share the factor ${g}, so they're not coprime. Every representable amount is a multiple of ${g}, which means infinitely many integers (everything not divisible by ${g}) can never be made — there is no Frobenius number. The coin problem only has a finite answer when gcd(a, b) = 1.`;
      // Still draw a small number line showing the pattern.
      let html = "";
      for (let n = 0n; n <= upto; n++) {
        const r = n % g === 0n;
        html += `<span class="coin ${r ? "reachable" : "unreachable"}" title="${n}: ${r ? "reachable" : "not divisible by " + g}">${n}</span>`;
      }
      coinLine.innerHTML = html;
      coinNote.textContent = `Only multiples of ${g} are reachable; everything else is structurally impossible — the bar for the Frobenius number to exist is coprimality.`;
      return;
    }

    const fr = NumberTheory.frobenius(a, b);
    statG.textContent = String(fr.frobenius);
    statG.parentElement.classList.add("accent");

    // Reachable/unreachable number line.
    let html = "";
    const unreachable = [];
    for (let n = 0n; n <= upto; n++) {
      const r = reachable(n, a, b);
      if (!r && n <= fr.frobenius) unreachable.push(n);
      let cls = r ? "reachable" : "unreachable";
      if (n === fr.frobenius) cls = "frobenius";
      html += `<span class="coin ${cls}" title="${n}: ${r ? "reachable" : "unreachable"}${n === fr.frobenius ? " — Frobenius number" : ""}">${n}</span>`;
    }
    coinLine.innerHTML = html;
    coinNote.textContent = `Green = reachable as a non-negative combination ${a}·x + ${b}·y; grey = unreachable; red = the Frobenius number ${fr.frobenius}, the largest unreachable value. Every amount from ${fr.frobenius + 1n} onward is reachable.`;

    statCount.textContent = String(unreachable.length);
    Engine.renderKatex(frobBlock, `g(${a}, ${b}) = ${a}\\cdot ${b} - ${a} - ${b} = ${a * b} - ${a} - ${b} = ${fr.frobenius} \\\\ \\text{unreachable amounts} = \\{ ${unreachable.join(", ")} \\}`, true);
    frobNote.textContent = `Sylvester's theorem: for coprime a, b there are exactly (a−1)(b−1)/2 = ${(a - 1n) * (b - 1n) / 2n} unreachable amounts, the largest being ab − a − b = ${fr.frobenius}, and every integer beyond it is representable. The coprimality is the load-bearing condition — it's precisely gcd(a, b) = 1, the guarantee the extended Euclidean algorithm (Phase 1) gives, that makes the Bezout combination ax + by = gcd(a,b) = 1 exist, which lifts to every large enough integer.`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let a, b, upto;
    try { a = parseInput(aInput.value, "a"); b = parseInput(bInput.value, "b"); upto = parseInput(uptoInput.value, "up to"); } catch (err) { return showError(err.message); }
    if (a < 1n || b < 1n) return showError("a and b must be positive.");
    if (upto < 1n || upto > 500n) return showError("Show the number line up to a value between 1 and 500.");
    render(a, b, upto);
    Proto.saveState("engine-lab:number-theory-frobenius-coin", { a: aInput.value, b: bInput.value });
  });

  const saved = Proto.loadState("engine-lab:number-theory-frobenius-coin");
  if (saved) {
    if (saved.a !== undefined) aInput.value = saved.a;
    if (saved.b !== undefined) bInput.value = saved.b;
    form.requestSubmit();
  }
})();