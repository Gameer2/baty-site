"use strict";
/* TEST-ONLY numeric evaluator, shared by verify-kernel-properties.js and
   verify-rewrite*.js. Not a kernel deliverable — floats belong only at this kind of
   boundary (docs/kernel/03_ARCHITECTURE.md §3 L0); property tests need real numbers to
   check that a rewrite preserved a value, which is exactly what this is for. */

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  ln: Math.log, log: Math.log, exp: Math.exp,
  sqrt: Math.sqrt, abs: Math.abs,
  sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cot: (x) => 1 / Math.tan(x),
};

function evalNumeric(expr, bindings) {
  switch (expr.kind) {
    case "Integer":
      return Number(expr.value);
    case "Rational":
      return expr.value.toNumber();
    case "Symbol":
      if (!(expr.name in bindings)) throw new Error("unbound symbol " + expr.name);
      return bindings[expr.name];
    case "Add":
      return expr.args.reduce((s, a) => s + evalNumeric(a, bindings), 0);
    case "Mul":
      return expr.args.reduce((s, a) => s * evalNumeric(a, bindings), 1);
    case "Pow":
      return Math.pow(evalNumeric(expr.base, bindings), evalNumeric(expr.exp, bindings));
    case "Func": {
      const args = expr.args.map((a) => evalNumeric(a, bindings));
      if (!(expr.name in FUNCS)) throw new Error("cannot evaluate func " + expr.name);
      return FUNCS[expr.name](...args);
    }
    default:
      throw new Error("cannot evaluate kind " + expr.kind);
  }
}

module.exports = { evalNumeric, FUNCS };
