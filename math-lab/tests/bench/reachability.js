"use strict";
/* FIX LAYER v3 — general assumption-driven radical reduction.
   v2 used literal regexes and reached 82.5%. The remaining failures were prototype
   fragility, not fundamentals: nerdamer solves every one of them once sqrt(E) is reduced.
     integrate(2*u/(1+u),u)  -> 2*(u - log(1+u))     OK
     integrate(2*u*e^u,u)    -> 2*(u*e^u - e^u)      OK
     integrate(sinh(t)^2,t)  -> -t/2 + sinh(2t)/4    OK
   The blocker was only sqrt(u^2)->u and sqrt(cosh(t)^2-1)->sinh(t).

   v3 reduces sqrt(E) GENERALLY: try each candidate reduction and accept it if it agrees
   numerically with sqrt(E) across the substitution interval. That is exactly what an
   assumptions system does — it licenses the non-negative branch on a known domain. */

const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const math = require(path.join(ROOT, "assets", "vendor", "math.min.js"));
const nerdamer = require(path.join(__dirname, "..", "lib", "load-cas.js"))();
const lnToLog = require(path.join(__dirname, "..", "lib", "ln-to-log.js"));

function verify(F, f, pts) {
  let cF, cf;
  // math.js has no "ln" function (only "log" for natural log); the kernel canonicalizes
  // natural log to "ln(...)". Translate before parsing — see tests/lib/ln-to-log.js.
  try { cF = math.parse(lnToLog(F)).compile(); } catch (e) { return "UNVERIFIABLE"; }
  try { cf = math.parse(f).compile(); } catch (e) { return "UNVERIFIABLE"; }
  const h = 1e-5; let usable = 0;
  for (const x of pts) {
    let fp, gx;
    try { fp = (cF.evaluate({ x: x + h }) - cF.evaluate({ x: x - h })) / (2 * h); } catch (e) { continue; }
    try { gx = cf.evaluate({ x }); } catch (e) { continue; }
    if (typeof fp !== "number" || typeof gx !== "number") continue;
    if (!Number.isFinite(fp) || !Number.isFinite(gx)) continue;
    usable++;
    if (Math.abs(fp - gx) > 1e-3 * Math.max(1, Math.abs(gx))) return "WRONG";
  }
  return usable >= 3 ? "CORRECT" : "UNVERIFIABLE";
}
function matchParen(s, o) { let d = 0; for (let i = o; i < s.length; i++) { if (s[i] === "(") d++; else if (s[i] === ")") { d--; if (d === 0) return i; } } return -1; }

/* ---- L1-driven general radical reduction ----
   For every sqrt(E) in `s`, try candidate non-negative reductions on variable `v`.
   Accept the first that agrees numerically with sqrt(E) across the domain sample.
   This is the assumptions system's job: pick the branch that is valid on the known domain. */
function reduceSqrt(s, v, domain, a) {
  const cands = (a === undefined)
    ? [`${v}`]
    : [`${a}*cos(${v})`, `${a}*cosh(${v})`, `${a}*sinh(${v})`, `${a}*sin(${v})`, `${v}`, `${a}`];
  let guard = 0;
  while (guard++ < 30) {
    const idx = s.indexOf("sqrt(");
    if (idx === -1) break;
    const close = matchParen(s, idx + 4);
    if (close === -1) break;
    const inner = s.slice(idx + 5, close);
    let chosen = null;
    for (const c of cands) {
      let ci, cc;
      try { ci = math.parse(`sqrt(${inner})`).compile(); cc = math.parse(c).compile(); } catch (e) { continue; }
      let good = 0, bad = 0;
      for (const t of domain) {
        let A, B;
        try { A = ci.evaluate({ [v]: t }); B = cc.evaluate({ [v]: t }); } catch (e) { continue; }
        if (typeof A !== "number" || typeof B !== "number" || !isFinite(A) || !isFinite(B)) continue;
        if (Math.abs(A - B) < 1e-9 * Math.max(1, Math.abs(A))) good++; else bad++;
      }
      if (good >= 3 && bad === 0) { chosen = c; break; }
    }
    if (!chosen) {           // cannot reduce this one — skip past it
      s = s.slice(0, idx) + "SQRTKEEP(" + inner + ")" + s.slice(close + 1);
      continue;
    }
    s = s.slice(0, idx) + "(" + chosen + ")" + s.slice(close + 1);
  }
  return s.replace(/SQRTKEEP\(/g, "sqrt(");
}

const COMP = {
  "cos|asin": u => `sqrt(1-(${u})^2)`, "sin|acos": u => `sqrt(1-(${u})^2)`,
  "tan|asin": u => `((${u})/sqrt(1-(${u})^2))`, "cot|asin": u => `(sqrt(1-(${u})^2)/(${u}))`,
  "sec|asin": u => `(1/sqrt(1-(${u})^2))`, "csc|asin": u => `(1/(${u}))`,
  "sin|atan": u => `((${u})/sqrt(1+(${u})^2))`, "cos|atan": u => `(1/sqrt(1+(${u})^2))`,
  "sec|atan": u => `sqrt(1+(${u})^2)`, "cot|atan": u => `(1/(${u}))`,
  "cosh|asinh": u => `sqrt(1+(${u})^2)`, "sinh|acosh": u => `sqrt((${u})^2-1)`,
  "sinh|asinh": u => `(${u})`, "cosh|acosh": u => `(${u})`,
  "tanh|asinh": u => `((${u})/sqrt(1+(${u})^2))`, "tanh|acosh": u => `(sqrt((${u})^2-1)/(${u}))`,
  "coth|acosh": u => `((${u})/sqrt((${u})^2-1))`, "coth|asinh": u => `(sqrt(1+(${u})^2)/(${u}))`
};
function rewriteComp(s) {
  let ch = true, g = 0;
  while (ch && g++ < 40) { ch = false;
    for (const k of Object.keys(COMP)) {
      const [o, i] = k.split("|"); const needle = `${o}(${i}(`;
      let idx = s.indexOf(needle);
      while (idx !== -1) {
        const io = idx + o.length + 1 + i.length;
        const ic = matchParen(s, io), oc = matchParen(s, idx + o.length);
        if (ic === -1 || oc === -1) break;
        s = s.slice(0, idx) + COMP[k](s.slice(io + 1, ic)) + s.slice(oc + 1);
        ch = true; idx = s.indexOf(needle);
      }
    }
  }
  // sinh(2t) etc. left by nerdamer: expand double angles so back-substitution works
  let g2 = 0;
  while (g2++ < 10) {
    const m = s.match(/(sinh|cosh|sin|cos)\(2\*([a-z])\)/);
    if (!m) break;
    const [full, fn, v] = m;
    const rep = fn === "sinh" ? `2*sinh(${v})*cosh(${v})`
              : fn === "cosh" ? `(2*cosh(${v})^2-1)`
              : fn === "sin"  ? `2*sin(${v})*cos(${v})`
              :                 `(2*cos(${v})^2-1)`;
    s = s.replace(full, rep);
  }
  return s;
}

const simp = s => { try { return nerdamer(s).simplify().toString(); } catch (e) { return s; } };
const integ = s => { try { const r = nerdamer(`integrate(${s})`).toString(); return /integrate\s*\(/.test(r) ? null : r; } catch (e) { return null; } };

function detectRadical(f) {
  const m = f.match(/sqrt\(([^()]*)\)/g); if (!m) return null;
  for (const frag of m) {
    const inner = frag.slice(5, -1); let mm;
    if ((mm = inner.match(/^(\d+)\s*-\s*x\^2$/)))   return { kind: "a2-x2", a: Math.sqrt(+mm[1]) };
    if ((mm = inner.match(/^-x\^2\s*\+\s*(\d+)$/))) return { kind: "a2-x2", a: Math.sqrt(+mm[1]) };
    if ((mm = inner.match(/^(\d+)\s*\+\s*x\^2$/)))  return { kind: "a2+x2", a: Math.sqrt(+mm[1]) };
    if ((mm = inner.match(/^x\^2\s*\+\s*(\d+)$/)))  return { kind: "a2+x2", a: Math.sqrt(+mm[1]) };
    if ((mm = inner.match(/^x\^2\s*-\s*(\d+)$/)))   return { kind: "x2-a2", a: Math.sqrt(+mm[1]) };
  }
  return null;
}

function trigSub(f) {
  const d = detectRadical(f); if (!d) return null;
  const a = d.a;
  let xOf, dx, back, dom;
  if (d.kind === "a2-x2")      { xOf = `${a}*sin(t)`;  dx = `${a}*cos(t)`;  back = `asin(x/${a})`;  dom = [0.1,0.3,0.5,0.7,0.9,1.1,1.3]; }
  else if (d.kind === "a2+x2") { xOf = `${a}*sinh(t)`; dx = `${a}*cosh(t)`; back = `asinh(x/${a})`; dom = [0.1,0.3,0.6,0.9,1.2,1.5]; }
  else                         { xOf = `${a}*cosh(t)`; dx = `${a}*sinh(t)`; back = `acosh(x/${a})`; dom = [0.2,0.5,0.8,1.1,1.4,1.7]; }
  let s;
  try { s = nerdamer(f).sub("x", xOf).toString(); } catch (e) { return null; }
  s = reduceSqrt(s, "t", dom, a);
  let body;
  try { body = nerdamer(`(${s})*(${dx})`).simplify().toString(); } catch (e) { return null; }
  body = reduceSqrt(body, "t", dom, a);
  const I = integ(`${body},t`); if (!I) return null;
  let res;
  try { res = nerdamer(rewriteComp(I)).sub("t", back).toString(); } catch (e) { return null; }
  return simp(rewriteComp(res));
}

function algebraicSub(f) {
  let m = f.match(/sqrt\(x\s*\+\s*(\d+)\)/), b;
  if (m) b = +m[1]; else if (/sqrt\(x\)/.test(f)) b = 0; else return null;
  const dom = [0.3,0.7,1.1,1.6,2.2,2.9];
  let s;
  try { s = nerdamer(f).sub("x", `u^2-${b}`).toString(); } catch (e) { return null; }
  s = reduceSqrt(s, "u", dom);                       // sqrt(u^2) -> u  under u >= 0
  let body;
  try { body = nerdamer(`(${s})*2*u`).simplify().toString(); } catch (e) { return null; }
  body = reduceSqrt(body, "u", dom).replace(/abs\(u\)/g, "u");
  const I = integ(`${body},u`); if (!I) return null;
  let res;
  try { res = nerdamer(I).sub("u", `sqrt(x+${b})`).toString(); } catch (e) { return null; }
  return simp(res);
}

function standardForm(f) {
  let m;
  if ((m = f.match(/^1\/sqrt\(([a-z])\^2\+(\d+)\)$/))) return `log(${m[1]}+sqrt(${m[1]}^2+${m[2]}))`;
  if ((m = f.match(/^1\/sqrt\(([a-z])\^2-(\d+)\)$/))) return `log(${m[1]}+sqrt(${m[1]}^2-${m[2]}))`;
  return null;
}
function completeSquare(f) {
  const m = f.match(/x\^2\s*\+\s*(\d+)\*x\s*\+\s*(\d+)/); if (!m) return null;
  const b = +m[1], c = +m[2], sh = b / 2, k = c - sh * sh;
  const shifted = f.replace(/x\^2\s*\+\s*\d+\*x\s*\+\s*\d+/, `u^2+${k}`);
  let I = integ(`${shifted},u`);
  if (!I) { const sf = standardForm(shifted); if (sf) I = sf; }
  if (!I) { const t = trigSub(shifted.replace(/\bu\b/g, "x")); if (t) I = t.replace(/\bx\b/g, "u"); }
  if (!I) return null;
  let res;
  try { res = nerdamer(I).sub("u", `x+${sh}`).toString(); } catch (e) { return null; }
  return simp(rewriteComp(res));
}
function directStandard(f) { const s = standardForm(f); return s ? simp(s) : null; }

function solve(f, pts) {
  const cands = [];
  let base = null;
  try { base = nerdamer(`integrate(${f},x)`).toString(); } catch (e) {}
  if (base && !/integrate\s*\(/.test(base)) cands.push(["raw", base], ["A simplify", simp(base)], ["B rewrite-comp", simp(rewriteComp(base))]);
  const F = directStandard(f); if (F) cands.push(["F standard form", F]);
  const C = trigSub(f);        if (C) cands.push(["C trig/hyp sub + general radical reduction", C]);
  const D = algebraicSub(f);   if (D) cands.push(["D algebraic sub + general radical reduction", D]);
  const E = completeSquare(f); if (E) cands.push(["E complete square", E]);
  for (const [t, c] of cands) if (c && verify(c, f, pts) === "CORRECT") return { ok: true, t, c };
  return { ok: false, tried: cands.length };
}

const NEAR0=[0.21,0.43,0.67,0.91,1.17,1.41,1.63,1.87], OUTER=[3.4,4.1,5.3,6.7,8.2],
      LOGS=[1.3,1.9,2.6,3.4,4.5], SMALL=[0.11,0.29,0.47,0.62,0.78], UNIT=[0.21,0.43,0.67,0.91,1.1];
const CORPUS=[["x*sin(x^2)",NEAR0],["x^3*cos(x^4)",NEAR0],["tan(x)",SMALL],["sec(x)^2",SMALL],
["1/(x*log(x))",OUTER],["x/(x^2+1)",NEAR0],["x*e^x",NEAR0],["x^2*e^x",NEAR0],["log(x)",LOGS],
["asin(x)",SMALL],["atan(x)",NEAR0],["e^x*sin(x)",NEAR0],["x^2*log(x)",LOGS],["sec(x)^3",SMALL],
["1/(x^2-1)",OUTER],["1/(x^4-1)",OUTER],["1/(x^3+x)",NEAR0],["x^3/(x^2-1)",OUTER],
["1/((x-1)^2*(x+2))",OUTER],["(x^2+1)/(x^3-x)",OUTER],["sqrt(4-x^2)",NEAR0],["sqrt(9-x^2)",NEAR0],
["1/sqrt(4-x^2)",NEAR0],["sqrt(1+x^2)",NEAR0],["sqrt(x^2-1)",OUTER],["x^2/sqrt(x^2-9)",OUTER],
["x^2*sqrt(4-x^2)",NEAR0],["1/(x^2*sqrt(x^2-1))",OUTER],["1/sqrt(x^2+4*x+13)",NEAR0],
["1/(x^2+2*x+5)",NEAR0],["sin(x)^2",NEAR0],["sin(x)^3",NEAR0],["sin(x)^2*cos(x)^2",NEAR0],
["tan(x)^3",SMALL],["x*sqrt(x+1)",NEAR0],["1/(1+sqrt(x))",NEAR0],["x^3*e^(x^2)",NEAR0],
["log(x)/x^2",LOGS],["e^(sqrt(x))",NEAR0],["x*atan(x)",UNIT]];

let ok = 0; const by = {}; const still = [];
console.log("=== FIX LAYER v3 — general assumption-driven radical reduction ===\n");
for (const [f, pts] of CORPUS) {
  const r = solve(f, pts);
  if (r.ok) { ok++; by[r.t] = (by[r.t] || 0) + 1;
    if (r.t !== "raw") console.log(`  FIXED  ∫ ${f.padEnd(22)} ${String(r.c).slice(0,38).padEnd(40)} [${r.t.slice(0,30)}]`);
  } else { still.push(f); console.log(`  FAIL   ∫ ${f.padEnd(22)} (${r.tried} candidates)`); }
}
console.log(`\n  ${ok}/${CORPUS.length} = ${((ok/CORPUS.length)*100).toFixed(1)}%   (baseline 70.0% | v1 72.5% | v2 82.5%)`);
console.log("\n  by technique:");
for (const [t, n] of Object.entries(by).sort((a,b)=>b[1]-a[1])) console.log(`    ${String(n).padStart(3)}  ${t}`);
if (still.length) { console.log("\n  still failing:"); for (const s of still) console.log(`    ∫ ${s}`); }
