/* Complex Analysis Engine — pure, DOM-free symbolic methods.

   Companion to complex.js (numeric {re,im} arithmetic) the same way calculus-symbolic.js is a
   companion to algorithms.js: everything here returns an EXACT closed form plus the derivation
   that produced it, not a numeric approximation. This module is what makes Analyticity /
   Cauchy-Riemann and Harmonic Functions & Conjugates "symbolic, verified numerically" rather
   than "numeric" — the displayed math (u(x,y), v(x,y), the partials, the conjugate) is always
   an exact nerdamer expression; central-difference sampling only ever checks that exact answer,
   never replaces it. Same discipline as calculus-symbolic.js's "differentiate back and compare."

   ---- Why this exists instead of nerdamer's realpart()/imagpart() ----

   nerdamer ships realpart()/imagpart(), and the obvious plan was to substitute z = x+i*y,
   expand(), and call them. Measured directly against the vendored bundle (2026-07-24):
   realpart/imagpart are CORRECT on a sum where every real (non-i) term has at most one
   non-numeric factor (x, x^2, cos(y), ...), but WRONG — silently, not by refusing — the moment
   a real term is a PRODUCT of two or more distinct symbolic factors:

     imagpart(a*b + i*c)              -> "a*b+c"      (should be "c")
     imagpart(e^x*cos(y) + i*e^x*sin(y)) -> "cos(y)*e^x+e^x*sin(y)"   (should be "e^x*sin(y)")

   i.e. it is wrong on e^z, sin(z), cos(z) — exactly the functions this engine needs to show as
   analytic. z^2 alone looked fine only because its real terms (x^2, -y^2) each happen to be a
   single factor; z^3's real part (x^3 - 3xy^2) already has a real term that is a product of two
   factors and would hit the same bug. See COMPLEX_ANALYSIS_ENGINE_PLAN.md §4 for the full probe.

   ---- What this module does instead ----

   decompose(f) walks math.js's parse tree for f(z) bottom-up and carries u(x,y) and v(x,y) as
   two SEPARATE nerdamer expression strings at every node, combining them with the ordinary
   complex-arithmetic identities:

     (u1+iv1) + (u2+iv2)  -> (u1+u2, v1+v2)
     (u1+iv1) * (u2+iv2)  -> (u1*u2 - v1*v2, u1*v2 + v1*u2)
     (u1+iv1) / (u2+iv2)  -> ((u1*u2+v1*v2)/d, (v1*u2-u1*v2)/d),  d = u2^2+v2^2
     entire functions (exp, sin, cos, sinh, cosh) via their textbook Euler-type identities,
     e.g. exp(u+iv) = e^u*(cos v + i sin v)

   Never asks nerdamer to separate a mixed real+imaginary expression — u and v are tracked
   separately by construction, so the realpart/imagpart bug above is structurally impossible to
   hit. Refuses by name (ok:false) on anything requiring a branch (sqrt, log, fractional/complex
   powers, inverse trig) — those are correctness hazards belonging to the Phase 2 branch-cuts
   topic, not this one; guessing a branch here would be worse than refusing. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ComplexSymbolic = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ComplexSymbolic = {};

  const CalcCore =
    (typeof module === "object" && module.exports)
      ? require("./calc-core.js")
      : (typeof self !== "undefined" ? self.CalcCore : root.CalcCore);

  if (!CalcCore) {
    throw new Error("ComplexSymbolic requires calc-core.js to be loaded first.");
  }

  const cas = CalcCore.cas;
  const tryStr = CalcCore.tryStr;
  const toTeX = CalcCore.toTeX;
  const compileFn = CalcCore.compileFn;

  let mathjs = (typeof self !== "undefined" && self.math) ? self.math : null;

  ComplexSymbolic.configure = function (deps) {
    CalcCore.configure(deps);
    if (deps && deps.math) mathjs = deps.math;
    if (!mathjs && typeof self !== "undefined" && self.math) mathjs = self.math;
  };

  // ---------------- small nerdamer plumbing (mirrors calculus-symbolic.js's eval2At/tryStr) ----

  function N(exprStr) { return tryStr(() => cas()(exprStr).toString()); }

  function subAt(exprStr, subs) {
    return tryStr(() => {
      let e = cas()(exprStr);
      for (const k in subs) e = e.sub(k, String(subs[k]));
      return e.toString();
    });
  }

  function evalNumAt(exprStr, subs) {
    const subbed = subAt(exprStr, subs);
    if (subbed === null) return NaN;
    try {
      const n = parseFloat(cas()(subbed).evaluate().text("decimals"));
      return Number.isFinite(n) ? n : NaN;
    } catch (e) {
      return NaN;
    }
  }

  // ---------------- complex arithmetic on [uStr, vStr] pairs ----------------

  function cAdd(a, b) { return [N(`(${a[0]})+(${b[0]})`), N(`(${a[1]})+(${b[1]})`)]; }
  function cSub(a, b) { return [N(`(${a[0]})-(${b[0]})`), N(`(${a[1]})-(${b[1]})`)]; }
  function cNeg(a) { return [N(`-(${a[0]})`), N(`-(${a[1]})`)]; }
  function cMul(a, b) {
    return [N(`(${a[0]})*(${b[0]})-(${a[1]})*(${b[1]})`), N(`(${a[0]})*(${b[1]})+(${a[1]})*(${b[0]})`)];
  }
  function cDiv(a, b) {
    const d = N(`(${b[0]})^2+(${b[1]})^2`);
    return [
      N(`((${a[0]})*(${b[0]})+(${a[1]})*(${b[1]}))/(${d})`),
      N(`((${a[1]})*(${b[0]})-(${a[0]})*(${b[1]}))/(${d})`),
    ];
  }
  // Integer power via square-and-multiply — De Moivre's structure, but exact and symbolic.
  function cPowInt(a, n) {
    if (n === 0) return ["1", "0"];
    let result = ["1", "0"];
    let base = a;
    let k = Math.abs(n);
    while (k > 0) {
      if (k & 1) result = cMul(result, base);
      base = cMul(base, base);
      k >>= 1;
    }
    return n < 0 ? cDiv(["1", "0"], result) : result;
  }

  // ---------------- entire functions, applied to a sub-result [u,v] ----------------
  // Every one of these is single-valued (no branch) — textbook Euler-type identities.

  const ENTIRE_FN = {
    exp: (a) => [N(`e^(${a[0]})*cos(${a[1]})`), N(`e^(${a[0]})*sin(${a[1]})`)],
    sin: (a) => [N(`sin(${a[0]})*cosh(${a[1]})`), N(`cos(${a[0]})*sinh(${a[1]})`)],
    cos: (a) => [N(`cos(${a[0]})*cosh(${a[1]})`), N(`-sin(${a[0]})*sinh(${a[1]})`)],
    sinh: (a) => [N(`sinh(${a[0]})*cos(${a[1]})`), N(`cosh(${a[0]})*sin(${a[1]})`)],
    cosh: (a) => [N(`cosh(${a[0]})*cos(${a[1]})`), N(`sinh(${a[0]})*sin(${a[1]})`)],
    // structural (non-holomorphic) unary ops — the flagship "CR fails" examples
    conj: (a) => [a[0], N(`-(${a[1]})`)],
    re: (a) => [a[0], "0"],
    im: (a) => [a[1], "0"],
    abs: (a) => [N(`sqrt((${a[0]})^2+(${a[1]})^2)`), "0"],
  };
  // Derived from the above by ordinary complex division — still entire-function-only, still
  // single-valued, just meromorphic (poles where the reciprocal's denominator vanishes, which
  // is mathematically correct and exactly what domain colouring already shows as a pole).
  const DERIVED_FN = {
    tan: (a) => cDiv(ENTIRE_FN.sin(a), ENTIRE_FN.cos(a)),
    cot: (a) => cDiv(ENTIRE_FN.cos(a), ENTIRE_FN.sin(a)),
    sec: (a) => cDiv(["1", "0"], ENTIRE_FN.cos(a)),
    csc: (a) => cDiv(["1", "0"], ENTIRE_FN.sin(a)),
    tanh: (a) => cDiv(ENTIRE_FN.sinh(a), ENTIRE_FN.cosh(a)),
    coth: (a) => cDiv(ENTIRE_FN.cosh(a), ENTIRE_FN.sinh(a)),
    sech: (a) => cDiv(["1", "0"], ENTIRE_FN.cosh(a)),
    csch: (a) => cDiv(["1", "0"], ENTIRE_FN.sinh(a)),
  };
  // Explicitly refused by name — every one of these is multivalued and needs a branch cut,
  // which is the Phase 2 topic, not this one. Naming them beats a generic "unsupported".
  const BRANCH_FN = new Set(["sqrt", "log", "ln", "asin", "acos", "atan", "asinh", "acosh", "atanh"]);

  const MAX_INT_POWER = 12;

  // Evaluates a constant-only subtree (numbers, unary minus, +-*/ of constants) to a JS number,
  // or returns null if it isn't purely constant. Used only to decide whether z^(...) has an
  // integer exponent — never used for anything that ends up in a returned formula.
  function evalConstNode(node) {
    if (node.type === "ConstantNode") return typeof node.value === "number" ? node.value : Number(node.value);
    if (node.type === "ParenthesisNode") return evalConstNode(node.content);
    if (node.type === "SymbolNode") {
      if (node.name === "pi") return Math.PI;
      if (node.name === "e") return Math.E;
      return null;
    }
    if (node.type === "OperatorNode") {
      if (node.args.length === 1 && node.op === "-") {
        const v = evalConstNode(node.args[0]);
        return v === null ? null : -v;
      }
      if (node.args.length === 2) {
        const a = evalConstNode(node.args[0]);
        const b = evalConstNode(node.args[1]);
        if (a === null || b === null) return null;
        if (node.op === "+") return a + b;
        if (node.op === "-") return a - b;
        if (node.op === "*") return a * b;
        if (node.op === "/") return a / b;
        if (node.op === "^") return Math.pow(a, b);
      }
    }
    return null;
  }

  /* Recursively decomposes a math.js AST node into [uStr, vStr], real-valued nerdamer
     expressions in x and y with f(x+iy) = u(x,y) + i*v(x,y). Throws a plain Error with a
     specific, name-the-cause message on anything unsupported — caught once at the top by
     decompose(). */
  function decomposeNode(node) {
    switch (node.type) {
      case "ParenthesisNode":
        return decomposeNode(node.content);

      case "ConstantNode": {
        const v = typeof node.value === "number" ? node.value : Number(node.value);
        if (!Number.isFinite(v)) throw new Error("Unsupported constant: " + node.value);
        return [String(v), "0"];
      }

      case "SymbolNode": {
        if (node.name === "z") return ["x", "y"];
        if (node.name === "pi" || node.name === "e") return [node.name, "0"];
        throw new Error(`Only the variable z is supported — unknown symbol "${node.name}".`);
      }

      case "OperatorNode": {
        if (node.args.length === 1 && node.op === "-") {
          return cNeg(decomposeNode(node.args[0]));
        }
        if (node.args.length === 1 && node.op === "+") {
          return decomposeNode(node.args[0]);
        }
        if (node.args.length === 2) {
          if (node.op === "+") return cAdd(decomposeNode(node.args[0]), decomposeNode(node.args[1]));
          if (node.op === "-") return cSub(decomposeNode(node.args[0]), decomposeNode(node.args[1]));
          if (node.op === "*") return cMul(decomposeNode(node.args[0]), decomposeNode(node.args[1]));
          if (node.op === "/") return cDiv(decomposeNode(node.args[0]), decomposeNode(node.args[1]));
          if (node.op === "^") {
            const n = evalConstNode(node.args[1]);
            if (n === null || !Number.isInteger(n)) {
              throw new Error("Only integer powers of z are supported here — fractional or complex powers are multivalued (see the upcoming branch-cuts topic).");
            }
            if (Math.abs(n) > MAX_INT_POWER) {
              throw new Error(`Exponent ${n} is too large for the symbolic engine (limit ±${MAX_INT_POWER}).`);
            }
            return cPowInt(decomposeNode(node.args[0]), n);
          }
        }
        throw new Error(`Unsupported operator "${node.op}".`);
      }

      case "FunctionNode": {
        const name = node.fn && node.fn.name ? node.fn.name : node.name;
        if (BRANCH_FN.has(name)) {
          throw new Error(`${name}(z) is multivalued and needs a branch cut — not supported here yet (see the upcoming branch-cuts topic).`);
        }
        const impl = ENTIRE_FN[name] || DERIVED_FN[name];
        if (!impl) throw new Error(`Unsupported function "${name}(...)".`);
        if (node.args.length !== 1) throw new Error(`"${name}" must take exactly one argument.`);
        return impl(decomposeNode(node.args[0]));
      }

      default:
        throw new Error(`Unsupported expression form (${node.type}).`);
    }
  }

  /* decompose(fExprString) -> {ok:true, u, v} | {ok:false, reason}
     u, v are nerdamer expression strings in x, y with f(x+iy) = u(x,y) + i*v(x,y), exact. */
  ComplexSymbolic.decompose = function (fExprString) {
    if (typeof fExprString !== "string" || fExprString.trim() === "") {
      return { ok: false, reason: "Enter an expression f(z)." };
    }
    if (!mathjs) throw new Error("ComplexSymbolic needs math.js — call configure({math}) first.");
    let ast;
    try {
      ast = mathjs.parse(fExprString.trim());
    } catch (e) {
      return { ok: false, reason: "Couldn't parse f(z): " + e.message };
    }
    try {
      const [u, v] = decomposeNode(ast);
      if (u === null || v === null) return { ok: false, reason: "Couldn't combine the real/imaginary parts symbolically." };
      return { ok: true, u, v };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  };

  // ---------------- verification: central-difference cross-check ----------------
  // Same discipline as partialDerivatives (§ CALCULUS_ENGINE_PLAN.md): the exact symbolic
  // partial, evaluated at the point, must match an independent finite-difference estimate
  // computed straight from u/v (never from the symbolic derivative) — catches a diff() mistake
  // rather than trusting it blindly.
  const FD_H = 1e-5;
  const FD_TOL = 1e-4; // relative — finite differences carry O(h) truncation error

  function fdPartials(uStr, x0, y0) {
    const f = compileFn(uStr);
    if (!f) return null;
    try {
      const ux = (f.evaluate({ x: x0 + FD_H, y: y0 }) - f.evaluate({ x: x0 - FD_H, y: y0 })) / (2 * FD_H);
      const uy = (f.evaluate({ x: x0, y: y0 + FD_H }) - f.evaluate({ x: x0, y: y0 - FD_H })) / (2 * FD_H);
      return { ux, uy };
    } catch (e) {
      return null;
    }
  }
  function closeEnough(a, b, tol) {
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  }

  const CR_EXACT_TOL = 1e-6; // symbolic values evaluated numerically — should agree to fp precision if truly analytic

  /* cauchyRiemannAt(fExprString, x, y) -> the full analyticity check at one point, PLUS a
     domain-wide numeric sampling of the exact symbolic residual (not central differences —
     the closed forms make that unnecessary) to tell "analytic in a neighbourhood" apart from
     "the equations happen to hold only at this isolated point" (the |z|^2 textbook case). */
  ComplexSymbolic.cauchyRiemann = function (fExprString, point) {
    const dec = ComplexSymbolic.decompose(fExprString);
    if (!dec.ok) return dec;
    const { u, v } = dec;

    const ux = N(`diff(${u},x)`), uy = N(`diff(${u},y)`);
    const vx = N(`diff(${v},x)`), vy = N(`diff(${v},y)`);
    if (ux === null || uy === null || vx === null || vy === null) {
      return { ok: false, reason: "Couldn't differentiate u or v symbolically." };
    }

    if (!Array.isArray(point) || point.length !== 2) return { ok: false, reason: "The point must be a pair [x, y]." };
    const x0 = Number(point[0]), y0 = Number(point[1]);
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) return { ok: false, reason: "The point coordinates must be numbers." };

    const subs = { x: x0, y: y0 };
    const uAt = evalNumAt(u, subs), vAt = evalNumAt(v, subs);
    const uxAt = evalNumAt(ux, subs), uyAt = evalNumAt(uy, subs);
    const vxAt = evalNumAt(vx, subs), vyAt = evalNumAt(vy, subs);
    if (![uAt, vAt, uxAt, uyAt, vxAt, vyAt].every(Number.isFinite)) {
      return { ok: false, reason: `f is not defined (or its partials aren't) at (${x0}, ${y0}).` };
    }

    const resReal = uxAt - vyAt, resImag = uyAt + vxAt;
    const satisfiesAtPoint = Math.abs(resReal) <= CR_EXACT_TOL * Math.max(1, Math.abs(uxAt), Math.abs(vyAt)) &&
      Math.abs(resImag) <= CR_EXACT_TOL * Math.max(1, Math.abs(uyAt), Math.abs(vxAt));

    // Cross-check: independent finite differences of u and v against the symbolic partials.
    const fdU = fdPartials(u, x0, y0), fdV = fdPartials(v, x0, y0);
    const verified = !!fdU && !!fdV &&
      closeEnough(fdU.ux, uxAt, FD_TOL) && closeEnough(fdU.uy, uyAt, FD_TOL) &&
      closeEnough(fdV.ux, vxAt, FD_TOL) && closeEnough(fdV.uy, vyAt, FD_TOL);

    // Neighbourhood sampling: evaluate the EXACT residual expressions (not f) at a ring of
    // nearby points plus a handful of points spread further out, using compiled u_x/u_y/v_x/v_y
    // (fast, no CAS calls, can't hang). Distinguishes "holds identically nearby" from "holds
    // only at this isolated point" from "fails right here too".
    const resRealFn = compileFn(`(${ux})-(${vy})`);
    const resImagFn = compileFn(`(${uy})+(${vx})`);
    let neighborhoodOk = null;
    if (resRealFn && resImagFn) {
      const offsets = [0.01, -0.01, 0.05, -0.05];
      let allOk = true, anyUsable = false;
      for (const d of offsets) {
        for (const [dx, dy] of [[d, 0], [0, d]]) {
          try {
            const rr = resRealFn.evaluate({ x: x0 + dx, y: y0 + dy });
            const ri = resImagFn.evaluate({ x: x0 + dx, y: y0 + dy });
            if (!Number.isFinite(rr) || !Number.isFinite(ri)) continue;
            anyUsable = true;
            const scale = Math.max(1, Math.abs(rr), Math.abs(ri));
            if (Math.abs(rr) > 1e-4 * scale || Math.abs(ri) > 1e-4 * scale) allOk = false;
          } catch (e) { /* skip an undefined sample */ }
        }
      }
      neighborhoodOk = anyUsable ? allOk : null;
    }

    let verdict;
    if (!satisfiesAtPoint) verdict = "not-analytic-at-point";
    else if (neighborhoodOk === false) verdict = "cr-holds-only-here";
    else verdict = "analytic";

    return {
      ok: true,
      u, v, ux, uy, vx, vy,
      point: [x0, y0],
      values: { u: uAt, v: vAt, ux: uxAt, uy: uyAt, vx: vxAt, vy: vyAt },
      residual: { real: resReal, imag: resImag },
      satisfiesAtPoint,
      neighborhoodOk,
      verdict,
      verified,
      latex: {
        u: toTeX(u), v: toTeX(v),
        ux: toTeX(ux), uy: toTeX(uy), vx: toTeX(vx), vy: toTeX(vy),
      },
      steps: [
        { rule: "Split f(z) into real and imaginary parts", latex: `f(x+iy) = u(x,y) + i\\,v(x,y),\\quad u = ${toTeX(u)},\\quad v = ${toTeX(v)}` },
        { rule: "Partial derivatives", latex: `u_x = ${toTeX(ux)},\\ \\ u_y = ${toTeX(uy)},\\ \\ v_x = ${toTeX(vx)},\\ \\ v_y = ${toTeX(vy)}` },
        { rule: "Check u_x = v_y", latex: `u_x - v_y = ${resReal.toFixed(6)}\\ \\text{at } (${x0}, ${y0})` },
        { rule: "Check u_y = -v_x", latex: `u_y + v_x = ${resImag.toFixed(6)}\\ \\text{at } (${x0}, ${y0})` },
      ],
    };
  };

  // ---------------- Harmonic Functions & Conjugates ----------------

  /* harmonicConjugate(uExprString, basepoint) -> the conjugate v with v(x0,y0) = 0 (or the
     supplied v0), via the textbook method:
       g(x,y) = int u_x dy               (differs from v by a function of x alone)
       phi'(x) = d/dx[g] + u_y            (must reduce to a function of x only if u is harmonic)
       phi(x)  = int phi'(x) dx
       v = g - phi(x), shifted so v(x0,y0) = v0
     Every step is exact nerdamer algebra (diff/integrate, both proven reliable on real
     multivariable expressions elsewhere in the site — this never touches i). Refuses honestly,
     by name, at the step that fails: not harmonic, no closed-form antiderivative, or phi'(x)
     doesn't reduce to a function of x alone (the same symptom either an integration nerdamer
     couldn't fully collapse, or genuinely non-harmonic u would produce — see
     COMPLEX_ANALYSIS_ENGINE_PLAN.md §4 for the ln(x^2+y^2) case this legitimately refuses). */
  const LAPLACE_TOL = 1e-6;

  ComplexSymbolic.harmonicConjugate = function (uExprString, basepoint) {
    if (typeof uExprString !== "string" || uExprString.trim() === "") {
      return { ok: false, reason: "Enter u(x, y)." };
    }
    const u = N(uExprString.trim());
    if (u === null) return { ok: false, reason: "Couldn't parse u(x, y)." };

    if (!Array.isArray(basepoint) || basepoint.length < 2) return { ok: false, reason: "The base point must be a pair [x0, y0]." };
    const x0 = Number(basepoint[0]), y0 = Number(basepoint[1]);
    const v0 = Number.isFinite(Number(basepoint[2])) ? Number(basepoint[2]) : 0;
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) return { ok: false, reason: "The base point coordinates must be numbers." };

    const ux = N(`diff(${u},x)`), uy = N(`diff(${u},y)`);
    if (ux === null || uy === null) return { ok: false, reason: "Couldn't differentiate u symbolically." };
    const uxx = N(`diff(${ux},x)`), uyy = N(`diff(${uy},y)`);
    if (uxx === null || uyy === null) return { ok: false, reason: "Couldn't compute u's second partials." };
    const laplacianStr = N(`(${uxx})+(${uyy})`);

    // Harmonic gate: sample the closed-form Laplacian at the base point and a spread of nearby
    // points. Not harmonic anywhere sampled -> refuse by name, with the value shown.
    const lapFn = compileFn(laplacianStr);
    if (!lapFn) return { ok: false, reason: "Couldn't evaluate u's Laplacian." };
    const samplePts = [[x0, y0], [x0 + 0.3, y0], [x0, y0 + 0.3], [x0 - 0.4, y0 + 0.2]];
    let lapAtBase = null;
    for (const [sx, sy] of samplePts) {
      let lv;
      try { lv = lapFn.evaluate({ x: sx, y: sy }); } catch (e) { continue; }
      if (!Number.isFinite(lv)) continue;
      if (sx === x0 && sy === y0) lapAtBase = lv;
      if (Math.abs(lv) > 1e-4 * Math.max(1, Math.abs(lv))) {
        return {
          ok: false,
          reason: `u is not harmonic: ∇²u = u_xx + u_yy = ${lv.toFixed(6)} ≠ 0 at (${sx}, ${sy}). A harmonic conjugate only exists where ∇²u = 0.`,
          laplacian: laplacianStr,
        };
      }
    }

    const g = N(`integrate(${ux},y)`);
    if (g === null || /integrate\(/.test(g)) {
      return { ok: false, reason: "Couldn't find a closed-form antiderivative of u_x with respect to y." };
    }
    const gx = N(`diff(${g},x)`);
    if (gx === null) return { ok: false, reason: "Couldn't differentiate the intermediate g(x, y)." };
    const phiPrime = N(`(${gx})+(${uy})`);
    if (phiPrime === null) return { ok: false, reason: "Couldn't assemble φ'(x)." };
    if (/\by\b/.test(phiPrime)) {
      return { ok: false, reason: "The recovered φ'(x) still depends on y — either u is not harmonic, or nerdamer couldn't fully reduce the algebra here. Try a simpler u." };
    }
    const phi = N(`integrate(${phiPrime},x)`);
    if (phi === null || /integrate\(/.test(phi)) {
      return { ok: false, reason: "Couldn't find a closed-form antiderivative of φ'(x)." };
    }

    const vRaw = N(`(${g})-(${phi})`);
    if (vRaw === null) return { ok: false, reason: "Couldn't assemble v(x, y)." };
    const atBase = subAt(vRaw, { x: x0, y: y0 });
    if (atBase === null) return { ok: false, reason: `v is not defined at the base point (${x0}, ${y0}).` };
    const shiftStr = v0 === 0 ? atBase : `(${atBase})-(${v0})`;
    const v = N(`(${vRaw})-(${shiftStr})`);
    if (v === null) return { ok: false, reason: "Couldn't shift v to the base point." };

    // Verify: v_x = -u_y and v_y = u_x, both symbolically (exact) and by an independent
    // finite-difference cross-check on v itself (never re-deriving from the symbolic result).
    const vx = N(`diff(${v},x)`), vy = N(`diff(${v},y)`);
    if (vx === null || vy === null) return { ok: false, reason: "Couldn't differentiate the recovered v." };

    const checkPts = [[x0, y0], [x0 + 0.3, y0 - 0.2]];
    let symbolicOk = true;
    for (const [sx, sy] of checkPts) {
      const uyAt = evalNumAt(uy, { x: sx, y: sy });
      const uxAt = evalNumAt(ux, { x: sx, y: sy });
      const vxAt = evalNumAt(vx, { x: sx, y: sy });
      const vyAt = evalNumAt(vy, { x: sx, y: sy });
      if (![uyAt, uxAt, vxAt, vyAt].every(Number.isFinite)) continue;
      if (!closeEnough(vxAt, -uyAt, 1e-4) || !closeEnough(vyAt, uxAt, 1e-4)) symbolicOk = false;
    }
    const fdV = fdPartials(v, x0, y0);
    const uyAt0 = evalNumAt(uy, { x: x0, y: y0 }), uxAt0 = evalNumAt(ux, { x: x0, y: y0 });
    const fdOk = !!fdV && closeEnough(fdV.ux, -uyAt0, FD_TOL) && closeEnough(fdV.uy, uxAt0, FD_TOL);
    const verified = symbolicOk && fdOk;

    return {
      ok: true,
      u, v, ux, uy, vx, vy,
      laplacian: laplacianStr,
      basepoint: [x0, y0, v0],
      verified,
      latex: {
        u: toTeX(u), v: toTeX(v),
        ux: toTeX(ux), uy: toTeX(uy), vx: toTeX(vx), vy: toTeX(vy),
        laplacian: toTeX(laplacianStr),
      },
      steps: [
        { rule: "Confirm u is harmonic", latex: `\\nabla^2 u = u_{xx} + u_{yy} = ${toTeX(laplacianStr)} = 0` },
        { rule: "Integrate u_x with respect to y", latex: `g(x,y) = \\int u_x\\,dy = ${toTeX(g)}` },
        { rule: "Use v_x = -u_y to isolate φ'(x)", latex: `\\varphi'(x) = \\partial_x g + u_y = ${toTeX(phiPrime)}` },
        { rule: "Integrate φ'(x)", latex: `\\varphi(x) = ${toTeX(phi)}` },
        { rule: `Assemble v = g - φ(x), shifted so v(${x0},${y0}) = ${v0}`, latex: `v(x,y) = ${toTeX(v)}` },
      ],
    };
  };

  return ComplexSymbolic;
});
