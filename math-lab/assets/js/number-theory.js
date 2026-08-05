/* Number Theory Engine — pure, DOM-free integer arithmetic. BigInt throughout.
   Shared between the browser pages (assets/js/<method>.js wires this to the UI)
   and the Node verification suite (tests/verify-number-theory.js) — one implementation,
   two callers, so a regression here is caught by tests instead of only by eyeballing a table.

   Convention: every exported function takes and returns BigInt (or a plain object/array of
   BigInt). Convert to Number only at the display layer — see NUMBER_THEORY_ENGINE_PLAN.md §3. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NumberTheory = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const NumberTheory = {};

  function toBigInt(v, label) {
    if (typeof v === "bigint") return v;
    if (typeof v === "number") {
      if (!Number.isInteger(v)) throw new Error(`${label || "value"} must be an integer.`);
      return BigInt(v);
    }
    if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return BigInt(v.trim());
    throw new Error(`${label || "value"} must be an integer.`);
  }
  NumberTheory._toBigInt = toBigInt; // exposed so DOM-wiring layers reuse the same parsing/validation

  function babs(a) {
    return a < 0n ? -a : a;
  }

  // --- Division Algorithm: a = qb + r, with 0 <= r < |b| (the textbook Euclidean convention,
  //     not JS's native truncating "%", which can return a negative remainder). ---
  NumberTheory.divide = function (a, b) {
    a = toBigInt(a, "a");
    b = toBigInt(b, "b");
    if (b === 0n) throw new Error("Division by zero is undefined.");
    let q = a / b;
    let r = a - q * b;
    if (r < 0n) {
      r += babs(b);
      q = b > 0n ? q - 1n : q + 1n;
    }
    return { q, r };
  };

  // --- gcd via the Euclidean algorithm (no step table — the fast path other functions build on) ---
  NumberTheory.gcd = function (a, b) {
    a = babs(toBigInt(a, "a"));
    b = babs(toBigInt(b, "b"));
    if (a === 0n && b === 0n) throw new Error("gcd(0, 0) is undefined.");
    while (b !== 0n) {
      const r = a % b;
      a = b;
      b = r;
    }
    return a;
  };

  // --- Euclidean Algorithm, full division-step table (the teaching artifact for the method page).
  //     Every search in this engine takes an explicit operation budget and reports a partial
  //     result rather than looping forever — see NUMBER_THEORY_ENGINE_PLAN.md §6. In practice the
  //     Euclidean algorithm never gets close to this bound (O(log min(a,b)) steps), but the
  //     convention is applied uniformly so later, genuinely unbounded searches (factoring,
  //     primitive-root search) follow the same shape. ---
  NumberTheory.euclideanSteps = function (a, b, maxSteps = 500) {
    a = toBigInt(a, "a");
    b = toBigInt(b, "b");
    if (a === 0n && b === 0n) throw new Error("gcd(0, 0) is undefined.");
    let x = babs(a);
    let y = babs(b);
    const steps = [];
    if (y === 0n) return { ok: true, steps, gcd: x, a, b };
    let n = 0;
    while (y !== 0n) {
      n += 1;
      if (n > maxSteps) return { ok: false, reason: `stopped after ${maxSteps} steps`, partial: steps };
      const q = x / y;
      const r = x - q * y;
      steps.push({ n, a: x, b: y, q, r });
      x = y;
      y = r;
    }
    return { ok: true, steps, gcd: x, a, b };
  };

  // --- Extended Euclidean Algorithm: gcd(a,b) = a*x + b*y, with the coefficient-recursion table.
  //     Computed on |a|, |b| (so the table matches the textbook presentation), signs folded back
  //     into x, y at the end so the Bezout identity still holds for the original a, b. ---
  NumberTheory.extendedGcd = function (a, b) {
    a = toBigInt(a, "a");
    b = toBigInt(b, "b");
    if (a === 0n && b === 0n) throw new Error("gcd(0, 0) is undefined.");
    const negA = a < 0n;
    const negB = b < 0n;
    let oldR = babs(a);
    let r = babs(b);
    let oldS = 1n;
    let s = 0n;
    let oldT = 0n;
    let t = 1n;
    const steps = [];
    let n = 0;
    while (r !== 0n) {
      n += 1;
      const q = oldR / r;
      steps.push({ n, r: oldR, q, s: oldS, t: oldT });
      [oldR, r] = [r, oldR - q * r];
      [oldS, s] = [s, oldS - q * s];
      [oldT, t] = [t, oldT - q * t];
    }
    steps.push({ n: n + 1, r: oldR, q: null, s: oldS, t: oldT });
    return { gcd: oldR, x: negA ? -oldS : oldS, y: negB ? -oldT : oldT, steps };
  };

  // --- Fast (binary) modular exponentiation: base^exp mod m ---
  NumberTheory.modPow = function (base, exp, mod) {
    base = toBigInt(base, "base");
    exp = toBigInt(exp, "exponent");
    mod = toBigInt(mod, "modulus");
    if (mod <= 0n) throw new Error("Modulus must be a positive integer.");
    if (mod === 1n) return 0n;
    if (exp < 0n) {
      const inv = NumberTheory.modInverse(base, mod);
      if (inv === null) throw new Error("Base has no modular inverse; this negative exponent is undefined.");
      base = inv;
      exp = -exp;
    }
    base = ((base % mod) + mod) % mod;
    let result = 1n;
    while (exp > 0n) {
      if (exp & 1n) result = (result * base) % mod;
      base = (base * base) % mod;
      exp >>= 1n;
    }
    return result;
  };

  // --- Modular inverse via the Extended Euclidean Algorithm. Returns null (not a thrown error)
  //     when gcd(a, m) !== 1, since "no inverse exists" is a legitimate answer, not a failure. ---
  NumberTheory.modInverse = function (a, m) {
    a = toBigInt(a, "a");
    m = toBigInt(m, "modulus");
    if (m <= 0n) throw new Error("Modulus must be a positive integer.");
    const { gcd, x } = NumberTheory.extendedGcd(a, m);
    if (gcd !== 1n) return null;
    return ((x % m) + m) % m;
  };

  // --- Integer square root (Newton's method) — BigInt has no Math.sqrt. Floors to the nearest
  //     integer, e.g. isqrt(10) === 3n. ---
  NumberTheory.isqrt = function (n) {
    n = toBigInt(n, "n");
    if (n < 0n) throw new Error("Integer square root is undefined for negative numbers.");
    if (n < 2n) return n;
    let x = n;
    let y = (x + 1n) / 2n;
    while (y < x) {
      x = y;
      y = (x + n / x) / 2n;
    }
    return x;
  };

  // --- Linear Diophantine Equations: ax + by = c. Solvable iff gcd(a,b) | c (Rosen Thm 3.3.4).
  //     Built on extendedGcd's particular solution, scaled by c/gcd; the general solution family
  //     is x = x0 + (b/g)t, y = y0 - (a/g)t for any integer t. ---
  NumberTheory.solveLinearDiophantine = function (a, b, c) {
    a = toBigInt(a, "a");
    b = toBigInt(b, "b");
    c = toBigInt(c, "c");
    if (a === 0n && b === 0n) {
      if (c === 0n) return { solvable: true, gcd: 0n, everyPairSolves: true };
      return { solvable: false, gcd: 0n, reason: "a = b = 0 but c ≠ 0, so no (x, y) can satisfy the equation." };
    }
    const { gcd, x, y } = NumberTheory.extendedGcd(a, b);
    if (c % gcd !== 0n) {
      return { solvable: false, gcd, reason: `gcd(a, b) = ${gcd} does not divide c = ${c}.` };
    }
    const scale = c / gcd;
    const x0 = x * scale;
    const y0 = y * scale;
    const xStep = b / gcd; // x = x0 + xStep*t
    const yStep = a / gcd; // y = y0 - yStep*t
    return { solvable: true, gcd, x0, y0, xStep, yStep };
  };

  // ===========================================================================
  // PRIMES — Phase 2
  // ===========================================================================

  // --- Sieve of Eratosthenes up to n (n small enough to hold a Uint8Array in memory;
  //     the page keeps n modest, e.g. ≤ 200, because the *animation* is the point).
  //     With trace:true, returns one "round" per prime found: { p, strikes: [multiples] }
  //     so the page can strike multiples colour by colour. ---
  NumberTheory.primesUpTo = function (n, opts) {
    n = toBigInt(n, "n");
    if (n < 2n) return [];
    const limit = Number(n);
    const composite = new Uint8Array(limit + 1);
    composite[0] = 1;
    if (limit >= 1) composite[1] = 1;
    const primes = [];
    const trace = opts && opts.trace;
    const rounds = trace ? [] : null;
    for (let i = 2; i <= limit; i++) {
      if (!composite[i]) {
        primes.push(BigInt(i));
        if (trace) {
          const strikes = [];
          for (let j = i * i; j <= limit; j += i) {
            if (!composite[j]) { composite[j] = 1; strikes.push(BigInt(j)); }
          }
          rounds.push({ p: BigInt(i), strikes });
        } else {
          for (let j = i * i; j <= limit; j += i) composite[j] = 1;
        }
      }
    }
    return trace ? { primes, rounds } : primes;
  };

  // --- Smallest prime ≥ n, via Miller-Rabin (deterministic for the ranges used here). ---
  NumberTheory.nextPrime = function (n) {
    n = toBigInt(n, "n");
    let c = n < 2n ? 2n : n + 1n;
    if (c > 2n && c % 2n === 0n) c++;
    while (!NumberTheory.millerRabin(c).prime) c += c === 2n ? 1n : 2n;
    return c;
  };

  // --- Trial-division primality with an explicit divisor budget. Returns a *certificate*:
  //     for composites, the witness divisor. prime:null means the budget was exhausted before
  //     a verdict could be reached (the "partial" honesty discipline). ---
  NumberTheory.isPrimeTrial = function (n, maxSteps) {
    n = toBigInt(n, "n");
    maxSteps = maxSteps == null ? 100000 : maxSteps;
    if (n < 2n) return { prime: false, witness: null, reason: "n < 2" };
    if (n === 2n) return { prime: true, witness: null };
    if (n % 2n === 0n) return { prime: false, witness: 2n, reason: `2 divides ${n}` };
    let d = 3n;
    const lim = NumberTheory.isqrt(n);
    let steps = 0;
    while (d <= lim) {
      steps++;
      if (steps > maxSteps) return { prime: null, reason: `stopped after testing ${maxSteps} divisors (last tested: ${d})` };
      if (n % d === 0n) return { prime: false, witness: d, reason: `${d} divides ${n}` };
      d += 2n;
    }
    return { prime: true, witness: null };
  };

  // --- Fermat primality test with a single base. The *point* of the page is that passing is
  //     necessary but not sufficient (Carmichael numbers), so the certificate spells out why. ---
  NumberTheory.fermatTest = function (n, base) {
    n = toBigInt(n, "n");
    base = toBigInt(base, "base");
    if (n < 2n) return { prime: false, reason: "n < 2" };
    if (n === 2n) return { prime: true, base, value: 1n, passes: true };
    if (n % 2n === 0n) return { prime: false, base, value: 0n, passes: false, reason: `${n} is even` };
    const value = NumberTheory.modPow(base, n - 1n, n);
    const passes = value === 1n;
    return {
      prime: passes, // only "Fermat-prime", not proven prime
      base,
      value,
      passes,
      equation: `${base}^(${n}−1) mod ${n} = ${value}`,
      note: passes ? "≡ 1 → passes Fermat (composite numbers can still pass — see Carmichael)" : "≠ 1 → composite (Fermat witness)",
    };
  };

  // --- Miller-Rabin. Default bases give a deterministic result for all n < 3.3×10²⁴, which
  //     covers every input this engine will see; the witnesses are still shown so the page
  //     teaches *why* a strong pseudoprime test is built the way it is. ---
  NumberTheory.millerRabin = function (n, bases) {
    n = toBigInt(n, "n");
    if (n < 2n) return { prime: false, reason: "n < 2" };
    if (n === 2n || n === 3n) return { prime: true, witnesses: [] };
    if (n % 2n === 0n) return { prime: false, witnesses: [], witness: 2n, reason: `${n} is even` };
    let d = n - 1n;
    let s = 0n;
    while (d % 2n === 0n) { d /= 2n; s++; }
    const list = bases || [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
    const witnesses = [];
    for (const a of list) {
      if (a % n === 0n) continue;
      let x = NumberTheory.modPow(a, d, n);
      if (x === 1n || x === n - 1n) { witnesses.push({ base: a, sequence: [x], verdict: "pass" }); continue; }
      const seq = [x];
      let composite = true;
      for (let r = 1n; r < s; r++) {
        x = (x * x) % n;
        seq.push(x);
        if (x === n - 1n) { composite = false; break; }
      }
      witnesses.push({ base: a, sequence: seq, verdict: composite ? "fail" : "pass" });
      if (composite) return { prime: false, witnesses, witness: a, reason: `base ${a} proves ${n} composite` };
    }
    return { prime: true, witnesses };
  };

  // --- Carmichael number: composite, square-free, and (p−1) | (n−1) for every prime factor p.
  //     Built on factorize with a budget so a huge input reports "unknown" rather than hanging. ---
  NumberTheory.isCarmichael = function (n) {
    n = toBigInt(n, "n");
    if (n < 2n || n % 2n === 0n) return { carmichael: false, reason: "Carmichael numbers are odd composites" };
    const f = NumberTheory.factorize(n, { maxOps: 100000 });
    if (!f.ok) return { carmichael: null, reason: "could not factor within budget" };
    if (f.factors.some((p) => p.e > 1)) return { carmichael: false, reason: "not square-free" };
    if (f.factors.length < 2) return { carmichael: false, reason: `${n} is prime` };
    for (const { p } of f.factors) {
      if ((n - 1n) % (p - 1n) !== 0n) return { carmichael: false, reason: `(p−1) does not divide (n−1) for p = ${p}` };
    }
    return { carmichael: true, factors: f.factors };
  };

  // --- Prime factorisation by trial division, with an operation budget and a labelled
  //     cofactor when the budget is exhausted. The "compare methods" page contrasts this with
  //     Fermat and Pollard rho on the same semiprime. ---
  NumberTheory.factorize = function (n, opts) {
    const maxOps = opts && opts.maxOps != null ? opts.maxOps : 100000;
    n = toBigInt(n, "n");
    if (n < 0n) return { ok: false, reason: "factorize expects a non-negative integer", factors: [], operations: 0 };
    if (n < 2n) return { ok: true, factors: [], operations: 0 };
    let m = n;
    const factors = [];
    let ops = 0;
    function add(p) {
      const last = factors[factors.length - 1];
      if (last && last.p === p) last.e++;
      else factors.push({ p, e: 1n });
    }
    while (m % 2n === 0n) { add(2n); m /= 2n; ops++; }
    let d = 3n;
    while (d * d <= m) {
      ops++;
      if (ops > maxOps) {
        if (m > 1n) factors.push({ p: m, e: 1n, unfactored: true });
        return { ok: false, reason: `stopped after ${maxOps} operations; cofactor ${m} remains unfactored`, factors, operations: ops };
      }
      if (m % d === 0n) {
        let e = 0n;
        while (m % d === 0n) { e++; m /= d; ops++; }
        factors.push({ p: d, e });
      }
      d += 2n;
    }
    if (m > 1n) add(m);
    return { ok: true, factors, operations: ops };
  };

  // --- Fermat's factorisation method: find a such that a² − n is a square b², giving n=(a−b)(a+b).
  //     Fast when the two factors are close; the page uses it on a deliberately close-prime semiprime. ---
  NumberTheory.fermatFactor = function (n, opts) {
    const maxSteps = opts && opts.maxSteps != null ? opts.maxSteps : 1000000;
    n = toBigInt(n, "n");
    if (n < 0n) throw new Error("fermatFactor expects n ≥ 0");
    if (n % 2n === 0n) return { ok: true, a: 2n, b: n / 2n, factors: [2n, n / 2n], steps: 0, note: "n is even" };
    let a = NumberTheory.isqrt(n);
    if (a * a < n) a++;
    let steps = 0;
    while (true) {
      steps++;
      if (steps > maxSteps) return { ok: false, reason: `no factor found after ${maxSteps} steps`, steps };
      const b2 = a * a - n;
      if (b2 >= 0n) {
        const b = NumberTheory.isqrt(b2);
        if (b * b === b2) return { ok: true, a, b, factors: [a - b, a + b], steps };
      }
      a++;
    }
  };

  // --- Pollard's rho: probabilistic, finds a non-trivial factor of a composite n. Returns the
  //     step count so the page can compare work against trial division and Fermat. ---
  NumberTheory.pollardRho = function (n, opts) {
    const maxSteps = opts && opts.maxSteps != null ? opts.maxSteps : 100000;
    const c = opts && opts.c != null ? toBigInt(opts.c, "c") : 1n;
    const x0 = opts && opts.x0 != null ? toBigInt(opts.x0, "x0") : 2n;
    n = toBigInt(n, "n");
    if (n < 2n) return { ok: false, reason: "n < 2", steps: 0 };
    if (n % 2n === 0n) return { ok: true, factor: 2n, cofactor: n / 2n, steps: 0 };
    if (NumberTheory.millerRabin(n).prime) return { ok: false, reason: "n is prime — no non-trivial factor", steps: 0, factor: null };
    const f = (v) => ((v * v + c) % n);
    let x = x0, y = x0, d = 1n, steps = 0;
    while (d === 1n) {
      steps++;
      if (steps > maxSteps) return { ok: false, reason: `no factor found after ${maxSteps} steps`, steps };
      x = f(x);
      y = f(f(y));
      let diff = x - y;
      if (diff < 0n) diff = -diff;
      d = NumberTheory.gcd(diff, n);
    }
    if (d === n) return { ok: false, reason: "rho collapsed to a trivial cycle (d = n); try another starting value or constant", steps, factor: null };
    return { ok: true, factor: d, cofactor: n / d, steps };
  };

  // --- Full factorisation that falls back from trial division to Pollard rho for large cofactors,
  //     used by totient/divisor functions and as a "honest" tier in the comparison. ---
  NumberTheory.factorizeFull = function (n, opts) {
    const maxOps = opts && opts.maxOps != null ? opts.maxOps : 200000;
    n = toBigInt(n, "n");
    if (n < 2n) return { ok: true, factors: [], operations: 0 };
    let m = n;
    const factors = [];
    let ops = 0;
    function add(p) { const last = factors[factors.length - 1]; if (last && last.p === p) last.e++; else factors.push({ p, e: 1n }); }
    while (m % 2n === 0n) { add(2n); m /= 2n; ops++; }
    let d = 3n;
    while (d * d <= m && ops < maxOps) {
      ops++;
      if (m % d === 0n) { let e = 0n; while (m % d === 0n) { e++; m /= d; ops++; } factors.push({ p: d, e }); }
      d += 2n;
    }
    if (m > 1n) {
      if (NumberTheory.millerRabin(m).prime) add(m);
      else {
        const r = NumberTheory.pollardRho(m, { maxSteps: 100000 });
        if (r.ok) {
          const sub = NumberTheory.factorizeFull(r.factor, { maxOps: maxOps - ops });
          sub.factors.forEach(add); ops += sub.operations;
          const sub2 = NumberTheory.factorizeFull(r.cofactor, { maxOps: maxOps - ops });
          sub2.factors.forEach(add); ops += sub2.operations;
        } else {
          factors.push({ p: m, e: 1n, unfactored: true });
          return { ok: false, reason: `cofactor ${m} resisted Pollard rho within budget`, factors, operations: ops };
        }
      }
    }
    factors.sort((x, y) => (x.p < y.p ? -1 : x.p > y.p ? 1 : 0));
    return { ok: true, factors, operations: ops };
  };

  // --- Distribution helpers: π(x), the kth prime, prime gaps, and the Ulam spiral walk.
  //     The Ulam walk lives in the pure module (not the page) so its geometry is testable. ---
  NumberTheory.primeCount = function (x) {
    const primes = NumberTheory.primesUpTo(x);
    return { pi: BigInt(primes.length), primes };
  };

  NumberTheory.primeGaps = function (x) {
    const primes = NumberTheory.primesUpTo(x);
    const gaps = [];
    for (let i = 1; i < primes.length; i++) gaps.push(primes[i] - primes[i - 1]);
    return { primes, gaps };
  };

  NumberTheory.ulamSpiral = function (size) {
    size = Number(toBigInt(size, "size"));
    if (size < 1) return [];
    const primeSet = new Set(NumberTheory.primesUpTo(size).map((p) => Number(p)));
    const cells = [];
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // R, U, L, D
    let x = 0, y = 0, dirIdx = 0, legLength = 1, legStep = 0, legsAtLength = 0;
    for (let i = 1; i <= size; i++) {
      cells.push({ num: BigInt(i), x, y, prime: primeSet.has(i) });
      if (i === size) break;
      x += dirs[dirIdx][0];
      y += dirs[dirIdx][1];
      legStep++;
      if (legStep === legLength) {
        legStep = 0;
        dirIdx = (dirIdx + 1) % 4;
        legsAtLength++;
        if (legsAtLength === 2) { legsAtLength = 0; legLength++; }
      }
    }
    return cells;
  };

  // ===========================================================================
  // CONGRUENCES — Phase 3
  // ===========================================================================

  NumberTheory.mod = function (a, n) {
    a = toBigInt(a, "a");
    n = toBigInt(n, "n");
    if (n <= 0n) throw new Error("Modulus must be a positive integer.");
    return ((a % n) + n) % n;
  };

  // --- Addition and multiplication tables mod n, as 2D arrays; the page renders them as heatmaps. ---
  NumberTheory.addTable = function (n) {
    n = toBigInt(n, "n");
    if (n <= 0n) throw new Error("Modulus must be a positive integer.");
    const N = Number(n);
    const t = [];
    for (let i = 0; i < N; i++) {
      const row = [];
      for (let j = 0; j < N; j++) row.push(BigInt((i + j) % N));
      t.push(row);
    }
    return t;
  };

  NumberTheory.mulTable = function (n) {
    n = toBigInt(n, "n");
    if (n <= 0n) throw new Error("Modulus must be a positive integer.");
    const N = Number(n);
    const t = [];
    for (let i = 0; i < N; i++) {
      const row = [];
      for (let j = 0; j < N; j++) row.push(BigInt((i * j) % N));
      t.push(row);
    }
    return t;
  };

  // --- ax ≡ b (mod n). Solvable iff gcd(a,n) | b; then there are gcd(a,n) solutions mod n.
  //     Returns the full reduced solution set so the page can show "one congruence → many answers". ---
  NumberTheory.solveLinearCongruence = function (a, b, n) {
    a = toBigInt(a, "a");
    b = toBigInt(b, "b");
    n = toBigInt(n, "n");
    if (n <= 0n) throw new Error("Modulus must be a positive integer.");
    a = NumberTheory.mod(a, n);
    b = NumberTheory.mod(b, n);
    const d = NumberTheory.gcd(a, n);
    if (b % d !== 0n) return { solvable: false, gcd: d, reason: `gcd(a, n) = ${d} does not divide b = ${b}` };
    if (d === 1n) {
      const inv = NumberTheory.modInverse(a, n);
      const x = NumberTheory.mod(inv * b, n);
      return { solvable: true, gcd: 1n, count: 1, solutions: [x] };
    }
    const a2 = a / d, b2 = b / d, n2 = n / d;
    const inv = NumberTheory.modInverse(a2, n2);
    const x0 = NumberTheory.mod(inv * b2, n2);
    const solutions = [];
    for (let k = 0n; k < d; k++) solutions.push((x0 + k * n2) % n);
    return { solvable: true, gcd: d, count: Number(d), solutions, x0, modulusClass: n2 };
  };

  // --- Chinese Remainder Theorem. More honest than a naive implementation: handles non-coprime
  //     moduli by checking consistency, and reports "no solution" with a real reason rather than
  //     silently returning a wrong residue. ---
  NumberTheory.crt = function (residues, moduli) {
    if (residues.length !== moduli.length) throw new Error("residues and moduli must have equal length");
    const r = residues.map((v) => toBigInt(v, "residue"));
    const m = moduli.map((v) => toBigInt(v, "modulus"));
    for (const mm of m) if (mm <= 0n) throw new Error("moduli must be positive integers");
    for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) {
      const g = NumberTheory.gcd(m[i], m[j]);
      if (g !== 1n && NumberTheory.mod(r[i] - r[j], g) !== 0n) {
        return { ok: false, reason: `moduli ${m[i]} and ${m[j]} share gcd ${g} but residues differ by a non-multiple of ${g} → inconsistent` };
      }
    }
    let R = 0n, M = 1n;
    for (let i = 0; i < m.length; i++) {
      const a = NumberTheory.mod(M, m[i]);
      const bb = NumberTheory.mod(r[i] - R, m[i]);
      const d = NumberTheory.gcd(a, m[i]);
      if (bb % d !== 0n) return { ok: false, reason: `no integer t solves ${a}·t ≡ ${bb} (mod ${m[i]})` };
      const inv = NumberTheory.modInverse(a / d, m[i] / d);
      const t = NumberTheory.mod(inv * (bb / d), m[i] / d);
      R = R + M * t;
      M = (M / d) * m[i];
      R = NumberTheory.mod(R, M);
    }
    return { ok: true, x: R, modulus: M };
  };

  // --- Fermat's little theorem and Euler's theorem as *checks* the page can demonstrate on any
  //     (base, modulus): returns the predicted value and the actual, so the page shows them equal. ---
  NumberTheory.fermatLittleCheck = function (a, p) {
    a = toBigInt(a, "a");
    p = toBigInt(p, "p");
    if (!NumberTheory.millerRabin(p).prime) return { applies: false, reason: `${p} is not prime — Fermat's little theorem does not apply` };
    if (a % p === 0n) return { applies: true, note: "a is a multiple of p; a^(p−1) ≡ 0", value: 0n };
    const value = NumberTheory.modPow(a, p - 1n, p);
    return { applies: true, value, equalsOne: value === 1n, equation: `${a}^(${p}−1) mod ${p} = ${value}` };
  };

  NumberTheory.eulerTheoremCheck = function (a, n) {
    a = toBigInt(a, "a");
    n = toBigInt(n, "n");
    const phi = NumberTheory.totient(n);
    if (NumberTheory.gcd(a, n) !== 1n) return { applies: false, reason: `gcd(a, n) = ${NumberTheory.gcd(a, n)} ≠ 1 — Euler's theorem requires a coprime to n`, phi };
    const value = NumberTheory.modPow(a, phi, n);
    return { applies: true, phi, value, equalsOne: value === 1n, equation: `${a}^φ(${n}) mod ${n} = ${a}^${phi} mod ${n} = ${value}` };
  };

  // --- Wilson's theorem: (n−1)! ≡ −1 (mod n) iff n is prime. Computed exactly (BigInt factorial). ---
  NumberTheory.wilsonCheck = function (n) {
    n = toBigInt(n, "n");
    if (n < 2n) return { prime: false, factorial: 0n, residue: 0n, note: "n < 2" };
    let fact = 1n;
    for (let i = 2n; i < n; i++) fact = (fact * i) % n;
    const residue = fact % n;
    const prime = residue === n - 1n;
    return { prime, factorial: fact, residue, note: prime ? "(n−1)! ≡ −1 (mod n) → prime" : `(n−1)! ≡ ${residue} (mod ${n}) ≠ −1 → composite` };
  };

  // ===========================================================================
  // MULTIPLICATIVE FUNCTIONS — Phase 4
  // ===========================================================================

  // --- Euler's totient φ(n) via the product formula ∏(1 − 1/p) over prime factors. ---
  NumberTheory.totient = function (n) {
    n = toBigInt(n, "n");
    if (n < 1n) throw new Error("totient is defined for n ≥ 1");
    if (n === 1n) return 1n;
    const f = NumberTheory.factorizeFull(n);
    if (!f.ok) throw new Error("totient: factorization exceeded the operation budget for this n");
    let result = n;
    for (const { p } of f.factors) result -= result / p;
    return result;
  };

  // --- Divisors of n, generated from the prime factorization, sorted ascending. ---
  NumberTheory.divisors = function (n) {
    n = toBigInt(n, "n");
    if (n < 1n) throw new Error("divisors requires n ≥ 1");
    const f = NumberTheory.factorizeFull(n);
    if (!f.ok) throw new Error("divisors: factorization exceeded the operation budget for this n");
    let ds = [1n];
    for (const { p, e } of f.factors) {
      const next = [];
      let pk = 1n;
      for (let k = 0n; k <= e; k++) { for (const d of ds) next.push(d * pk); pk *= p; }
      ds = next;
    }
    ds.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    return ds;
  };

  // --- τ(n) = number of divisors; σ(n) = sum of divisors. Both reuse factorization. ---
  NumberTheory.tau = function (n) {
    n = toBigInt(n, "n");
    if (n < 1n) throw new Error("tau requires n ≥ 1");
    const f = NumberTheory.factorizeFull(n);
    let t = 1n;
    for (const { e } of f.factors) t *= (e + 1n);
    return t;
  };

  NumberTheory.sigma = function (n) {
    n = toBigInt(n, "n");
    if (n < 1n) throw new Error("sigma requires n ≥ 1");
    const f = NumberTheory.factorizeFull(n);
    let s = 1n;
    for (const { p, e } of f.factors) {
      let term = 0n, pk = 1n;
      for (let k = 0n; k <= e; k++) { term += pk; pk *= p; }
      s *= term;
    }
    return s;
  };

  NumberTheory.sigmaK = function (n, k) {
    n = toBigInt(n, "n");
    const kk = toBigInt(k, "k");
    const ds = NumberTheory.divisors(n);
    return ds.reduce((s, d) => {
      let r = 1n, b = d, pw = kk;
      while (pw > 0n) { if (pw & 1n) r *= b; b *= b; pw >>= 1n; }
      return s + r;
    }, 0n);
  };

  // --- deficient / perfect / abundant via the aliquot sum σ(n) − n. ---
  NumberTheory.aliquotClass = function (n) {
    n = toBigInt(n, "n");
    const s = NumberTheory.sigma(n) - n; // aliquot sum = sum of *proper* divisors
    return { aliquot: s, class: s === n ? "perfect" : s > n ? "abundant" : "deficient", sum: s };
  };

  // --- ω(n) distinct primes, Ω(n) with multiplicity, Liouville λ(n) = (−1)^Ω, Möbius μ(n). ---
  NumberTheory.omegaDistinct = function (n) {
    const f = NumberTheory.factorizeFull(n);
    return f.ok ? BigInt(f.factors.length) : null;
  };

  NumberTheory.omegaTotal = function (n) {
    const f = NumberTheory.factorizeFull(n);
    return f.ok ? f.factors.reduce((s, p) => s + p.e, 0n) : null;
  };

  NumberTheory.liouville = function (n) {
    const om = NumberTheory.omegaTotal(n);
    if (om === null) return null;
    return om % 2n === 0n ? 1n : -1n;
  };

  NumberTheory.mobius = function (n) {
    n = toBigInt(n, "n");
    if (n < 1n) throw new Error("Möbius is defined for n ≥ 1");
    if (n === 1n) return 1n;
    const f = NumberTheory.factorizeFull(n);
    if (!f.ok) throw new Error("mobius: factorization exceeded the operation budget for this n");
    if (f.factors.some((p) => p.e > 1)) return 0n;
    return BigInt(f.factors.length) % 2n === 0n ? 1n : -1n;
  };

  // ===========================================================================
  // PRIMITIVE ROOTS — Phase 5
  // ===========================================================================

  // --- Multiplicative order of a mod n: smallest k>0 with a^k ≡ 1 (mod n). Undefined unless
  //     gcd(a,n)=1. Computed by testing divisors of φ(n) ascending (the order always divides φ). ---
  NumberTheory.multiplicativeOrder = function (a, n) {
    a = toBigInt(a, "a");
    n = toBigInt(n, "n");
    if (n <= 0n) throw new Error("Modulus must be a positive integer.");
    if (NumberTheory.gcd(a, n) !== 1n) return { ok: false, reason: `gcd(a, n) = ${NumberTheory.gcd(a, n)} ≠ 1; the order is undefined` };
    a = NumberTheory.mod(a, n);
    if (a === 1n) return { ok: true, order: 1n, phi: NumberTheory.totient(n) };
    const phi = NumberTheory.totient(n);
    const divs = NumberTheory.divisors(phi).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    for (const d of divs) if (NumberTheory.modPow(a, d, n) === 1n) return { ok: true, order: d, phi };
    return { ok: false, reason: "unexpected: no divisor of φ(n) produced 1" };
  };

  // --- Primitive roots exist only for n ∈ {1, 2, 4, p^k, 2p^k} (p an odd prime). ---
  NumberTheory.hasPrimitiveRoot = function (n) {
    n = toBigInt(n, "n");
    if (n < 1n) return false;
    if (n === 1n || n === 2n || n === 4n) return true;
    if (n % 2n === 0n) {
      const m = n / 2n;
      if (m % 2n === 0n) return false;
      n = m;
    }
    const f = NumberTheory.factorizeFull(n);
    if (!f.ok) return false;
    return f.factors.length === 1; // single odd-prime power
  };

  NumberTheory.isPrimitiveRoot = function (g, n) {
    g = toBigInt(g, "g");
    n = toBigInt(n, "n");
    if (!NumberTheory.hasPrimitiveRoot(n)) return { primitive: false, reason: `n = ${n} has no primitive roots` };
    const phi = NumberTheory.totient(n);
    if (NumberTheory.gcd(g, n) !== 1n) return { primitive: false, reason: `gcd(g, n) ≠ 1` };
    const o = NumberTheory.multiplicativeOrder(g, n);
    return { primitive: o.ok && o.order === phi, order: o.ok ? o.order : null, phi };
  };

  // --- All primitive roots mod n, derived from one generator g: they are g^k for gcd(k, φ(n)) = 1.
  //     Also returns the powers g^0…g^{φ−1} so the page can draw the modular rosette. ---
  NumberTheory.primitiveRoots = function (n) {
    n = toBigInt(n, "n");
    if (n <= 0n) throw new Error("Modulus must be a positive integer.");
    if (!NumberTheory.hasPrimitiveRoot(n)) return { exists: false, reason: `n = ${n} has no primitive roots (they exist only for 1, 2, 4, p^k, 2p^k)` };
    const phi = NumberTheory.totient(n);
    let g = 2n;
    while (g < n && !NumberTheory.isPrimitiveRoot(g, n).primitive) g++;
    if (g >= n) return { exists: false, reason: "no generator found" };
    const roots = [];
    for (let k = 1n; k <= phi; k++) if (NumberTheory.gcd(k, phi) === 1n) roots.push(NumberTheory.modPow(g, k, n));
    roots.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    const powers = [];
    for (let k = 0n; k < phi; k++) powers.push(NumberTheory.modPow(g, k, n));
    return { exists: true, generator: g, phi, roots, count: roots.length, powers };
  };

  // --- Discrete logarithm: solve g^x ≡ h (mod n) via baby-step giant-step. Bounded; reports
  //     "not found" honestly when h is outside the subgroup generated by g. ---
  NumberTheory.discreteLog = function (g, h, n, opts) {
    const maxSteps = opts && opts.maxSteps != null ? opts.maxSteps : 1000000;
    g = toBigInt(g, "g");
    h = toBigInt(h, "h");
    n = toBigInt(n, "n");
    if (n <= 0n) throw new Error("Modulus must be a positive integer.");
    g = NumberTheory.mod(g, n);
    h = NumberTheory.mod(h, n);
    const m = NumberTheory.isqrt(n) + 1n;
    const table = new Map();
    let cur = 1n, steps = 0;
    for (let j = 0n; j < m; j++) {
      if (++steps > maxSteps) return { ok: false, reason: `exceeded budget building the baby-step table` };
      const key = cur.toString();
      if (!table.has(key)) table.set(key, j);
      cur = (cur * g) % n;
    }
    const inv = NumberTheory.modInverse(g, n);
    if (inv === null) return { ok: false, reason: "g is not invertible mod n" };
    const factor = NumberTheory.modPow(inv, m, n);
    let gamma = h;
    for (let i = 0n; i < m; i++) {
      const key = gamma.toString();
      if (table.has(key)) {
        const j = table.get(key);
        const x = i * m + j;
        if (NumberTheory.modPow(g, x, n) === h) return { ok: true, x, i, j, babySteps: m, giantSteps: i + 1n };
      }
      gamma = (gamma * factor) % n;
      if (++steps > maxSteps) return { ok: false, reason: `exceeded budget in the giant-step phase` };
    }
    return { ok: false, reason: "no solution: h is not a power of g mod n" };
  };

  // ===========================================================================
  // QUADRATIC RESIDUES — Phase 6
  // ===========================================================================

  // --- Quadratic residues mod p: the distinct values of x² mod p for x = 1…p−1. ---
  NumberTheory.quadraticResidues = function (p) {
    p = toBigInt(p, "p");
    if (p < 2n) throw new Error("p must be at least 2");
    const set = new Set();
    for (let x = 1n; x < p; x++) set.add((x * x) % p);
    return [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  };

  // --- Legendre symbol (a/p) via Euler's criterion: a^((p−1)/2) mod p ∈ {0, ±1}. ---
  NumberTheory.legendreSymbol = function (a, p) {
    a = toBigInt(a, "a");
    p = toBigInt(p, "p");
    if (p < 2n) throw new Error("Legendre symbol requires an odd prime p");
    a = NumberTheory.mod(a, p);
    const r = NumberTheory.modPow(a, (p - 1n) / 2n, p);
    return r === 1n ? 1n : r === p - 1n ? -1n : 0n;
  };

  NumberTheory.isQuadraticResidue = function (a, p) {
    return NumberTheory.legendreSymbol(a, p) === 1n;
  };

  // --- Jacobi symbol (a/n) for odd n, via the reciprocity-based quadratic-remainder algorithm
  //     (no factorization needed — fast even for enormous n). ---
  NumberTheory.jacobiSymbol = function (a, n) {
    a = toBigInt(a, "a");
    n = toBigInt(n, "n");
    if (n <= 0n || n % 2n === 0n) throw new Error("Jacobi symbol requires an odd positive integer n");
    a = NumberTheory.mod(a, n);
    let result = 1n;
    while (a !== 0n) {
      while (a % 2n === 0n) {
        a /= 2n;
        const r = n % 8n;
        if (r === 3n || r === 5n) result = -result;
      }
      const tmp = a; a = n; n = tmp;
      if (a % 4n === 3n && n % 4n === 3n) result = -result;
      a %= n;
    }
    return n === 1n ? result : 0n;
  };

  // --- Tonelli–Shanks: a square root of a mod an odd prime p, or null when a is a non-residue.
  //     The constructive half of "is a a QR mod p". ---
  NumberTheory.tonelliShanks = function (a, p) {
    a = toBigInt(a, "a");
    p = toBigInt(p, "p");
    if (p === 2n) return NumberTheory.mod(a, p);
    a = NumberTheory.mod(a, p);
    if (a === 0n) return 0n;
    if (NumberTheory.legendreSymbol(a, p) !== 1n) return null;
    if (p % 4n === 3n) return NumberTheory.modPow(a, (p + 1n) / 4n, p);
    let q = p - 1n, s = 0n;
    while (q % 2n === 0n) { q /= 2n; s++; }
    let z = 2n;
    while (NumberTheory.legendreSymbol(z, p) !== -1n) z++;
    let m = s;
    let c = NumberTheory.modPow(z, q, p);
    let t = NumberTheory.modPow(a, q, p);
    let r = NumberTheory.modPow(a, (q + 1n) / 2n, p);
    while (t !== 1n) {
      let i = 0n, t2 = t;
      while (t2 !== 1n) { t2 = (t2 * t2) % p; i++; if (i >= m) return null; }
      const b = NumberTheory.modPow(c, 2n ** (m - i - 1n), p);
      m = i;
      c = (b * b) % p;
      t = (t * c) % p;
      r = (r * b) % p;
    }
    return r;
  };

  // ===========================================================================
  // CRYPTOGRAPHY — Phase 7
  // ===========================================================================

  // --- Fast (binary) modular exponentiation with a per-bit trace: the table the page animates.
  //     Each row records the current base, the accumulator, and whether that bit was "on". ---
  NumberTheory.modPowTrace = function (base, exp, mod) {
    base = toBigInt(base, "base");
    exp = toBigInt(exp, "exponent");
    mod = toBigInt(mod, "modulus");
    if (mod <= 0n) throw new Error("Modulus must be a positive integer.");
    base = NumberTheory.mod(base, mod);
    const bits = [];
    let e = exp, tmp = e;
    while (tmp > 0n) { bits.push(tmp & 1n); tmp >>= 1n; }
    const steps = [];
    let result = 1n, b = base;
    for (let i = 0; i < bits.length; i++) {
      const on = bits[i] === 1n;
      const afterMul = on ? (result * b) % mod : result;
      steps.push({ bitIndex: i, bitOn: on, base: b, accumulatorBefore: result, accumulatorAfter: afterMul, action: on ? "bit is 1 → multiply, then square base" : "bit is 0 → just square base" });
      result = afterMul;
      b = (b * b) % mod;
    }
    return { result, steps, binary: exp.toString(2) };
  };

  // --- RSA. Keygen validates that p, q are prime (Miller-Rabin) and chooses a public exponent e
  //     coprime to φ(n). Encrypt/decrypt are just modPow; the lesson is *why* it round-trips. ---
  NumberTheory.rsaKeygen = function (p, q) {
    p = toBigInt(p, "p");
    q = toBigInt(q, "q");
    if (!NumberTheory.millerRabin(p).prime) throw new Error("p is not prime");
    if (!NumberTheory.millerRabin(q).prime) throw new Error("q is not prime");
    if (p === q) throw new Error("p and q must be distinct primes");
    const n = p * q;
    const phi = (p - 1n) * (q - 1n);
    let e = 65537n;
    if (e >= phi || NumberTheory.gcd(e, phi) !== 1n) { e = 3n; while (NumberTheory.gcd(e, phi) !== 1n) e += 2n; }
    const d = NumberTheory.modInverse(e, phi);
    return { p, q, n, phi, e, d };
  };

  NumberTheory.rsaEncrypt = function (m, e, n) {
    m = toBigInt(m, "message");
    return NumberTheory.modPow(m, e, n);
  };

  NumberTheory.rsaDecrypt = function (c, d, n) {
    c = toBigInt(c, "ciphertext");
    return NumberTheory.modPow(c, d, n);
  };

  // --- Deterministic prime of ~bits length, found by searching odd candidates from 2^bits. ---
  NumberTheory.generatePrime = function (bits) {
    bits = Number(toBigInt(bits, "bits"));
    if (bits < 2) throw new Error("bits must be ≥ 2");
    let c = (1n << BigInt(bits)) | 1n; // odd
    while (!NumberTheory.millerRabin(c).prime) c += 2n;
    return c;
  };

  // --- Diffie-Hellman key exchange on (p, g, privateA, privateB). Returns both public values and
  //     both shared secrets so the page shows they match despite never transmitting the privates. ---
  NumberTheory.diffieHellman = function (p, g, a, b) {
    p = toBigInt(p, "p");
    g = toBigInt(g, "g");
    a = toBigInt(a, "privateA");
    b = toBigInt(b, "privateB");
    if (!NumberTheory.millerRabin(p).prime) throw new Error("Diffie-Hellman requires p prime");
    const A = NumberTheory.modPow(g, a, p);
    const B = NumberTheory.modPow(g, b, p);
    const sharedA = NumberTheory.modPow(B, a, p);
    const sharedB = NumberTheory.modPow(A, b, p);
    return { A, B, sharedA, sharedB, match: sharedA === sharedB };
  };

  // --- Affine cipher over the 26-letter alphabet: E(x) = a·x + b mod 26, with a coprime to 26.
  //     Non-letters pass through unchanged. ---
  function affineTransform(text, a, b, decrypt) {
    const m = 26n;
    a = toBigInt(a, "a");
    b = toBigInt(b, "b");
    if (NumberTheory.gcd(a, m) !== 1n) throw new Error("a must be coprime to 26 (the key is not invertible)");
    const coeff = decrypt ? NumberTheory.modInverse(a, m) : a;
    const shift = decrypt ? NumberTheory.mod(-coeff * b, m) : b;
    return text.toUpperCase().split("").map((ch) => {
      if (ch >= "A" && ch <= "Z") {
        const x = BigInt(ch.charCodeAt(0) - 65);
        const y = NumberTheory.mod(coeff * x + shift, m);
        return String.fromCharCode(Number(y) + 65);
      }
      return ch;
    }).join("");
  }
  NumberTheory.affineEncrypt = function (text, a, b) { return affineTransform(text, a, b, false); };
  NumberTheory.affineDecrypt = function (text, a, b) { return affineTransform(text, a, b, true); };

  // --- Hill cipher, 2×2 key matrix mod 26. Determinant must be coprime to 26 for an inverse to
  //     exist; the inverse matrix is computed by the adjugate × det⁻¹ mod 26 formula. ---
  NumberTheory.hillEncrypt = function (text, key) {
    const m = 26n;
    const [[a, b], [c, d]] = key.map((row) => row.map((v) => toBigInt(v, "key entry")));
    let det = NumberTheory.mod(a * d - b * c, m);
    if (NumberTheory.gcd(det, m) !== 1n) throw new Error("key determinant is not coprime to 26 — the cipher is not invertible");
    const cleaned = text.toUpperCase().replace(/[^A-Z]/g, "");
    const padded = cleaned.length % 2 ? cleaned + "X" : cleaned;
    let out = "";
    for (let i = 0; i < padded.length; i += 2) {
      const x = BigInt(padded.charCodeAt(i) - 65);
      const y = BigInt(padded.charCodeAt(i + 1) - 65);
      const X = NumberTheory.mod(a * x + b * y, m);
      const Y = NumberTheory.mod(c * x + d * y, m);
      out += String.fromCharCode(Number(X) + 65) + String.fromCharCode(Number(Y) + 65);
    }
    return out;
  };

  NumberTheory.hillDecrypt = function (text, key) {
    const m = 26n;
    const [[a, b], [c, d]] = key.map((row) => row.map((v) => toBigInt(v, "key entry")));
    let det = NumberTheory.mod(a * d - b * c, m);
    if (NumberTheory.gcd(det, m) !== 1n) throw new Error("key determinant is not coprime to 26");
    const invDet = NumberTheory.modInverse(det, m);
    // inverse matrix = invDet * [[d, -b], [-c, a]]
    const A = NumberTheory.mod(invDet * d, m);
    const B = NumberTheory.mod(-b * invDet, m);
    const C = NumberTheory.mod(-c * invDet, m);
    const D = NumberTheory.mod(a * invDet, m);
    let out = "";
    for (let i = 0; i < text.length; i += 2) {
      const x = BigInt(text.charCodeAt(i) - 65);
      const y = BigInt(text.charCodeAt(i + 1) - 65);
      out += String.fromCharCode(Number(NumberTheory.mod(A * x + B * y, m)) + 65);
      out += String.fromCharCode(Number(NumberTheory.mod(C * x + D * y, m)) + 65);
    }
    return out;
  };

  // ===========================================================================
  // RECOMMENDED ADDITIONS — continued fractions, Pell, Frobenius
  // ===========================================================================

  // --- Regular continued-fraction expansion of √D. Returns a0 = floor(√D) and the periodic part;
  //     perfect squares return an empty period. The page draws the convergents' accuracy. ---
  NumberTheory.continuedFractionSqrt = function (D, maxTerms) {
    D = toBigInt(D, "D");
    maxTerms = maxTerms == null ? 200 : maxTerms;
    if (D < 0n) throw new Error("D must be non-negative");
    const a0 = NumberTheory.isqrt(D);
    if (a0 * a0 === D) return { perfectSquare: true, a0, period: [] };
    let m = 0n, d = 1n, a = a0;
    const period = [];
    for (let i = 0; i < maxTerms; i++) {
      m = d * a - m;
      d = (D - m * m) / d;
      a = (a0 + m) / d;
      period.push(a);
      if (a === 2n * a0) break;
    }
    return { perfectSquare: false, a0, period };
  };

  // --- Convergents p_n/q_n of the continued fraction [a0; a1, a2, …] (period repeated as needed).
  //     Returns the list of {p, q} convergents and the count used. ---
  NumberTheory.convergents = function (a0, period, count) {
    a0 = toBigInt(a0, "a0");
    count = Number(toBigInt(count, "count"));
    if (count < 1) return [];
    const conv = [];
    let pPrev = 1n, qPrev = 0n, p = a0, q = 1n;
    conv.push({ p, q });
    for (let n = 1; n < count; n++) {
      const term = period.length ? toBigInt(period[(n - 1) % period.length], "cf term") : 0n;
      const np = term * p + pPrev;
      const nq = term * q + qPrev;
      pPrev = p; qPrev = q; p = np; q = nq;
      conv.push({ p, q });
    }
    return conv;
  };

  // --- Pell's equation x² − D·y² = 1 via the continued fraction of √D: the fundamental solution
  //     is a convergent reached within the first (or, for odd period length, second) period. ---
  NumberTheory.pellSolve = function (D, maxTerms) {
    D = toBigInt(D, "D");
    maxTerms = maxTerms == null ? 400 : maxTerms;
    const a0 = NumberTheory.isqrt(D);
    if (a0 * a0 === D) return { solvable: false, reason: `D = ${D} is a perfect square; only the trivial solutions x = ±1, y = 0 exist` };
    const { period } = NumberTheory.continuedFractionSqrt(D, maxTerms);
    if (!period.length) return { solvable: false, reason: "continued fraction did not settle within budget" };
    const r = period.length;
    let pPrev = 1n, qPrev = 0n, p = a0, q = 1n;
    for (let n = 1; n <= maxTerms; n++) {
      const term = period[(n - 1) % r];
      const np = term * p + pPrev;
      const nq = term * q + qPrev;
      pPrev = p; qPrev = q; p = np; q = nq;
      if (p * p - D * q * q === 1n) return { solvable: true, x: p, y: q, termsUsed: n, periodLength: r };
    }
    return { solvable: false, reason: "did not find the fundamental solution within the term budget" };
  };

  // --- Frobenius number (the "coin problem") for two coprime positive integers: the largest
  //     integer not representable as a non-negative combination a·x + b·y is ab − a − b. ---
  NumberTheory.frobenius = function (a, b) {
    a = toBigInt(a, "a");
    b = toBigInt(b, "b");
    if (a < 1n || b < 1n) throw new Error("a and b must be positive");
    if (NumberTheory.gcd(a, b) !== 1n) return { exists: false, reason: "a and b are not coprime; infinitely many integers are not representable" };
    return { exists: true, frobenius: a * b - a - b };
  };

  return NumberTheory;
});
