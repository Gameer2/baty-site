(function () {
  "use strict";

  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const form = document.getElementById("extEuclidForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statGcd = document.getElementById("statGcd");
  const statX = document.getElementById("statX");
  const statY = document.getElementById("statY");
  const formulaBlock = document.getElementById("formulaBlock");
  const bezoutEquation = document.getElementById("bezoutEquation");
  const iterTableBody = document.querySelector("#iterTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const stepEquation = document.getElementById("stepEquation");

  let state = null; // { steps, a, b }

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() {
    formError.style.display = "none";
  }

  function parseIntInput(raw, label) {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) throw new Error(`${label} must be a positive whole number.`);
    const v = BigInt(s);
    if (v <= 0n) throw new Error(`${label} must be a positive whole number.`);
    return v;
  }

  exampleBtn.addEventListener("click", () => {
    aInput.value = "240";
    bInput.value = "46";
    clearError();
  });

  function render(a, b, result) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    statGcd.textContent = result.gcd.toString();
    statX.textContent = result.x.toString();
    statY.textContent = result.y.toString();

    Engine.renderKatex(formulaBlock, "r_n = a \\cdot s_n + b \\cdot t_n \\quad\\text{holds at every step}", true);
    Engine.renderKatex(
      bezoutEquation,
      `${a} \\times (${result.x}) + ${b} \\times (${result.y}) = ${result.gcd}`,
      true
    );

    iterTableBody.innerHTML = result.steps
      .map(
        (s) => `<tr data-n="${s.n}">
          <td>${s.n}</td>
          <td>${s.r}</td>
          <td>${s.q === null ? "—" : s.q}</td>
          <td>${s.s}</td>
          <td>${s.t}</td>
        </tr>`
      )
      .join("");

    stepSlider.min = 0;
    stepSlider.max = result.steps.length - 1;
    stepSlider.value = result.steps.length - 1;
    state = { steps: result.steps, a, b };
    updateStep(result.steps.length - 1);
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
    Engine.renderKatex(
      stepEquation,
      `${s.r} = ${state.a} \\times (${s.s}) + ${state.b} \\times (${s.t})`,
      true
    );
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

    const result = NumberTheory.extendedGcd(a, b);
    render(a, b, result);
    Proto.saveState("engine-lab:number-theory-extended-euclidean", { a: aInput.value, b: bInput.value });
  });

  const saved = Proto.loadState("engine-lab:number-theory-extended-euclidean");
  if (saved) {
    if (saved.a !== undefined) aInput.value = saved.a;
    if (saved.b !== undefined) bInput.value = saved.b;
    form.requestSubmit();
  }
})();
