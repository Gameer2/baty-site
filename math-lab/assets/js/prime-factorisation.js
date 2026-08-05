/* Prime factorisation — DOM wiring. Runs trial division, Fermat's method, and Pollard's rho
   on the same n, then the full tiered factorisation, displaying each method's work count. */
(function () {
  "use strict";

  const nInput = document.getElementById("nInput");
  const form = document.getElementById("factorForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statFactor = document.getElementById("statFactor");
  const statDigits = document.getElementById("statDigits");
  const cmpBody = document.querySelector("#cmpTable tbody");
  const fullNote = document.getElementById("fullNote");
  const factorList = document.getElementById("factorList");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }

  exampleBtn.addEventListener("click", () => { nInput.value = "10000004400000259"; clearError(); });

  function parseInput(raw) {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) throw new Error("n must be a non-negative integer (digits only).");
    const v = BigInt(s);
    if (v < 2n) throw new Error("n must be at least 2.");
    return v;
  }

  function digitCount(b) { return (b < 0n ? -b : b).toString().length; }

  function formatFactors(factors) {
    return factors.map((f) => (f.e === 1n ? `${f.p}` : `${f.p}^${f.e}`)).join(" · ");
  }

  function render(n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    statDigits.textContent = String(digitCount(n));

    // --- trial division ---
    const trial = NumberTheory.factorize(n, { maxOps: 200000 });
    let trialVerdict, trialWork, trialNotes;
    if (trial.ok && !trial.factors.some((f) => f.unfactored)) {
      trialVerdict = `<span class="ok">factored</span>`;
      trialWork = `${trial.operations} trial divisions`;
      trialNotes = `product = ${trial.factors.map((f) => f.p).reduce((a, b) => a * b, 1n)}`;
    } else if (trial.factors.some((f) => f.unfactored)) {
      trialVerdict = `<span class="bad">partial</span>`;
      trialWork = `${trial.operations} (budget hit)`;
      const uf = trial.factors.find((f) => f.unfactored);
      trialNotes = `cofactor ${uf.p} resists trial division`;
    } else {
      trialVerdict = `<span class="bad">gave up</span>`;
      trialWork = `${trial.operations}`;
      trialNotes = trial.reason;
    }

    // --- Fermat's method (only meaningful for odd composites) ---
    let fermatVerdict, fermatWork, fermatNotes, fermatFactors = null;
    if (n % 2n === 0n) {
      fermatVerdict = "n/a (even)"; fermatWork = "—"; fermatNotes = "Fermat's method factors odd composites; divide out the 2s first.";
    } else if (NumberTheory.millerRabin(n).prime) {
      fermatVerdict = `<span>prime</span>`; fermatWork = "—"; fermatNotes = "nothing to factor.";
    } else {
      const f = NumberTheory.fermatFactor(n, { maxSteps: 200000 });
      if (f.ok) {
        fermatVerdict = `<span class="ok">factored</span>`;
        fermatWork = `${f.steps} increments of a`;
        fermatFactors = f.factors;
        fermatNotes = `${f.factors[0]} × ${f.factors[1]}`;
      } else {
        fermatVerdict = `<span class="bad">gave up</span>`;
        fermatWork = `${f.steps} (budget)`;
        fermatNotes = "factors too far apart for Fermat's method here";
      }
    }

    // --- Pollard's rho ---
    let rhoVerdict, rhoWork, rhoNotes;
    if (NumberTheory.millerRabin(n).prime) {
      rhoVerdict = `<span>prime</span>`; rhoWork = "—"; rhoNotes = "nothing to factor.";
    } else {
      const r = NumberTheory.pollardRho(n, { maxSteps: 200000 });
      if (r.ok) {
        rhoVerdict = `<span class="ok">factored</span>`;
        rhoWork = `${r.steps} rho steps`;
        rhoNotes = `found ${r.factor} × ${r.cofactor}`;
      } else {
        rhoVerdict = `<span class="bad">gave up</span>`;
        rhoWork = `${r.steps || "—"} (budget)`;
        rhoNotes = r.reason;
      }
    }

    cmpBody.innerHTML = [
      ["trial division", trialVerdict, trialWork, trialNotes],
      ["Fermat's method", fermatVerdict, fermatWork, fermatNotes],
      ["Pollard's rho", rhoVerdict, rhoWork, rhoNotes],
    ].map((row) => `<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td></tr>`).join("");

    // --- full factorisation ---
    const full = NumberTheory.factorizeFull(n, { maxOps: 300000 });
    if (full.ok) {
      statFactor.textContent = formatFactors(full.factors);
      fullNote.textContent = `verified: product of factors = ${full.factors.map((f) => f.p ** f.e).reduce((a, b) => a * b, 1n)} = n`;
      factorList.innerHTML = full.factors.map((f) => {
        const isP = f.e === 1n ? `${f.p}` : `${f.p}<span class="pe">^${f.e}</span>`;
        return `<div class="nt-factor-row"><span class="pf">${isP}</span>${f.unfactored ? '<span class="pe">(unfactored cofactor)</span>' : ""}</div>`;
      }).join("");
    } else {
      statFactor.textContent = "partial";
      fullNote.textContent = `${full.reason}. The factors below are what was found within budget — the rest resists.`;
      factorList.innerHTML = full.factors.map((f) => {
        const isP = f.e === 1n ? `${f.p}` : `${f.p}<span class="pe">^${f.e}</span>`;
        return `<div class="nt-factor-row"><span class="pf">${isP}</span>${f.unfactored ? '<span class="pe">(unfactored cofactor)</span>' : ""}</div>`;
      }).join("");
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let n;
    try { n = parseInput(nInput.value); } catch (err) { return showError(err.message); }
    render(n);
  });
})();