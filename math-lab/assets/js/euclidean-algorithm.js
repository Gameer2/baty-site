(function () {
  "use strict";

  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const form = document.getElementById("euclidForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statGcd = document.getElementById("statGcd");
  const statSteps = document.getElementById("statSteps");
  const statA = document.getElementById("statA");
  const statB = document.getElementById("statB");
  const formulaBlock = document.getElementById("formulaBlock");
  const iterTableBody = document.querySelector("#iterTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const stepEquation = document.getElementById("stepEquation");
  const barTrack = document.getElementById("barTrack");

  let state = null; // { steps }

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() {
    formError.style.display = "none";
  }

  function parseIntInput(raw, label) {
    const s = String(raw).trim();
    if (!/^-?\d+$/.test(s)) throw new Error(`${label} must be a whole number (digits only, optional leading -).`);
    return BigInt(s);
  }

  exampleBtn.addEventListener("click", () => {
    aInput.value = "1071";
    bInput.value = "462";
    clearError();
  });

  function digitCount(bigintVal) {
    const s = bigintVal < 0n ? (-bigintVal).toString() : bigintVal.toString();
    return s.length;
  }

  function render(a, b, result) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const steps = result.steps;
    statGcd.textContent = result.gcd.toString();
    statSteps.textContent = String(steps.length);
    statA.textContent = a.toString();
    statB.textContent = b.toString();

    Engine.renderKatex(formulaBlock, "a = b \\cdot q + r, \\qquad \\gcd(a, b) = \\gcd(b, r)", true);

    iterTableBody.innerHTML = steps
      .map(
        (s) => `<tr data-n="${s.n}">
          <td>${s.n}</td>
          <td>${s.a}</td>
          <td>${s.b}</td>
          <td>${s.q}</td>
          <td>${s.r}</td>
        </tr>`
      )
      .join("");

    const digitsA = digitCount(steps[0].a) || 1;
    barTrack.innerHTML = steps
      .map((s) => {
        const pct = Math.max(4, Math.round((digitCount(s.a) / digitsA) * 100));
        return `<div class="nt-bar-row" data-n="${s.n}">
          <span class="nt-bar-label">step ${s.n}: a = ${s.a}</span>
          <div class="nt-bar-track"><div class="nt-bar-fill" style="width:${pct}%"></div></div>
        </div>`;
      })
      .join("");

    stepSlider.min = 0;
    stepSlider.max = steps.length - 1;
    stepSlider.value = steps.length - 1;
    state = { steps };
    updateStep(steps.length - 1);
  }

  function updateStep(idx) {
    if (!state) return;
    const s = state.steps[idx];
    stepLabel.textContent = `step ${s.n} / ${state.steps.length}`;
    document.querySelectorAll("#iterTable tbody tr").forEach((row) => {
      row.classList.toggle("is-current", Number(row.dataset.n) === s.n);
    });
    const rowEl = document.querySelector(`#iterTable tbody tr[data-n="${s.n}"]`);
    if (rowEl) rowEl.scrollIntoView({ block: "nearest" });
    document.querySelectorAll(".nt-bar-row").forEach((row) => {
      row.classList.toggle("is-current", Number(row.dataset.n) === s.n);
    });
    Engine.renderKatex(stepEquation, `${s.a} = ${s.b} \\times ${s.q} + ${s.r}`, true);
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();

    let a, b;
    try {
      a = parseIntInput(aInput.value, "a");
      b = parseIntInput(bInput.value, "b");
    } catch (err) {
      return showError(err.message);
    }

    if (a === 0n && b === 0n) return showError("gcd(0, 0) is undefined — enter at least one nonzero integer.");
    if (b === 0n) {
      return showError("b must be nonzero — the algorithm divides by b at every step, so there's nothing to step through when b = 0 (even though gcd(a, 0) = |a| is true).");
    }

    const result = NumberTheory.euclideanSteps(a, b);
    if (!result.ok) return showError(`Stopped early: ${result.reason}. Try smaller inputs.`);
    render(a, b, result);
    Proto.saveState("engine-lab:number-theory-euclidean-algorithm", { a: aInput.value, b: bInput.value });
  });

  const saved = Proto.loadState("engine-lab:number-theory-euclidean-algorithm");
  if (saved) {
    if (saved.a !== undefined) aInput.value = saved.a;
    if (saved.b !== undefined) bInput.value = saved.b;
    form.requestSubmit();
  }
})();
