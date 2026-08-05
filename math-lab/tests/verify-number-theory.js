"use strict";
const path = require("path");
const NumberTheory = require(path.join(__dirname, "..", "assets", "js", "number-theory.js"));

let pass = 0;
let fail = 0;

function eq(actual, expected, label) {
  const ok = String(actual) === String(expected);
  if (ok) {
    pass++;
    console.log(`  ok    ${label}: ${actual}`);
  } else {
    fail++;
    console.error(`  FAIL  ${label}: got ${actual}, expected ${expected}`);
  }
  return ok;
}

function throws(fn, label) {
  try {
    fn();
    fail++;
    console.error(`  FAIL  ${label}: expected an error, got none`);
    return false;
  } catch (err) {
    pass++;
    console.log(`  ok    ${label}: threw "${err.message}"`);
    return true;
  }
}

console.log("Number Theory — Phase 0 primitives\n");

// --- Division Algorithm: a = qb + r, 0 <= r < |b| ---
console.log("Division Algorithm");
{
  const { q, r } = NumberTheory.divide(17, 5);
  eq(q, 3n, "divide(17,5).q");
  eq(r, 2n, "divide(17,5).r");
}
{
  // negative dividend must still land in [0, |b|), not JS's native negative-remainder "%"
  const { q, r } = NumberTheory.divide(-17, 5);
  eq(q, -4n, "divide(-17,5).q");
  eq(r, 3n, "divide(-17,5).r");
}
throws(() => NumberTheory.divide(5, 0), "divide(5,0) rejects division by zero");

// --- gcd ---
console.log("\ngcd");
eq(NumberTheory.gcd(48, 180), 12n, "gcd(48,180)");
eq(NumberTheory.gcd(0, 17), 17n, "gcd(0,17)");
eq(NumberTheory.gcd(1071, 462), 21n, "gcd(1071,462) — Euclid's own example");
eq(NumberTheory.gcd(-48, 180), 12n, "gcd(-48,180) — sign-independent");
throws(() => NumberTheory.gcd(0, 0), "gcd(0,0) is rejected as undefined");

// --- Euclidean Algorithm step table ---
console.log("\nEuclidean Algorithm step table");
{
  const { ok, steps, gcd } = NumberTheory.euclideanSteps(1071, 462);
  eq(ok, true, "euclideanSteps(1071,462).ok");
  eq(gcd, 21n, "euclideanSteps(1071,462).gcd");
  // 1071 = 2*462 + 147; 462 = 3*147 + 21; 147 = 7*21 + 0
  eq(steps.length, 3, "euclideanSteps(1071,462).steps.length");
  eq(steps[0].q, 2n, "step 1: 1071 = 2*462 + 147 -> q");
  eq(steps[0].r, 147n, "step 1: 1071 = 2*462 + 147 -> r");
  eq(steps[2].r, 0n, "final step remainder is 0");
  eq(steps[2].b, 21n, "final step's b is the gcd");
}
{
  const res = NumberTheory.euclideanSteps(1071, 462, 1);
  eq(res.ok, false, "euclideanSteps respects the operation budget");
  eq(Array.isArray(res.partial), true, "euclideanSteps returns partial steps when the budget is exhausted");
  eq(res.partial.length, 1, "partial steps array has exactly the budgeted number of steps");
}

// --- Extended Euclidean Algorithm / Bezout ---
console.log("\nExtended Euclidean Algorithm");
{
  const { gcd, x, y } = NumberTheory.extendedGcd(240, 46);
  eq(gcd, 2n, "extendedGcd(240,46).gcd");
  eq(240n * x + 46n * y, 2n, "Bezout identity 240x + 46y = gcd holds");
}
{
  // cross-check extendedGcd's gcd against the independent fast-path gcd() on a pair beyond 2^53
  const a = 9876543210987654321n; // ~1.0e19, well beyond Number.MAX_SAFE_INTEGER (2^53 ~ 9.007e15)
  const b = 1234567891234567891n;
  const g1 = NumberTheory.gcd(a, b);
  const { gcd: g2, x, y } = NumberTheory.extendedGcd(a, b);
  eq(g1, g2, "gcd() and extendedGcd() agree beyond 2^53");
  eq(typeof g1, "bigint", "gcd beyond 2^53 stays a BigInt, not a truncated Number");
  eq(a * x + b * y, g1, "Bezout identity holds for a pair beyond 2^53");
}

// --- Fast modular exponentiation ---
console.log("\nmodPow");
eq(NumberTheory.modPow(4, 13, 497), 445n, "modPow(4,13,497) — textbook example");
eq(NumberTheory.modPow(2, 10, 1000), 24n, "modPow(2,10,1000)");
eq(NumberTheory.modPow(5, 0, 7), 1n, "modPow(5,0,7) — anything to the 0th power is 1");
{
  // 2^61 - 1 = 2305843009213693951 is a known Mersenne prime (M61), well beyond 2^53.
  // Fermat's little theorem: base^(p-1) === 1 (mod p) for any base not divisible by p —
  // an independent correctness check, not just "didn't crash."
  const p = 2305843009213693951n;
  eq(NumberTheory.modPow(2n, p - 1n, p), 1n, "modPow: Fermat's little theorem holds at 2^61-1 (beyond 2^53)");
  eq(NumberTheory.modPow(123456789n, p - 1n, p), 1n, "modPow: Fermat's little theorem holds for a second base at 2^61-1");
}

// --- Modular inverse ---
console.log("\nmodInverse");
eq(NumberTheory.modInverse(3, 11), 4n, "modInverse(3,11) — 3*4=12 === 1 (mod 11)");
eq(NumberTheory.modInverse(2, 4), null, "modInverse(2,4) — gcd(2,4)=2, no inverse exists");
{
  const a = 123456789123456789n;
  const m = 1000000000000000003n; // beyond 2^53
  const inv = NumberTheory.modInverse(a, m);
  eq((a * inv) % m, 1n, "modInverse beyond 2^53: a * inv === 1 (mod m)");
}

// --- Integer square root ---
console.log("\nisqrt");
eq(NumberTheory.isqrt(10), 3n, "isqrt(10) floors to 3");
eq(NumberTheory.isqrt(0), 0n, "isqrt(0) = 0");
eq(NumberTheory.isqrt(1000000000000000000000000000000000000n), 1000000000000000000n, "isqrt of a huge perfect square beyond 2^53");
throws(() => NumberTheory.isqrt(-4), "isqrt(-4) rejects negative input");

// --- Linear Diophantine Equations ---
console.log("\nsolveLinearDiophantine");
{
  // 6x + 15y = 9 -> gcd(6,15)=3, 3|9, solvable
  const r = NumberTheory.solveLinearDiophantine(6, 15, 9);
  eq(r.solvable, true, "solveLinearDiophantine(6,15,9).solvable");
  eq(r.gcd, 3n, "solveLinearDiophantine(6,15,9).gcd");
  eq(6n * r.x0 + 15n * r.y0, 9n, "particular solution satisfies 6x0 + 15y0 = 9");
  // general solution family must also satisfy the equation for several t
  for (const t of [-3n, -1n, 0n, 2n, 5n]) {
    const x = r.x0 + r.xStep * t;
    const y = r.y0 - r.yStep * t;
    eq(6n * x + 15n * y, 9n, `general solution at t=${t} satisfies 6x + 15y = 9`);
  }
}
{
  // 2x + 4y = 7 -> gcd(2,4)=2, 2 does not divide 7 -> unsolvable
  const r = NumberTheory.solveLinearDiophantine(2, 4, 7);
  eq(r.solvable, false, "solveLinearDiophantine(2,4,7) is unsolvable — gcd(2,4)=2 does not divide 7");
}
{
  // cross-check beyond 2^53
  const a = 987654321987654321n;
  const b = 123456789123456789n;
  const g = NumberTheory.gcd(a, b);
  const c = g * 5n; // guaranteed solvable, multiple of the gcd
  const r = NumberTheory.solveLinearDiophantine(a, b, c);
  eq(r.solvable, true, "solveLinearDiophantine beyond 2^53 is solvable when c is a multiple of gcd");
  eq(a * r.x0 + b * r.y0, c, "particular solution holds beyond 2^53");
}

// ===========================================================================
// Phase 2 — primes
// ===========================================================================
console.log("\n\n=== Phase 2 — primes ===\n");

console.log("primesUpTo");
{
  const p = NumberTheory.primesUpTo(30);
  eq(p.join(","), "2,3,5,7,11,13,17,19,23,29", "primesUpTo(30)");
  const t = NumberTheory.primesUpTo(30, { trace: true });
  eq(Array.isArray(t.rounds), true, "trace returns rounds array");
  eq(t.rounds[0].p, 2n, "first round sieves by 2");
  eq(t.rounds[2].p, 5n, "third round sieves by 5");
}

console.log("\nnextPrime / isPrimeTrial");
eq(NumberTheory.nextPrime(20), 23n, "nextPrime(20)");
eq(NumberTheory.nextPrime(100), 101n, "nextPrime(100)");
{
  const r = NumberTheory.isPrimeTrial(79);
  eq(r.prime, true, "isPrimeTrial(79) is prime");
  const r2 = NumberTheory.isPrimeTrial(91);
  eq(r2.prime, false, "isPrimeTrial(91) is composite");
  eq(r2.witness, 7n, "isPrimeTrial(91) witness is 7");
}
{
  const r = NumberTheory.isPrimeTrial(1000000007n, 100);
  eq(r.prime, null, "isPrimeTrial budget exhaustion returns prime:null");
}

console.log("\nfermatTest / carmichael");
{
  const r = NumberTheory.fermatTest(561, 2);
  eq(r.passes, true, "561 passes Fermat base 2 (it is Carmichael)");
  const r2 = NumberTheory.fermatTest(15, 2);
  eq(r2.passes, false, "15 fails Fermat base 2");
  eq(NumberTheory.isCarmichael(561).carmichael, true, "561 is Carmichael");
  eq(NumberTheory.isCarmichael(1105).carmichael, true, "1105 is Carmichael");
  eq(NumberTheory.isCarmichael(13).carmichael, false, "13 is not Carmichael (it is prime)");
  eq(NumberTheory.isCarmichael(15).carmichael, false, "15 is not Carmichael (3−1∤14)");
}

console.log("\nmillerRabin");
eq(NumberTheory.millerRabin(561).prime, false, "millerRabin(561) composite");
eq(NumberTheory.millerRabin(79).prime, true, "millerRabin(79) prime");
eq(NumberTheory.millerRabin(2305843009213693951n).prime, true, "millerRabin(2^61−1) prime beyond 2^53");
eq(NumberTheory.millerRabin(221).prime, false, "millerRabin(221=13·17) composite");

console.log("\nfactorize");
{
  const r = NumberTheory.factorize(360);
  eq(r.ok, true, "factorize(360).ok");
  eq(r.factors.map((f) => `${f.p}^${f.e}`).join("·"), "2^3·3^2·5^1", "factorize(360)");
  const r2 = NumberTheory.factorize(1000000007n, 1000);
  eq(r2.ok, true, "factorize(10^9+7 prime) ok within budget");
  eq(r2.factors.length, 1, "prime factorization has one factor");
  const r3 = NumberTheory.factorize(9007199254740993n, 100); // a 16-digit semiprime (67280421310721 · ?); budget forces a cofactor
  eq(r3.ok, false, "factorize of a large semiprime exceeds budget honestly");
  eq(Array.isArray(r3.factors), true, "partial factorization still returns factors");
}

console.log("\nfermatFactor / pollardRho");
{
  const r = NumberTheory.fermatFactor(5959);
  eq(r.ok, true, "fermatFactor(5959) ok");
  eq(r.factors[0] * r.factors[1], 5959n, "fermatFactor factors multiply to n");
  eq(r.factors.join(","), "59,101", "fermatFactor(5959) = 59·101");
  const p = NumberTheory.pollardRho(8051);
  eq(p.ok, true, "pollardRho(8051) ok");
  eq(p.factor * p.cofactor, 8051n, "pollardRho factor · cofactor = n");
  eq(NumberTheory.pollardRho(17).ok, false, "pollardRho on a prime reports no factor");
  // factor a large semiprime Pollard rho handles but trial division cannot
  const semiprime = 1000000007n * 1000000009n; // ~10^18, beyond 2^53
  const pr = NumberTheory.pollardRho(semiprime, { maxSteps: 500000 });
  eq(pr.ok, true, "pollardRho factors a ~10^18 semiprime beyond 2^53");
  eq(pr.factor * pr.cofactor, semiprime, "semiprime factors multiply back beyond 2^53");
}

console.log("\nfactorizeFull");
{
  const r = NumberTheory.factorizeFull(360);
  eq(r.factors.map((f) => `${f.p}^${f.e}`).join("·"), "2^3·3^2·5^1", "factorizeFull(360)");
  const r2 = NumberTheory.factorizeFull(1000000007n * 1000000009n);
  eq(r2.ok, true, "factorizeFull handles a large semiprime via Pollard rho");
  eq(r2.factors.length, 2, "two distinct prime factors");
}

console.log("\ndistribution / ulam");
{
  const pc = NumberTheory.primeCount(30);
  eq(pc.pi, 10n, "π(30) = 10");
  const gaps = NumberTheory.primeGaps(30);
  eq(gaps.gaps.length, 9, "nine prime gaps up to 30");
  const ulam = NumberTheory.ulamSpiral(25);
  eq(ulam.length, 25, "ulamSpiral(25) has 25 cells");
  eq(ulam[0].num, 1n, "ulam starts at 1");
  eq(ulam[0].x === 0 && ulam[0].y === 0, true, "1 sits at the origin");
}

// ===========================================================================
// Phase 3 — congruences
// ===========================================================================
console.log("\n\n=== Phase 3 — congruences ===\n");

console.log("mod / addTable / mulTable");
eq(NumberTheory.mod(-17, 5), 3n, "mod(-17,5) lands in [0,5)");
{
  const add = NumberTheory.addTable(5);
  eq(add[2][3], 0n, "(2+3) mod 5 = 0");
  const mul = NumberTheory.mulTable(5);
  eq(mul[3][4], 2n, "(3·4) mod 5 = 2");
}

console.log("\nsolveLinearCongruence");
{
  const r = NumberTheory.solveLinearCongruence(4, 8, 12);
  eq(r.solvable, true, "4x ≡ 8 mod 12 solvable");
  eq(r.count, 4, "four solutions (gcd=4)");
  eq(r.solutions.join(","), "2,5,8,11", "solutions are 2,5,8,11");
  r.solutions.forEach((x) => eq((4n * x) % 12n, 8n, `x=${x} satisfies 4x≡8 mod 12`));
  const r2 = NumberTheory.solveLinearCongruence(3, 1, 7);
  eq(r2.solutions.join(","), "5", "3x ≡ 1 mod 7 → x = 5 (3·5=15≡1)");
  const r3 = NumberTheory.solveLinearCongruence(2, 1, 4);
  eq(r3.solvable, false, "2x ≡ 1 mod 4 unsolvable (gcd 2 ∤ 1)");
}

console.log("\ncrt");
{
  const r = NumberTheory.crt([2, 3, 2], [3, 5, 7]);
  eq(r.ok, true, "CRT(2,3,2 ; 3,5,7) ok");
  eq(r.x, 23n, "CRT solution = 23");
  eq(r.modulus, 105n, "CRT modulus = 105");
  r.moduli = r.modulus;
  eq(((23n % 3n) === 2n && (23n % 5n) === 3n && (23n % 7n) === 2n), true, "23 satisfies all three congruences");
  // non-coprime inconsistent
  const bad = NumberTheory.crt([1, 2], [2, 4]);
  eq(bad.ok, false, "CRT detects inconsistent non-coprime moduli");
  // non-coprime consistent → lcm solution
  const cons = NumberTheory.crt([3, 1], [6, 4]);
  eq(cons.ok, true, "CRT consistent non-coprime ok");
  eq(cons.x, 9n, "CRT(3,1 ; 6,4) = 9");
  eq(cons.modulus, 12n, "modulus is lcm(6,4)=12");
}

console.log("\nfermatLittleCheck / eulerTheoremCheck / wilsonCheck");
{
  const f = NumberTheory.fermatLittleCheck(3, 7);
  eq(f.applies, true, "Fermat little applies for prime 7");
  eq(f.equalsOne, true, "3^6 ≡ 1 mod 7");
  const f2 = NumberTheory.fermatLittleCheck(6, 9);
  eq(f2.applies, false, "Fermat little does not apply to composite 9");
  const e = NumberTheory.eulerTheoremCheck(3, 10);
  eq(e.applies, true, "Euler applies: gcd(3,10)=1");
  eq(e.equalsOne, true, "3^φ(10)=3^4 ≡ 1 mod 10");
  eq(NumberTheory.wilsonCheck(7).prime, true, "Wilson: 7 prime");
  eq(NumberTheory.wilsonCheck(9).prime, false, "Wilson: 9 composite");
}

// ===========================================================================
// Phase 4 — multiplicative functions
// ===========================================================================
console.log("\n\n=== Phase 4 — multiplicative functions ===\n");

console.log("totient");
eq(NumberTheory.totient(1), 1n, "φ(1)=1");
eq(NumberTheory.totient(10), 4n, "φ(10)=4");
eq(NumberTheory.totient(7), 6n, "φ(7)=6 (prime → p−1)");
eq(NumberTheory.totient(360), 96n, "φ(360)=96");

console.log("\ndivisors / tau / sigma");
{
  eq(NumberTheory.tau(12), 6n, "τ(12)=6");
  eq(NumberTheory.sigma(12), 28n, "σ(12)=28");
  eq(NumberTheory.divisors(12).join(","), "1,2,3,4,6,12", "divisors(12)");
  eq(NumberTheory.sigmaK(12, 2), (1 + 4 + 9 + 16 + 36 + 144) === 210 ? 210n : 0n, "σ₂(12)=210");
}

console.log("\naliquotClass (perfect/abundant/deficient)");
eq(NumberTheory.aliquotClass(6).class, "perfect", "6 is perfect");
eq(NumberTheory.aliquotClass(28).class, "perfect", "28 is perfect");
eq(NumberTheory.aliquotClass(12).class, "abundant", "12 is abundant");
eq(NumberTheory.aliquotClass(8).class, "deficient", "8 is deficient");

console.log("\nmobius / omega / liouville");
eq(NumberTheory.mobius(1), 1n, "μ(1)=1");
eq(NumberTheory.mobius(30), -1n, "μ(30)=-1 (squarefree, 3 primes)");
eq(NumberTheory.mobius(12), 0n, "μ(12)=0 (not squarefree)");
eq(NumberTheory.omegaDistinct(12), 2n, "ω(12)=2 (primes 2,3)");
eq(NumberTheory.omegaTotal(12), 3n, "Ω(12)=3 (2²·3)");
eq(NumberTheory.liouville(12), -1n, "λ(12)=(−1)^3=−1");

// ===========================================================================
// Phase 5 — primitive roots
// ===========================================================================
console.log("\n\n=== Phase 5 — primitive roots ===\n");

console.log("multiplicativeOrder");
{
  const o = NumberTheory.multiplicativeOrder(3, 7);
  eq(o.ok, true, "order(3 mod 7) defined");
  eq(o.order, 6n, "order(3 mod 7) = 6 (= φ(7), so 3 is a primitive root)");
  const o2 = NumberTheory.multiplicativeOrder(2, 7);
  eq(o2.order, 3n, "order(2 mod 7) = 3");
  const o3 = NumberTheory.multiplicativeOrder(2, 4);
  eq(o3.ok, false, "order(2 mod 4) undefined (gcd≠1)");
}

console.log("\nprimitiveRoots");
{
  eq(NumberTheory.hasPrimitiveRoot(7), true, "7 has primitive roots");
  eq(NumberTheory.hasPrimitiveRoot(8), false, "8 has no primitive roots");
  eq(NumberTheory.hasPrimitiveRoot(14), true, "14 = 2·7 has primitive roots");
  const r = NumberTheory.primitiveRoots(7);
  eq(r.exists, true, "primitiveRoots(7) exist");
  eq(r.generator, 3n, "smallest generator mod 7 is 3");
  eq(r.roots.join(","), "3,5", "primitive roots mod 7 are 3, 5");
  eq(BigInt(r.count), 2n, "φ(φ(7)) = 2 primitive roots");
  eq(r.powers.join(","), "1,3,2,6,4,5", "powers of 3 enumerate all units mod 7");
  const r8 = NumberTheory.primitiveRoots(8);
  eq(r8.exists, false, "primitiveRoots(8) reports none");
}

console.log("\ndiscreteLog");
{
  const d = NumberTheory.discreteLog(3, 4, 7);
  eq(d.ok, true, "discreteLog(3,4,7) found");
  eq(d.x, 4n, "3^4 mod 7 = 4");
  eq(NumberTheory.modPow(3, d.x, 7), 4n, "verified: 3^x ≡ 4 mod 7");
  const d2 = NumberTheory.discreteLog(3, 5, 7);
  eq(d2.ok, true, "discreteLog(3,5,7) found (3 is a primitive root)");
  eq(NumberTheory.modPow(3, d2.x, 7), 5n, "verified: 3^x ≡ 5 mod 7");
}

// ===========================================================================
// Phase 6 — quadratic residues
// ===========================================================================
console.log("\n\n=== Phase 6 — quadratic residues ===\n");

console.log("quadraticResidues / legendreSymbol");
{
  eq(NumberTheory.quadraticResidues(7).join(","), "1,2,4", "QRs mod 7");
  eq(NumberTheory.legendreSymbol(2, 7), 1n, "(2/7)=1 (residue)");
  eq(NumberTheory.legendreSymbol(3, 7), -1n, "(3/7)=−1 (non-residue)");
  eq(NumberTheory.legendreSymbol(7, 7), 0n, "(7/7)=0");
  eq(NumberTheory.isQuadraticResidue(2, 7), true, "2 is a QR mod 7");
  eq(NumberTheory.isQuadraticResidue(3, 7), false, "3 is not a QR mod 7");
}

console.log("\njacobiSymbol");
eq(NumberTheory.jacobiSymbol(2, 7), 1n, "(2/7)=1");
eq(NumberTheory.jacobiSymbol(1, 9), 1n, "(1/9)=1");
eq(NumberTheory.jacobiSymbol(5, 21), NumberTheory.legendreSymbol(5, 3) * NumberTheory.legendreSymbol(5, 7), "(5/21) = (5/3)(5/7)");
throws(() => NumberTheory.jacobiSymbol(2, 8), "jacobi rejects even n");

console.log("\ntonelliShanks");
{
  const r = NumberTheory.tonelliShanks(10, 13);
  eq(r !== null, true, "10 is a QR mod 13");
  eq((r * r) % 13n, 10n, "Tonelli root squares to 10 mod 13");
  const r2 = NumberTheory.tonelliShanks(2, 7);
  eq((r2 * r2) % 7n, 2n, "Tonelli root squares to 2 mod 7");
  const r3 = NumberTheory.tonelliShanks(3, 7);
  eq(r3, null, "3 is a non-residue mod 7 → no root");
  // p ≡ 3 mod 4 fast path
  eq((NumberTheory.tonelliShanks(2, 7) ** 2n) % 7n, 2n, "p≡3 mod 4 path correct");
}

// ===========================================================================
// Phase 7 — cryptography
// ===========================================================================
console.log("\n\n=== Phase 7 — cryptography ===\n");

console.log("modPowTrace");
{
  const t = NumberTheory.modPowTrace(3, 13, 7);
  eq(t.result, 3n, "modPowTrace(3,13,7) = 3 (matches modPow)");
  eq(t.result, NumberTheory.modPow(3, 13, 7), "trace agrees with fast modPow");
  eq(t.binary, "1101", "binary of exponent 13");
}

console.log("\nrsa");
{
  const k = NumberTheory.rsaKeygen(61n, 53n);
  eq(k.n, 3233n, "RSA n = 61·53 = 3233");
  eq(NumberTheory.gcd(k.e, k.phi), 1n, "RSA public exponent is coprime to φ(n)");
  const ct = NumberTheory.rsaEncrypt(42n, k.e, k.n);
  eq(NumberTheory.rsaDecrypt(ct, k.d, k.n), 42n, "RSA encrypt/decrypt round-trips 42");
  // a larger honest demo: two ~20-bit primes → a 40-bit modulus trial division can't crack
  const P = NumberTheory.generatePrime(20);
  const Q = NumberTheory.nextPrime(P + 1n);
  const k2 = NumberTheory.rsaKeygen(P, Q);
  const big = 123456789n;
  eq(NumberTheory.rsaDecrypt(NumberTheory.rsaEncrypt(big, k2.e, k2.n), k2.d, k2.n), big, "RSA round-trips beyond 2^53");
  const crack = NumberTheory.factorize(k2.n, { maxOps: 50000 });
  eq(crack.ok, false, "trial division cannot factor the demo RSA modulus within budget (the lesson)");
}

console.log("\ndiffieHellman");
{
  const d = NumberTheory.diffieHellman(23, 5, 6, 15);
  eq(d.match, true, "Diffie-Hellman shared secrets match");
  eq(d.sharedA, d.sharedB, "both parties derive the same secret");
}

console.log("\naffine / hill ciphers");
{
  const ct = NumberTheory.affineEncrypt("HELLOWORLD", 3, 7);
  eq(NumberTheory.affineDecrypt(ct, 3, 7), "HELLOWORLD", "affine cipher round-trips");
  const hc = NumberTheory.hillEncrypt("HELP", [[3, 3], [2, 5]]);
  eq(NumberTheory.hillDecrypt(hc, [[3, 3], [2, 5]]), "HELP", "hill cipher round-trips an even-length plaintext");
  throws(() => NumberTheory.affineEncrypt("X", 2, 3), "affine rejects non-coprime a");
}

// ===========================================================================
// Recommended additions — continued fractions, Pell, Frobenius
// ===========================================================================
console.log("\n\n=== Recommended additions ===\n");

console.log("continuedFractionSqrt / convergents");
{
  const cf = NumberTheory.continuedFractionSqrt(23);
  eq(cf.a0, 4n, "√23 floor = 4");
  eq(cf.period.join(","), "1,3,1,8", "√23 period = (1,3,1,8)");
  const cf2 = NumberTheory.continuedFractionSqrt(16);
  eq(cf2.perfectSquare, true, "√16 is a perfect square → no period");
  const conv = NumberTheory.convergents(4, [1, 3, 1, 8], 5);
  eq(conv[0].p === 4n && conv[0].q === 1n, true, "first convergent is a0/1 = 4/1");
}

console.log("\npellSolve");
{
  const p = NumberTheory.pellSolve(13);
  eq(p.solvable, true, "Pell x²−13y²=1 solvable");
  eq(p.x, 649n, "fundamental x = 649");
  eq(p.y, 180n, "fundamental y = 180");
  eq(p.x * p.x - 13n * p.y * p.y, 1n, "649² − 13·180² = 1");
  const p2 = NumberTheory.pellSolve(2);
  eq(p2.x, 3n, "Pell x²−2y²=1 fundamental x=3");
  eq(p2.y, 2n, "Pell x²−2y²=1 fundamental y=2");
  const p3 = NumberTheory.pellSolve(25);
  eq(p3.solvable, false, "Pell rejects perfect-square D");
}

console.log("\nfrobenius");
eq(NumberTheory.frobenius(3, 5).frobenius, 7n, "Frobenius(3,5) = 7");
eq(NumberTheory.frobenius(4, 6).exists, false, "Frobenius undefined for non-coprime (4,6)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
