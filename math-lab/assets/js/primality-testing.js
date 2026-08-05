/* Primality testing — DOM wiring. Runs Fermat's test (single base) and Miller-Rabin (with the
   witness chain shown), plus the Carmichael verdict. The certificate — not just yes/no — is the point. */
(function () {
  "use strict";

  const nInput = document.getElementById("nInput");
  const baseInput = document.getElementById("baseInput");
  const form = document.getElementById("primeForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statMR = document.getElementById("statMR");
  const statBase = document.getElementById("statBase");
  const statCarmichael = document.getElementById("statCarmichael");
  const fermatBlock = document.getElementById("fermatBlock");
  const fermatNote = document.getElementById("fermatNote");
  const mrBody = document.querySelector("#mrTable tbody");
  const mrNote = document.getElementById("mrNote");
  const carmichaelNote = document.getElementById("carmichaelNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }

  exampleBtn.addEventListener("click", () => { nInput.value = "1105"; baseInput.value = "2"; clearError(); });

  function parseInput(raw, label) {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) throw new Error(`${label} must be a non-negative integer.`);
    return BigInt(s);
  }

  function render(n, base) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const mr = NumberTheory.millerRabin(n);
    const verdict = mr.prime === true ? "prime" : mr.prime === false ? "composite" : "unknown";
    statMR.textContent = verdict;
    statMR.parentElement.classList.toggle("accent", mr.prime === true);

    statBase.textContent = `${base}`;

    // --- Fermat single base ---
    const f = NumberTheory.fermatTest(n, base);
    Engine.renderKatex(fermatBlock, `${base}^{${n}-1} \\equiv ${f.value} \\pmod{${n}}\\quad\\Rightarrow\\quad${f.passes ? "\\text{passes Fermat}" : "\\text{fails Fermat}"}`, true);
    fermatNote.textContent = f.note + (f.passes && mr.prime === false ? " — but Miller-Rabin finds a witness, so n is actually composite." : "");

    // --- Miller-Rabin witnesses ---
    mrBody.innerHTML = (mr.witnesses || []).map((w) => {
      const chain = w.sequence.map((x) => x.toString()).join(" → ");
      const cls = w.verdict === "pass" ? "ok" : "bad";
      return `<tr><td>${w.base}</td><td class="${cls}">${w.verdict}</td><td>${chain || "—"}</td></tr>`;
    }).join("");
    if (mr.prime === false && mr.witness) {
      mrNote.textContent = `witness base ${mr.witness} proves ${n} composite: its residue chain never reached ±1 during the squaring.`;
    } else if (mr.prime === true) {
      mrNote.textContent = `${n} passed every witness base tested. With the deterministic base set used here this is a proof for all n < 3.3×10²⁴.`;
    } else {
      mrNote.textContent = mr.reason || "no verdict";
    }

    // --- Carmichael ---
    const c = NumberTheory.isCarmichael(n);
    statCarmichael.textContent = c.carmichael === true ? "yes" : c.carmichael === false ? "no" : "unknown";
    statCarmichael.parentElement.classList.toggle("accent", c.carmichael === true);

    if (c.carmichael === true) {
      const facts = (c.factors || []).map((ff) => ff.p).join(" · ");
      carmichaelNote.textContent = `${n} is a Carmichael number: composite and square-free (${facts}), with (p−1) | (n−1) for each prime factor p. It passes Fermat's test for every coprime base — so Fermat alone cannot tell it from a prime. Miller-Rabin can, because it inspects the full squaring chain.`;
    } else if (f.passes && mr.prime === false) {
      carmichaelNote.textContent = `${n} passed Fermat's test with base ${base} but Miller-Rabin proves it composite. It may not be Carmichael (a single base passing is not enough), but it shows exactly why Fermat's test is unsafe on its own.`;
    } else {
      carmichaelNote.textContent = c.reason || `${n} is not a Carmichael number.`;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let n, base;
    try { n = parseInput(nInput.value, "n"); base = parseInput(baseInput.value, "base"); } catch (err) { return showError(err.message); }
    if (n < 2n) return showError("n must be at least 2.");
    if (base < 2n) return showError("Fermat base a must be at least 2.");
    if (base >= n) return showError("Fermat base a must be smaller than n.");
    render(n, base);
  });
})();