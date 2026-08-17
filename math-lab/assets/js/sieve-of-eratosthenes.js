/* Sieve of Eratosthenes — DOM wiring. Drives NumberTheory.primesUpTo(n, {trace:true}) and
   animates the strike waves with the shared step-slider pattern. */
(function () {
  "use strict";

  const nInput = document.getElementById("nInput");
  const form = document.getElementById("sieveForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statCount = document.getElementById("statCount");
  const statRounds = document.getElementById("statRounds");
  const statN = document.getElementById("statN");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const stepNote = document.getElementById("stepNote");
  const sieveGrid = document.getElementById("sieveGrid");
  const primeList = document.getElementById("primeList");

  let state = null; // { n, rounds, primes, cols, cells: [{el, value, prime}] }

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }

  exampleBtn.addEventListener("click", () => { nInput.value = "120"; clearError(); });

  function parseIntInput(raw, label, max) {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) throw new Error(`${label} must be a whole number (digits only).`);
    const v = BigInt(s);
    if (v < 2) throw new Error(`${label} must be at least 2.`);
    if (max && v > max) throw new Error(`${label} must be at most ${max} — keep the sieve small so the animation stays legible.`);
    return v;
  }

  function colsFor(n) {
    const num = Number(n);
    if (num <= 25) return 5;
    if (num <= 60) return 10;
    if (num <= 150) return 12;
    return 15;
  }

  function render(n, result) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const cols = colsFor(n);
    const num = Number(n);
    sieveGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    // build cells 2..n
    sieveGrid.innerHTML = "";
    const cells = [];
    for (let v = 2; v <= num; v++) {
      const el = document.createElement("div");
      el.className = "nt-sieve-cell";
      el.textContent = String(v);
      sieveGrid.appendChild(el);
      cells.push({ el, value: v, prime: false, struck: false });
    }

    statCount.textContent = String(result.primes.length);
    statRounds.textContent = String(result.rounds.length);
    statN.textContent = String(n);

    primeList.innerHTML = result.primes.map((p) => `<span class="pipe is-accent">${p}</span>`).join("");

    state = { n, rounds: result.rounds, primes: result.primes, cols, cells };
    stepSlider.min = 0;
    stepSlider.max = result.rounds.length;
    stepSlider.value = 0;
    updateStep(0);
  }

  function updateStep(roundIdx) {
    if (!state) return;
    const { rounds, cells } = state;
    stepLabel.textContent = `round ${roundIdx} / ${rounds.length}`;
    // reset to candidate, then apply rounds 0..roundIdx-1
    for (const c of cells) { c.el.className = "nt-sieve-cell"; }
    for (let i = 0; i < roundIdx; i++) {
      const r = rounds[i];
      for (const c of cells) if (c.value === Number(r.p)) { c.el.classList.add("is-prime"); c.prime = true; }
      for (const mult of r.strikes) {
        const cell = cells[Number(mult) - 2];
        if (cell) { cell.el.classList.add("is-struck"); cell.struck = true; }
      }
    }
    if (roundIdx < rounds.length) {
      const r = rounds[roundIdx];
      // mark the current prime and the multiples being struck this round
      for (const c of cells) if (c.value === Number(r.p)) c.el.classList.add("is-current-prime");
      for (const mult of r.strikes) {
        const cell = cells[Number(mult) - 2];
        if (cell && !cell.struck) cell.el.classList.add("is-striking");
      }
      stepNote.textContent = `round ${roundIdx + 1}: 2 ≤ ${r.p}, mark ${r.p} prime and strike ${r.strikes.length} multiple${r.strikes.length === 1 ? "" : "s"}`;
    } else {
      stepNote.textContent = `done — ${state.primes.length} primes survive ≤ ${state.n}`;
    }
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let n;
    try { n = parseIntInput(nInput.value, "n", 400n); } catch (err) { return showError(err.message); }
    const result = NumberTheory.primesUpTo(n, { trace: true });
    render(n, result);
    Proto.saveState("engine-lab:number-theory-sieve-of-eratosthenes", { n: nInput.value });
  });

  const saved = Proto.loadState("engine-lab:number-theory-sieve-of-eratosthenes");
  if (saved) {
    if (saved.n !== undefined) nInput.value = saved.n;
    form.requestSubmit();
  }
})();