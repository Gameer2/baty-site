/* Modular exponentiation — DOM wiring. Renders the exponent's binary digits as a row of
   bit-pills and the per-step square-and-multiply trace as a comparison table. */
(function () {
  "use strict";

  const baseInput = document.getElementById("baseInput");
  const expInput = document.getElementById("expInput");
  const modInput = document.getElementById("modInput");
  const form = document.getElementById("meForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statResult = document.getElementById("statResult");
  const statBits = document.getElementById("statBits");
  const statMults = document.getElementById("statMults");
  const bitRow = document.getElementById("bitRow");
  const bitNote = document.getElementById("bitNote");
  const traceTable = document.getElementById("traceTable");
  const traceNote = document.getElementById("traceNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { baseInput.value = "7"; expInput.value = "256"; modInput.value = "13"; clearError(); });

  function parseInput(raw, label, allowNeg) {
    const s = String(raw).trim();
    if (!/^-?\d+$/.test(s)) throw new Error(`${label} must be an integer.`);
    return BigInt(s);
  }

  function render(base, exp, mod) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const trace = NumberTheory.modPowTrace(base, exp, mod);
    statResult.textContent = String(trace.result);
    statResult.parentElement.classList.add("accent");
    statBits.textContent = String(trace.steps.length);
    const mults = trace.steps.filter((s) => s.bitOn).length;
    statMults.textContent = String(mults);

    // Bit row — MSB on the left to match the written binary form.
    const bitsMsb = trace.binary.split("");
    bitRow.innerHTML = bitsMsb.map((bit) => {
      const on = bit === "1";
      return `<div class="mx-bit ${on ? "on" : ""}"><span class="mx-bitbit">${bit}</span><span class="mx-action">${on ? "multiply" : "skip"}</span></div>`;
    }).join("");
    bitNote.textContent = `${exp} in binary is ${trace.binary} (${trace.steps.length} bits). Reading left-to-right, each bit triggers a base-squaring; a 1-bit additionally multiplies into the accumulator. Only ${mults} of the ${trace.steps.length} steps multiply.`;

    // Trace table — LSB-first (the order the algorithm actually processes them).
    let html = "<table class=\"nt-cmp-table\"><thead><tr><th>i</th><th>bit</th><th>base</th><th>acc before</th><th>acc after</th><th>action</th></tr></thead><tbody>";
    for (const s of trace.steps) {
      html += `<tr><td>${s.bitIndex}</td><td class="${s.bitOn ? "ok" : ""}">${s.bitOn ? 1 : 0}</td><td>${s.base}</td><td>${s.accumulatorBefore}</td><td>${s.accumulatorAfter}</td><td>${s.action}</td></tr>`;
    }
    html += "</tbody></table>";
    traceTable.innerHTML = html;
    traceNote.textContent = `Result: ${base}^${exp} ≡ ${trace.result} (mod ${mod}). Each step keeps every value below ${mod} — the running base and accumulator are reduced mod ${mod} after every operation, so the full power ${base}^${exp} is never constructed. Cost: ${trace.steps.length} squarings + ${mults} multiplications, i.e. O(log ${exp}) work — polynomial in the bit-length, the reason RSA on 2048-bit exponents is feasible at all.`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let base, exp, mod;
    try { base = parseInput(baseInput.value, "base"); exp = parseInput(expInput.value, "exponent"); mod = parseInput(modInput.value, "modulus"); } catch (err) { return showError(err.message); }
    if (mod <= 0n) return showError("Modulus must be a positive integer.");
    if (exp < 0n) return showError("Exponent must be non-negative for this trace (negative exponents need a modular inverse).");
    render(base, exp, mod);
  });
})();