"use strict";
/* Symbolic Kernel — Phase 4 (foundation slice) PROPERTY suite.
   Run with: node tests/verify-series-properties.js

   Seeded-random property tests with INDEPENDENT cross-checks — the discipline from
   docs/kernel/03_ARCHITECTURE.md §3 L4: the kernel never verifies itself with its own
   primitives. Each property holds the kernel output against a separate, naive reference built
   only for the test (Number arithmetic, finite differences, partial sums, log-log slopes):

     - differentiate:  symbolic derivative == central finite-difference derivative.
     - taylor:         Maclaurin of a polynomial reproduces its coefficients exactly; truncated
                       partial sum approximates the function within the radius of convergence.
     - laurent:        pole order at a constructed pole of order m == m; the Laurent series
                       reconstructs the function on a small annulus about the pole.
     - singularity:    a constructed pole of order m classifies as pole order m; the numeric
                       log-log blowup slope near the pole is ~ -m; a cancelled factor is removable.
     - convergence:    geometric radius == 1/|ratio|; rationalInN radius == 1; partial sums
                       converge inside the radius and diverge outside.
     - limit:          polynomial limits, rational limits at infinity (leading-coefficient ratio),
                       and 0/0 removable quotients match a two-sided numeric approach.

   Honest-refusal counters assert the deferred classes (Puiseux branch point, essential
   singularity, oscillatory limit) are refused with a reason, never silently wrong.

   The RNG is a fixed-seed mulberry32 so failures are reproducible. Generators are bounded
   (small coefficients, low degrees, evaluation points kept away from poles and within
   convergence radii) to avoid float64 ill-conditioned phantom failures — the same discipline as
   verify-poly-properties.js. */

const path = require("path");
const K = (...p) => path.join(__dirname, "..", "assets", "js", "kernel", ...p);
const { Expr, Rational } = require(K("expr"));
const { differentiate } = require(K("differentiate"));
const { taylor } = require(K("taylor"));
const { laurent } = require(K("laurent"));
const { classifySingularity } = require(K("singularity"));
const { powerSeriesConvergence } = require(K("convergence"));
const { limit } = require(K("limit"));

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error("  FAIL  " + label); }
}

// ---- mulberry32 RNG, fixed seed ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260727);
const ri = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1)); // inclusive
const rint = (n) => BigInt(ri(-n, n));
const rr = (n) => { // small nonzero rational
  let num = rint(n);
  if (num === 0n) num = 1n;
  const den = BigInt(ri(1, n));
  return Rational.of(num, den);
};
const R = (a, b = 1n) => Rational.of(BigInt(a), b);

const x = () => Expr.sym("x");
const I = (n) => Expr.int(BigInt(n));
const Q = (a, b) => Expr.rat(BigInt(a), BigInt(b));

// ---- independent numeric evaluator (Number arithmetic; no kernel primitives) ----
function numEval(e, env) {
  switch (e.kind) {
    case "Integer": return Number(e.value);
    case "Rational": { const v = e.value; return Number(v.num) / Number(v.den); }
    case "Symbol": return env[e.name];
    case "Add": return e.args.reduce((s, a) => s + numEval(a, env), 0);
    case "Mul": return e.args.reduce((p, a) => p * numEval(a, env), 1);
    case "Pow": return Math.pow(numEval(e.base, env), numEval(e.exp, env));
    case "Func": {
      const a = numEval(e.args[0], env);
      switch (e.name) {
        case "sin": return Math.sin(a);
        case "cos": return Math.cos(a);
        case "tan": return Math.tan(a);
        case "exp": return Math.exp(a);
        case "ln": case "log": return Math.log(Math.abs(a));
        case "sqrt": return Math.sqrt(a);
        case "abs": return Math.abs(a);
        default: throw new Error("numEval func " + e.name);
      }
    }
    default: throw new Error("numEval kind " + e.kind);
  }
}
function fdDiff(f, env, name, a, h) {
  return (numEval(f, { ...env, [name]: a + h }) - numEval(f, { ...env, [name]: a - h })) / (2 * h);
}

// Build a polynomial Expr Sum c_k x^k from a coefficient array (ascending, Rationals/numbers).
function polyExpr(coeffs, v) {
  const terms = [];
  for (let k = 0; k < coeffs.length; k++) {
    const c = coeffs[k];
    if (typeof c !== "object") c = R(c);
    if (c.isZero) continue;
    const cE = c.isInteger ? I(Number(c.num)) : Expr.rat(c.num, c.den);
    terms.push(k === 0 ? cE : Expr.mul(cE, k === 1 ? v : Expr.pow(v, I(k))));
  }
  return terms.length ? (terms.length === 1 ? terms[0] : Expr.add(...terms)) : I(0);
}
function randPolyExpr(maxDeg, coeffBound, v) {
  const deg = ri(0, maxDeg);
  const cs = [];
  for (let k = 0; k <= deg; k++) cs.push(rr(coeffBound));
  return { expr: polyExpr(cs, v), coeffs: cs };
}

// Read Maclaurin (center 0) coefficients k -> Rational from a result Expr in x.
function maclaurinCoeffs(result, varName) {
  const coeffs = {};
  const terms = result.kind === "Add" ? result.args : [result];
  for (const t of terms) {
    let k = 0; let c = Rational.ONE;
    const factors = t.kind === "Mul" ? t.args : [t];
    for (const f of factors) {
      if (Expr.isNumeric(f)) { c = c.mul(Expr.numericValue(f)); continue; }
      if (f.kind === "Symbol" && f.name === varName) { k += 1; continue; }
      if (f.kind === "Pow" && f.base.kind === "Symbol" && f.base.name === varName && f.exp.kind === "Integer") { k += Number(f.exp.value); continue; }
      return null;
    }
    coeffs[k] = (coeffs[k] || Rational.ZERO).add(c);
  }
  return coeffs;
}

// numeric log-log blowup slope near a pole of order m: log|f| ~ -m log|x-a|.
function blowupSlope(f, a, side) {
  const xs = [], ys = [];
  for (let i = 1; i <= 6; i++) {
    const h = Math.pow(10, -i - 1);
    const xv = a + side * h;
    let fv;
    try { fv = numEval(f, { x: xv }); } catch { continue; }
    if (!isFinite(fv) || fv === 0) continue;
    xs.push(Math.log(Math.abs(h)));
    ys.push(Math.log(Math.abs(fv)));
  }
  if (xs.length < 3) return NaN;
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / xs.length;
  let num = 0, den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? NaN : num / den;
}

console.log("Symbolic Kernel — Phase 4 (foundation slice) property suite\n");

// ============================================================ differentiate
console.log("differentiate == finite-difference (240 random trials)");
{
  let n = 0;
  for (let t = 0; t < 240; t++) {
    // random low-degree polynomial in x
    const { expr } = randPolyExpr(4, 6, x());
    const a = ri(-3, 3) + (rand() - 0.5); // a moderate eval point
    const d = differentiate(expr, "x");
    if (d.refused) { ok(false, "differentiate refused a polynomial (#" + t + ")"); continue; }
    const h = 1e-5;
    const nd = fdDiff(expr, {}, "x", a, h);
    const sd = numEval(d.result, { x: a });
    ok(Math.abs(nd - sd) < 1e-3 * (1 + Math.abs(nd)), "poly derivative matches fd (#" + t + ")");
    n++;
  }
  // compositions: sin(p(x)), exp(p(x)), ln(positive poly)
  const forms = [
    (p) => Expr.func("sin", [p]),
    (p) => Expr.func("cos", [p]),
    (p) => Expr.func("exp", [p]),
  ];
  for (let t = 0; t < 60; t++) {
    const { expr } = randPolyExpr(2, 3, x());
    const form = forms[ri(0, forms.length - 1)];
    const fe = form(expr);
    const a = ri(-2, 2) * 0.5 + 0.1;
    const d = differentiate(fe, "x");
    if (d.refused) { ok(false, "differentiate refused a composition (#" + t + ")"); continue; }
    const h = 1e-5;
    const nd = fdDiff(fe, {}, "x", a, h);
    const sd = numEval(d.result, { x: a });
    ok(Math.abs(nd - sd) < 1e-3 * (1 + Math.abs(nd)), "composition derivative matches fd (#" + t + ")");
    n++;
  }
  ok(n > 200, "differentiate property exercised a meaningful number of cases (" + n + ")");
}

// ============================================================ taylor
console.log("\ntaylor — polynomial reconstitution + partial-sum vs function (120 trials)");
{
  let reconOK = 0;
  for (let t = 0; t < 60; t++) {
    const deg = ri(0, 4);
    const cs = [];
    for (let k = 0; k <= deg; k++) cs.push(rr(5));
    const p = polyExpr(cs, x());
    const tt = taylor(p, "x", 0, deg);
    if (tt.refused) { ok(false, "taylor refused a polynomial (#" + t + ")"); continue; }
    const got = maclaurinCoeffs(tt.result, "x");
    if (!got) { ok(false, "taylor polynomial not a clean Maclaurin form (#" + t + ")"); continue; }
    let good = true;
    for (let k = 0; k <= deg; k++) {
      const g = got[k];
      const exp = cs[k].isZero ? undefined : cs[k];
      if (exp === undefined) { if (g !== undefined && !g.isZero) good = false; }
      else { if (g === undefined || !g.equals(cs[k])) good = false; }
    }
    ok(good, "taylor reproduces polynomial coeffs exactly (#" + t + ")");
    if (good) reconOK++;
  }
  ok(reconOK > 40, "taylor polynomial reconstitution succeeded in " + reconOK + " cases");

  // partial-sum vs function for e^x, sin x, cos x, 1/(1-x) within radius
  let psOK = 0;
  const analytic = [
    { f: Expr.func("exp", [x()]), pts: [-0.4, -0.1, 0.2, 0.35], ref: (xv) => Math.exp(xv), order: 6 },
    { f: Expr.func("sin", [x()]), pts: [-0.5, -0.2, 0.3, 0.5], ref: (xv) => Math.sin(xv), order: 7 },
    { f: Expr.func("cos", [x()]), pts: [-0.5, -0.2, 0.3, 0.5], ref: (xv) => Math.cos(xv), order: 7 },
    { f: Expr.div(I(1), Expr.sub(I(1), x())), pts: [-0.4, -0.2, 0.1, 0.3], ref: (xv) => 1 / (1 - xv), order: 8 },
  ];
  for (let t = 0; t < analytic.length * 6; t++) {
    const a = analytic[t % analytic.length];
    const tt = taylor(a.f, "x", 0, a.order);
    if (tt.refused) { ok(false, "taylor refused an analytic function (#" + t + ")"); continue; }
    let good = true;
    for (const xv of a.pts) {
      if (Math.abs(numEval(tt.result, { x: xv }) - a.ref(xv)) > 1e-3) good = false;
    }
    ok(good, "taylor partial sum approximates function within radius (#" + t + " " + a.f.kind + ")");
    if (good) psOK++;
  }
  ok(psOK > 15, "taylor partial-sum property succeeded in " + psOK + " cases");
}

// ============================================================ laurent
console.log("\nlaurent — constructed pole order + annulus reconstruction (80 trials)");
{
  let okc = 0;
  for (let t = 0; t < 80; t++) {
    // pole at a of order m; denominator (x-a)^m * (1 + x^2) (no other real poles)
    const aNum = BigInt(ri(-3, 3));
    const aDen = BigInt(ri(1, 3));
    const a = Rational.of(aNum, aDen);
    const m = ri(1, 2);
    const aExpr = a.isInteger ? I(Number(a.num)) : Expr.rat(a.num, a.den);
    const lin = Expr.sub(x(), aExpr); // (x - a)
    const den = Expr.mul(Expr.pow(lin, I(m)), Expr.add(I(1), Expr.pow(x(), I(2))));
    // nonzero constant numerator so the constructed pole is NOT cancelled by P(a)=0.
    const num = polyExpr([rr(4)], x());
    const f = Expr.div(num, den);
    const L = laurent(f, "x", a, 3);
    if (L.refused) { ok(false, "laurent refused a constructed-pole rational (#" + t + "): " + L.reason); continue; }
    ok(L.poleOrder === m, "laurent pole order == constructed m (" + m + ") (#" + t + ")");
    // reconstruct on a small annulus a +/- h (h small; the (1+x^2) factor never vanishes)
    let good = L.poleOrder === m;
    for (const h of [0.05, 0.1]) {
      for (const s of [+1, -1]) {
        const xv = Number(a.num) / Number(a.den) + s * h;
        let av, bv;
        try { av = numEval(L.result, { x: xv }); bv = numEval(f, { x: xv }); } catch { continue; }
        if (!isFinite(av) || !isFinite(bv) || Math.abs(av - bv) > 1e-2 * (1 + Math.abs(bv))) good = false;
      }
    }
    ok(good, "laurent reconstructs f near the pole (#" + t + ")");
    if (good) okc++;
  }
  ok(okc > 50, "laurent property succeeded in " + okc + " cases");
}

// ============================================================ singularity
console.log("\nsingularity — pole order + log-log slope + removable (100 trials)");
{
  let okc = 0;
  for (let t = 0; t < 70; t++) {
    const aNum = BigInt(ri(-3, 3));
    const aDen = BigInt(ri(1, 3));
    const a = Rational.of(aNum, aDen);
    const m = ri(1, 3);
    const aExpr = a.isInteger ? I(Number(a.num)) : Expr.rat(a.num, a.den);
    const lin = Expr.sub(x(), aExpr);
    const den = Expr.mul(Expr.pow(lin, I(m)), Expr.add(I(1), Expr.pow(x(), I(2))));
    // nonzero constant numerator so the constructed pole order is exactly m (not cancelled).
    const num = polyExpr([rr(4)], x());
    const f = Expr.div(num, den);
    const c = classifySingularity(f, "x", a);
    if (c.refused) { ok(false, "singularity refused a pole (#" + t + "): " + c.reason); continue; }
    ok(c.kind === "pole" && c.order === m, "classify pole order " + m + " (#" + t + ")");
    const aNum_ = Number(a.num) / Number(a.den);
    const slope = blowupSlope(f, aNum_, +1);
    ok(Math.abs(slope - (-m)) < 0.25, "blowup slope ~ -" + m + " (#" + t + ", slope=" + slope.toFixed(2) + ")");
    if (c.kind === "pole" && c.order === m) okc++;
  }
  // removable: ((x-a)^j * P) / (x-a)^k with j>k -> pole order k-j (or removable if j>=k)
  let remOK = 0;
  for (let t = 0; t < 30; t++) {
    const a = ri(-3, 3);
    const lin = Expr.sub(x(), I(a));
    const j = ri(2, 4), k = ri(1, j - 1); // j > k -> removable
    const num = Expr.mul(Expr.pow(lin, I(j)), Expr.add(I(1), Expr.mul(I(2), x())));
    const den = Expr.pow(lin, I(k));
    const f = Expr.div(num, den);
    const c = classifySingularity(f, "x", a);
    ok(!c.refused && c.kind === "removable", "classify removable (j>k) (#" + t + ")");
    // numeric: f is finite near a
    const v = numEval(f, { x: a + 0.01 });
    ok(isFinite(v), "removable is finite near a (#" + t + ")");
    if (!c.refused && c.kind === "removable") remOK++;
  }
  ok(okc > 45, "singularity pole property succeeded in " + okc + " cases");
  ok(remOK > 20, "singularity removable property succeeded in " + remOK + " cases");
}

// ============================================================ convergence
console.log("\nconvergence — radius exact + partial-sum behavior (90 trials)");
{
  // geometric: radius = 1/|ratio|; partial sums converge inside, diverge outside.
  let okc = 0;
  for (let t = 0; t < 50; t++) {
    const rnum = BigInt(ri(-4, 4));
    const rden = BigInt(ri(1, 5));
    if (rnum === 0n) continue;
    const ratio = Rational.of(rnum, rden);
    const res = powerSeriesConvergence({ kind: "geometric", first: R(1), ratio }, "x", 0);
    if (res.refused) { ok(false, "convergence refused a geometric (#" + t + ")"); continue; }
    const absR = ratio.sign < 0 ? ratio.neg() : ratio;
    ok(res.radius.equals(Rational.ONE.div(absR)), "geometric radius == 1/|ratio| (#" + t + ")");
    // numeric: partial sums of first*ratio^n * x^n = first*(ratio*x)^n converge iff |ratio*x|<1.
    const rN = Number(ratio.num) / Number(ratio.den);
    const inside = 0.5 / Math.max(Math.abs(rN), 0.1); // |r*x| = 0.5 inside
    const outside = 1.5 / Math.max(Math.abs(rN), 0.1); // |r*x| = 1.5 outside
    function sumGeo(xv, N) { let s = 0; for (let n = 0; n <= N; n++) s += Math.pow(rN * xv, n); return s; }
    const sin1 = sumGeo(inside, 200), sin2 = sumGeo(inside, 400);
    const sout1 = sumGeo(outside, 200), sout2 = sumGeo(outside, 400);
    ok(Math.abs(sin1 - sin2) < 1e-3 * (1 + Math.abs(sin2)), "geometric converges inside radius (#" + t + ")");
    ok(!(Math.abs(sout1 - sout2) < 1e-3 * (1 + Math.abs(sout2))) || !isFinite(sout2), "geometric diverges outside radius (#" + t + ")");
    if (res.radius.equals(Rational.ONE.div(absR))) okc++;
  }
  // rationalInN: radius 1; 1/n^p style.
  let rnOK = 0;
  for (let t = 0; t < 40; t++) {
    const p = ri(1, 3);
    const denCs = [];
    for (let k = 0; k < p; k++) denCs.push(Rational.ZERO);
    denCs.push(Rational.ONE); // den = n^p
    const res = powerSeriesConvergence({ kind: "rationalInN", num: [R(1)], den: denCs }, "x", 0);
    if (res.refused) { ok(false, "convergence refused rationalInN (#" + t + ")"); continue; }
    ok(res.radius.equals(R(1)), "rationalInN radius == 1 (#" + t + ")");
    // partial sums of x^n / n^p: converge for |x|<1, diverge for |x|>1
    function sumR(xv, N) { let s = 0; for (let n = 1; n <= N; n++) s += Math.pow(xv, n) / Math.pow(n, p); return s; }
    const a1 = sumR(0.5, 300), a2 = sumR(0.5, 600);
    const b1 = sumR(1.5, 300), b2 = sumR(1.5, 600);
    ok(Math.abs(a1 - a2) < 1e-2 * (1 + Math.abs(a2)), "rationalInN converges inside (#" + t + ")");
    ok(isFinite(b2) && (Math.abs(b1 - b2) > 1e-2 || Math.abs(b2) > 1e3), "rationalInN diverges outside (#" + t + ")");
    if (res.radius.equals(R(1))) rnOK++;
  }
  ok(okc > 35, "convergence geometric property succeeded in " + okc + " cases");
  ok(rnOK > 30, "convergence rationalInN property succeeded in " + rnOK + " cases");
}

// numeric two-sided limit truth at a finite point (independent of the kernel).
function numericTwoSided(f, a) {
  const hs = [1e-3, 1e-4, 1e-5, 1e-6];
  const rs = hs.map((h) => { try { return numEval(f, { x: a + h }); } catch { return NaN; } });
  const ls = hs.map((h) => { try { return numEval(f, { x: a - h }); } catch { return NaN; } });
  const rL = rs[rs.length - 1], lL = ls[ls.length - 1];
  const unbound = (v, v0) => Math.abs(v) > 1e7 || (isFinite(v) && Math.abs(v) > 1e3 && Math.abs(v) > 100 * Math.abs(v0));
  const uR = unbound(rL, rs[0]), uL = unbound(lL, ls[0]);
  if (uR || uL) {
    if (uR && uL && isFinite(rL) && isFinite(lL) && Math.sign(rL) === Math.sign(lL)) return { kind: "infinite", sign: Math.sign(rL) };
    return { kind: "dne" };
  }
  if (!isFinite(rL) || !isFinite(lL)) return { kind: "dne" };
  if (Math.abs(rL - lL) < 1e-4 * (1 + Math.abs(rL))) return { kind: "finite", value: (rL + lL) / 2 };
  return { kind: "dne" };
}
// numeric limit at +Infinity (independent of the kernel).
function numericInf(f) {
  const xs = [1e3, 1e4, 1e5, 1e6];
  const vs = xs.map((xv) => { try { return numEval(f, { x: xv }); } catch { return NaN; } });
  const vL = vs[vs.length - 1], vP = vs[vs.length - 2];
  if (!isFinite(vL)) return { kind: "dne" };
  if (Math.abs(vL - vP) < 1e-4 * (1 + Math.abs(vL))) return { kind: "finite", value: vL };
  if (Math.abs(vL) > 1e6 && Math.abs(vL) > Math.abs(vs[0])) return { kind: "infinite", sign: Math.sign(vL) };
  return { kind: "dne" };
}

// ============================================================ limit
console.log("\nlimit — finite-claim correctness + honest refusals (160 trials)");
{
  // A. polynomial @ finite: direct substitution always closes; the limit must be finite == P(a).
  //    The kernel is exact-arithmetic, so the point must be a Rational (not a float).
  let polyOK = 0;
  for (let t = 0; t < 60; t++) {
    const { expr } = randPolyExpr(4, 6, x());
    const a = Rational.of(BigInt(ri(-6, 6)), BigInt(ri(1, 4)));
    const aNum = Number(a.num) / Number(a.den);
    const r = limit(expr, "x", a);
    if (r.refused) { ok(false, "polynomial limit refused (#" + t + "): " + r.reason); continue; }
    const exp = numEval(expr, { x: aNum });
    ok(r.kind === "finite" && Math.abs(numEval(r.result, {}) - exp) < 1e-9, "polynomial limit == P(a) (#" + t + ")");
    if (r.kind === "finite" && Math.abs(numEval(r.result, {}) - exp) < 1e-9) polyOK++;
  }
  ok(polyOK > 50, "polynomial limits all closed & correct (" + polyOK + "/60)");

  // B. rational @ +Infinity (deg 1-2): a finite kernel claim must match the numeric limit;
  //    refusals / dne / infinite are honest scope outcomes for the series+L'Hopital route.
  let infAccept = 0, infRefuse = 0;
  for (let t = 0; t < 50; t++) {
    const d = ri(1, 2);
    const nc = [], qc = [];
    for (let k = 0; k <= d; k++) { nc.push(rr(4)); qc.push(rr(4)); }
    if (qc[d].isZero) qc[d] = Rational.ONE;
    const f = Expr.div(polyExpr(nc, x()), polyExpr(qc, x()));
    const truth = numericInf(f);
    const r = limit(f, "x", Infinity);
    if (r.refused) { infRefuse++; ok(true, "rational@inf honest refusal (#" + t + ")"); continue; }
    if (r.kind === "finite") {
      const got = numEval(r.result, {});
      ok(truth.kind === "finite" && Math.abs(got - truth.value) < 1e-3 * (1 + Math.abs(truth.value)),
        "rational@inf finite claim numerically correct (#" + t + ")");
      if (truth.kind === "finite" && Math.abs(got - truth.value) < 1e-3 * (1 + Math.abs(truth.value))) infAccept++;
    } else {
      ok(r.kind === truth.kind, "rational@inf non-finite kind matches numeric (#" + t + ")");
      if (r.kind === truth.kind) infAccept++;
    }
  }
  ok(infAccept + infRefuse === 50, "rational@inf every trial accounted for (" + infAccept + " accept, " + infRefuse + " refuse)");
  ok(infAccept > 20, "rational@inf accepted a meaningful number of cases (" + infAccept + ")");

  // C. 0/0 removable @ finite ((x-a)P)/((x-a)Q): a finite claim must match the numeric two-sided
  //    limit; when Q(a)=0 the truth is a pole (dne/infinite), which the kernel may return or refuse.
  let remAccept = 0, remRefuse = 0;
  for (let t = 0; t < 50; t++) {
    const a = ri(-3, 3);
    const lin = Expr.sub(x(), I(a));
    const P = polyExpr([rr(3), rr(3)], x());
    const Q = polyExpr([rr(3), rr(3)], x());
    const f = Expr.div(Expr.mul(lin, P), Expr.mul(lin, Q));
    const truth = numericTwoSided(f, a);
    const r = limit(f, "x", a);
    if (r.refused) { remRefuse++; ok(true, "0/0 honest refusal (#" + t + ")"); continue; }
    if (r.kind === "finite") {
      const got = numEval(r.result, {});
      ok(truth.kind === "finite" && Math.abs(got - truth.value) < 1e-3 * (1 + Math.abs(truth.value)),
        "0/0 finite claim numerically correct (#" + t + ")");
      if (truth.kind === "finite" && Math.abs(got - truth.value) < 1e-3 * (1 + Math.abs(truth.value))) remAccept++;
    } else {
      ok(r.kind === truth.kind, "0/0 non-finite kind matches numeric (#" + t + "): kernel " + r.kind + " truth " + truth.kind);
      if (r.kind === truth.kind) remAccept++;
    }
  }
  ok(remAccept + remRefuse === 50, "0/0 every trial accounted for (" + remAccept + " accept, " + remRefuse + " refuse)");
  ok(remAccept > 30, "0/0 accepted a meaningful number of cases (" + remAccept + ")");
}

// ============================================================ honest refusals
console.log("\nhonest refusals — Puiseux / essential / oscillatory (counted)");
{
  let puiseux = 0, essential = 0, oscillatory = 0;
  for (let t = 0; t < 10; t++) {
    // branch-point fractional power at the center -> taylor refuses (Puiseux / ℚ(α) deferred)
    const tp = taylor(Expr.pow(x(), Q(1, 2)), "x", 0, 3);
    if (tp.refused) puiseux++;
    else ok(false, "taylor x^(1/2)@0 NOT refused (#" + t + ") — produced a series at a branch point");
    // essential singularity -> limit refuses
    const le = limit(Expr.func("exp", [Expr.div(I(1), x())]), "x", 0);
    if (le.refused && /essential|transcend/i.test(le.reason)) essential++;
    else ok(false, "limit exp(1/x)@0 NOT refused as essential (#" + t + ")");
    // oscillatory -> limit refuses
    const lo = limit(Expr.func("sin", [Expr.div(I(1), x())]), "x", 0);
    if (lo.refused && /oscill/i.test(lo.reason)) oscillatory++;
    else ok(false, "limit sin(1/x)@0 NOT refused as oscillatory (#" + t + ")");
  }
  ok(puiseux === 10, "Puiseux branch-point refused in all " + puiseux + "/10 probes");
  ok(essential === 10, "essential singularity refused in all " + essential + "/10 probes");
  ok(oscillatory === 10, "oscillatory limit refused in all " + oscillatory + "/10 probes");
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);