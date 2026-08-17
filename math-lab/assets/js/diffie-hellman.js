/* Diffie–Hellman — DOM wiring. Runs the exchange, shows both parties land on the same shared
   secret, and frames the eavesdropper's problem as discrete logarithm (the prior page). */
(function () {
  "use strict";

  const pInput = document.getElementById("pInput");
  const gInput = document.getElementById("gInput");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const form = document.getElementById("dhForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statMatch = document.getElementById("statMatch");
  const statA = document.getElementById("statA");
  const statB = document.getElementById("statB");
  const statShared = document.getElementById("statShared");
  const dhBlock = document.getElementById("dhBlock");
  const dhNote = document.getElementById("dhNote");
  const eveBlock = document.getElementById("eveBlock");
  const eveNote = document.getElementById("eveNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { pInput.value = "23"; gInput.value = "5"; aInput.value = "6"; bInput.value = "15"; clearError(); });

  function parseInput(raw, label) {
    const s = String(raw).trim();
    if (!/^-?\d+$/.test(s)) throw new Error(`${label} must be an integer.`);
    return BigInt(s);
  }

  function render(p, g, a, b) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const r = NumberTheory.diffieHellman(p, g, a, b);
    statA.textContent = String(r.A);
    statB.textContent = String(r.B);
    statShared.textContent = String(r.sharedA);
    statMatch.textContent = r.match ? "yes ✓" : "no";
    statMatch.parentElement.classList.toggle("accent", r.match);

    Engine.renderKatex(dhBlock, `\\begin{aligned} \\text{Alice: } &A = g^a \\bmod p = ${g}^{${a}} \\bmod ${p} = ${r.A} \\\\ \\text{Bob: } &B = g^b \\bmod p = ${g}^{${b}} \\bmod ${p} = ${r.B} \\\\ \\text{Alice computes } &s = B^a \\bmod p = ${r.B}^{${a}} \\bmod ${p} = ${r.sharedA} \\\\ \\text{Bob computes } &s = A^b \\bmod p = ${r.A}^{${b}} \\bmod ${p} = ${r.sharedB} \\end{aligned}`, true);
    dhNote.textContent = r.match
      ? `Both sides match: ${r.sharedA} = ${r.sharedB}. The key insight is that exponentiation commutes in the exponent — (g^b)^a = (g^a)^b = g^(ab) — so two different computation paths land on the identical secret g^(ab) mod ${p}, even though neither a nor b was ever sent.`
      : `Mismatch — this indicates a bug, not a security property; please report it.`;

    Engine.renderKatex(eveBlock, `\\text{Eve sees } p=${p},\\ g=${g},\\ A=${r.A},\\ B=${r.B}. \\quad \\text{To get } s = g^{ab}, \\text{ she needs } a: \\quad a = \\log_g(${r.A}) \\pmod{${p}}`, true);
    const isPrim = NumberTheory.isPrimitiveRoot(g, p).primitive;
    eveNote.textContent = `An eavesdropper sees p, g, A, and B — everything on the wire. To recover the shared secret she must solve ${r.A} = ${g}^a (mod ${p}) for a, the discrete logarithm problem. ${isPrim ? `g = ${g} is a primitive root mod ${p}, so a is well-defined but hard — ` : ``}the Discrete Logarithm page showed that finding a requires roughly √p steps (baby-step giant-step), which for a 2048-bit prime is infeasible. Hardness of the discrete log is to Diffie–Hellman what hardness of factoring is to RSA.`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let p, g, a, b;
    try { p = parseInput(pInput.value, "p"); g = parseInput(gInput.value, "g"); a = parseInput(aInput.value, "a"); b = parseInput(bInput.value, "b"); } catch (err) { return showError(err.message); }
    if (p <= 0n) return showError("p must be a positive prime.");
    if (!NumberTheory.millerRabin(p).prime) return showError(`${p} is not prime — Diffie–Hellman needs a prime modulus.`);
    if (a < 0n || b < 0n) return showError("Private exponents must be non-negative.");
    render(p, g, a, b);
    Proto.saveState("engine-lab:number-theory-diffie-hellman", { p: pInput.value, g: gInput.value, a: aInput.value, b: bInput.value });
  });

  const saved = Proto.loadState("engine-lab:number-theory-diffie-hellman");
  if (saved) {
    if (saved.p !== undefined) pInput.value = saved.p;
    if (saved.g !== undefined) gInput.value = saved.g;
    if (saved.a !== undefined) aInput.value = saved.a;
    if (saved.b !== undefined) bInput.value = saved.b;
    form.requestSubmit();
  }
})();