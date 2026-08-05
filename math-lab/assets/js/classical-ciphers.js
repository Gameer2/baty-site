/* Classical ciphers — DOM wiring. Encrypts and decrypts the plaintext with both the affine and
   Hill ciphers, showing each round-trip back to the original and explaining the invertibility
   condition (a coprime to 26 / det coprime to 26) and the frequency-analysis break. */
(function () {
  "use strict";

  const textInput = document.getElementById("textInput");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const h11 = document.getElementById("h11");
  const h22 = document.getElementById("h22");
  const form = document.getElementById("cForm");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const affBlock = document.getElementById("affBlock");
  const affNote = document.getElementById("affNote");
  const hillBlock = document.getElementById("hillBlock");
  const hillNote = document.getElementById("hillNote");
  const breakNote = document.getElementById("breakNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }

  function parseInput(raw, label, allowNeg) {
    const s = String(raw).trim();
    if (!/^-?\d+$/.test(s)) throw new Error(`${label} must be an integer.`);
    return BigInt(s);
  }

  function render(text, a, b, kh11, kh22) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    // --- Affine ---
    let affCt, affPt;
    try {
      affCt = NumberTheory.affineEncrypt(text, a, b);
      affPt = NumberTheory.affineDecrypt(affCt, a, b);
      const ainv = NumberTheory.modInverse(a, 26n);
      Engine.renderKatex(affBlock, `\\begin{aligned} E(x) &= ${a}\\,x + ${b} \\pmod{26} \\\\ \\text{cipher} &= \\text{“${affCt}”} \\\\ D(y) &= ${ainv}\\,(y - ${b}) \\pmod{26} \\quad (a^{-1} = ${ainv}) \\\\ \\text{decrypt} &= \\text{“${affPt}”} \\end{aligned}`, true);
      affNote.textContent = `Decryption uses a⁻¹ mod 26 = ${ainv}, which exists only because gcd(${a}, 26) = ${NumberTheory.gcd(a, 26n)} = 1. Had a shared a factor with 26, two different letters would encrypt identically and the map would lose information — the same invertibility condition as the linear-congruences page, now weaponized (weakly) as a cipher.`;
    } catch (err) {
      affBlock.textContent = "";
      affNote.textContent = `Affine cipher rejected this key: ${err.message} This is the page's whole point about affine encryption — the key must be invertible mod 26, or there is no way back.`;
    }

    // --- Hill ---
    const key = [[kh11, 0n], [0n, kh22]];
    let hillCt, hillPt;
    try {
      hillCt = NumberTheory.hillEncrypt(text, key);
      hillPt = NumberTheory.hillDecrypt(hillCt, key);
      const det = NumberTheory.mod(kh11 * kh22 - 0n, 26n);
      const detInv = NumberTheory.modInverse(det, 26n);
      Engine.renderKatex(hillBlock, `\\begin{aligned} K &= \\begin{pmatrix} ${kh11} & 0 \\\\ 0 & ${kh22} \\end{pmatrix}, \\quad \\det K = ${det}, \\quad \\det^{-1} \\bmod 26 = ${detInv} \\\\ \\text{cipher} &= \\text{“${hillCt}”} \\\\ \\text{decrypt} &= \\text{“${hillPt}”} \\end{aligned}`, true);
      hillNote.textContent = `The Hill cipher treats each pair of letters as a vector and multiplies by K mod 26. It inverts only because det(K) = ${det} is coprime to 26 (gcd = ${NumberTheory.gcd(det, 26n)}), so det⁻¹ = ${detInv} mod 26 exists and the inverse matrix K⁻¹ = det⁻¹·adj(K) is well-defined. A 2×2 Hill key multiplies the keyspace, but the linear structure makes it prey to known-plaintext attacks.`;
    } catch (err) {
      hillBlock.textContent = "";
      hillNote.textContent = `Hill cipher rejected this key: ${err.message} The determinant must be coprime to 26 — otherwise the matrix has no inverse mod 26 and encryption is a one-way trip.`;
    }

    breakNote.textContent = `Both ciphers are deterministic letter-substitutions (affine) or block-substitutions (Hill): the same plaintext letter always maps to the same ciphertext symbol. That preserves letter frequency, so English's tell-tale E/T/A distribution leaks straight through. The Hill cipher hides bigram frequency for a while, but with enough ciphertext — or one known plaintext block — the linear system is solved and the key falls. Classical ciphers teach the principle modern crypto inverts: a secure scheme must mix the plaintext so thoroughly that no statistical structure survives, which is exactly what the modular-exponentiation, RSA, and Diffie–Hellman pages above achieve by being one-way without the trapdoor.`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let a, b, kh11, kh22;
    try { a = parseInput(aInput.value, "a"); b = parseInput(bInput.value, "b"); kh11 = parseInput(h11.value, "Hill key [a]"); kh22 = parseInput(h22.value, "Hill key [d]"); } catch (err) { return showError(err.message); }
    const text = String(textInput.value);
    if (!text) return showError("Enter some plaintext.");
    render(text, a, b, kh11, kh22);
  });
})();