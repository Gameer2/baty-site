/* Order of an element — DOM wiring. Computes the multiplicative order (smallest k with a^k≡1),
   φ(n), confirms order | φ(n), and shows the power table up to the order. */
(function () {
  "use strict";

  const aInput = document.getElementById("aInput");
  const nInput = document.getElementById("nInput");
  const form = document.getElementById("orderForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statOrder = document.getElementById("statOrder");
  const statPhi = document.getElementById("statPhi");
  const statDivides = document.getElementById("statDivides");
  const powerBody = document.querySelector("#powerTable tbody");
  const orderNote = document.getElementById("orderNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { aInput.value = "3"; nInput.value = "7"; clearError(); });

  function parseInput(raw, label) {
    const s = String(raw).trim();
    if (!/^-?\d+$/.test(s)) throw new Error(`${label} must be an integer.`);
    return BigInt(s);
  }

  function render(a, n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const phi = NumberTheory.totient(n);
    statPhi.textContent = phi.toString();
    const o = NumberTheory.multiplicativeOrder(a, n);
    if (!o.ok) {
      statOrder.textContent = "undefined";
      statDivides.textContent = "—";
      statOrder.parentElement.classList.remove("accent");
      powerBody.innerHTML = "";
      orderNote.textContent = o.reason;
      return;
    }
    statOrder.textContent = o.order.toString();
    statOrder.parentElement.classList.add("accent");
    statDivides.textContent = phi % o.order === 0n ? `yes (${o.order} | ${phi})` : "no";
    // power table 1..order
    let rows = "";
    for (let k = 1n; k <= o.order; k++) {
      const val = NumberTheory.modPow(a, k, n);
      rows += `<tr class="${k === o.order ? "is-current" : ""}"><td>${k}</td><td>${val}${val === 1n ? "  ← a^order ≡ 1" : ""}</td></tr>`;
    }
    powerBody.innerHTML = rows;
    orderNote.textContent = `The order is ${o.order}, which ${phi % o.order === 0n ? "divides" : "does not divide"} φ(${n}) = ${phi}. ${o.order === phi ? "Since the order equals φ(n), a is a PRIMITIVE ROOT mod n — see the next page." : "Smaller than φ(n), so a is not a primitive root, but it generates a subgroup of size " + o.order + "."}`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let a, n;
    try { a = parseInput(aInput.value, "a"); n = parseInput(nInput.value, "n"); } catch (err) { return showError(err.message); }
    if (n <= 0n) return showError("n must be a positive modulus.");
    render(a, n);
  });
})();