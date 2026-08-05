/* RSA — DOM wiring. Generates a key from two primes, encrypts a message, decrypts it back, and
   shows *why* the round-trip works (Euler's theorem: m^(ed) ≡ m mod n when ed ≡ 1 mod φ(n)).
   The "big primes" button produces a realistic modulus and points back to the factorization page. */
(function () {
  "use strict";

  const pInput = document.getElementById("pInput");
  const qInput = document.getElementById("qInput");
  const msgInput = document.getElementById("msgInput");
  const form = document.getElementById("rsaForm");
  const bigBtn = document.getElementById("bigBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statRoundtrip = document.getElementById("statRoundtrip");
  const statN = document.getElementById("statN");
  const statPhi = document.getElementById("statPhi");
  const keyBlock = document.getElementById("keyBlock");
  const keyNote = document.getElementById("keyNote");
  const cryptoBlock = document.getElementById("cryptoBlock");
  const cryptoNote = document.getElementById("cryptoNote");
  const proofBlock = document.getElementById("proofBlock");
  const proofNote = document.getElementById("proofNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }

  bigBtn.addEventListener("click", () => {
    // ~16-bit primes → a 32-bit modulus, big enough that trial division in your head is hopeless
    // but small enough to read on screen. Points the lesson at the factorization page.
    let p = NumberTheory.generatePrime(16);
    let q = NumberTheory.generatePrime(16);
    while (q === p) q = NumberTheory.generatePrime(16);
    pInput.value = String(p);
    qInput.value = String(q);
    const n = p * q;
    msgInput.value = String(NumberTheory.mod(BigInt(Math.floor(Math.random() * 1000)) + 1n, n));
    clearError();
    form.requestSubmit();
  });

  function parseInput(raw, label) {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) throw new Error(`${label} must be a non-negative integer.`);
    return BigInt(s);
  }

  function render(p, q, m) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const key = NumberTheory.rsaKeygen(p, q);
    statN.textContent = String(key.n);
    statPhi.textContent = String(key.phi);

    Engine.renderKatex(keyBlock, `\\begin{aligned} n &= p\\cdot q = ${p}\\cdot ${q} = ${key.n} \\\\ \\varphi(n) &= (p-1)(q-1) = ${p - 1n}\\cdot ${q - 1n} = ${key.phi} \\\\ e &= ${key.e}, \\quad d \\equiv e^{-1} \\pmod{\\varphi(n)} = ${key.d} \\\\ \\text{public key} &= (n, e) = (${key.n}, ${key.e}), \\quad \\text{private key} = (n, d) = (${key.n}, ${key.d}) \\end{aligned}`, true);
    keyNote.textContent = `The public key (n, e) is published; the private exponent d is secret. d is the modular inverse of e mod φ(n) — computable in a blink IF you know φ(n), which requires knowing p and q. An attacker with only n would have to factor it first. That factorization is the one operation the Prime Factorisation page showed is hard at scale.`;

    if (m >= key.n) {
      statRoundtrip.textContent = "m too big";
      statRoundtrip.parentElement.classList.remove("accent");
      Engine.renderKatex(cryptoBlock, `m = ${m} \\ge n = ${key.n}`, true);
      cryptoNote.textContent = `The message must be smaller than the modulus n, otherwise information is lost (encrypting gives m mod n, not m). Use a message < ${key.n}.`;
      proofBlock.textContent = "";
      proofNote.textContent = "";
      return;
    }

    const c = NumberTheory.rsaEncrypt(m, key.e, key.n);
    const recovered = NumberTheory.rsaDecrypt(c, key.d, key.n);
    const ok = recovered === m;
    statRoundtrip.textContent = ok ? "yes ✓" : "no";
    statRoundtrip.parentElement.classList.toggle("accent", ok);

    Engine.renderKatex(cryptoBlock, `\\begin{aligned} c &= m^e \\bmod n = ${m}^{${key.e}} \\bmod ${key.n} = ${c} \\\\ m' &= c^d \\bmod n = ${c}^{${key.d}} \\bmod ${key.n} = ${recovered} \\end{aligned}`, true);
    cryptoNote.textContent = ok ? `Encrypted with the public key, decrypted with the private key, and the original message ${m} came back exactly — without the decryptor ever learning m from the encryptor. Each exponentiation is just the modular-exponentiation algorithm from the previous page.` : `Round-trip failed — this indicates a bug, not a security property; please report it.`;

    Engine.renderKatex(proofBlock, `e\\cdot d = ${key.e}\\cdot ${key.d} = ${key.e * key.d} = 1 + ${key.e * key.d - 1n}, \\quad \\text{and } ${key.e * key.d - 1n} = ${key.phi}\\cdot ${(key.e * key.d - 1n) / key.phi} \\;\\Rightarrow\\; e\\cdot d \\equiv 1 \\pmod{\\varphi(n)}`, true);
    proofNote.textContent = `By Euler's theorem, m^φ(n) ≡ 1 (mod n) whenever gcd(m, n) = 1, so m^(ed) = m^(1 + k·φ(n)) = m·(m^φ(n))^k ≡ m·1 = m (mod n). The private exponent d undoes the public exponent e precisely because e·d ≡ 1 mod φ(n) — and computing d from e requires φ(n), which requires the factorization of n. Break the factorization, break RSA; hold it, and RSA holds.`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let p, q, m;
    try { p = parseInput(pInput.value, "p"); q = parseInput(qInput.value, "q"); m = parseInput(msgInput.value, "message"); } catch (err) { return showError(err.message); }
    if (!NumberTheory.millerRabin(p).prime) return showError(`${p} is not prime.`);
    if (!NumberTheory.millerRabin(q).prime) return showError(`${q} is not prime.`);
    if (p === q) return showError("p and q must be distinct primes.");
    render(p, q, m);
  });
})();