"use strict";
/* L0 — Printer: text and LaTeX. See docs/kernel/03_ARCHITECTURE.md §3 L0.

   Text output is the round-trip format: parse(print(e)) must equal e (the Phase 1 gate in
   docs/kernel/04_BUILD_PHASES.md). Correctness of the round-trip matters more than cosmetic
   elegance, so this printer favours unambiguous parenthesization over minimal parenthesization. */

const { Expr } = require("./expr");

const PREC = { ADD: 1, MUL: 2, POW: 3, ATOM: 4 };

const BIND_KEYWORD = {
  Integral: "integral",
  Sum: "sum",
  Product: "product",
  Limit: "limit",
  Derivative: "derivative",
};

function isNegativeNumeric(e) {
  return Expr.isNumeric(e) && Expr.numericValue(e).sign < 0;
}

function precedenceOf(e) {
  switch (e.kind) {
    case "Integer":
    case "Rational":
      return isNegativeNumeric(e) ? PREC.ADD : PREC.ATOM;
    case "Symbol":
    case "BoundVar":
    case "Func":
    case "Bind":
      return PREC.ATOM;
    case "Pow":
      return PREC.POW;
    case "Mul":
      return PREC.MUL;
    case "Add":
      return PREC.ADD;
    default:
      throw new Error("precedenceOf: unknown kind " + e.kind);
  }
}

// ---------------------------------------------------------------------------------------
// Fresh display-name selection for bound variables (readability only — structural
// correctness never depends on this, since BoundVar/Symbol can never collide by kind).
// ---------------------------------------------------------------------------------------

function pickFreshName(preferred, avoid) {
  if (!avoid.has(preferred)) return preferred;
  let i = 1;
  while (avoid.has(preferred + "_" + i)) i++;
  return preferred + "_" + i;
}

function bindAvoidSet(node, envStack) {
  const s = Expr.freeSymbols(node.body);
  for (const e of node.extra) Expr.freeSymbols(e, s);
  for (const n of envStack) s.add(n);
  return s;
}

// ---------------------------------------------------------------------------------------
// Text printer
// ---------------------------------------------------------------------------------------

function textChild(e, envStack, minPrec) {
  const s = printText(e, envStack);
  return precedenceOf(e) < minPrec ? "(" + s + ")" : s;
}

function printAddText(e, envStack) {
  let out = "";
  e.args.forEach((term, i) => {
    let sign = "+";
    let display = term;
    if (isNegativeNumeric(term)) {
      sign = "-";
      display = Expr.numericValue(term).sign < 0 ? negateNumeric(term) : term;
    } else if (term.kind === "Mul" && isNegativeNumeric(term.args[0])) {
      sign = "-";
      display = Expr.mul(negateNumeric(term.args[0]), ...term.args.slice(1));
    }
    const text = textChild(display, envStack, PREC.MUL);
    if (i === 0) out += sign === "-" ? "-" + text : text;
    else out += " " + sign + " " + text;
  });
  return out;
}

function negateNumeric(e) {
  const v = Expr.numericValue(e);
  return e.kind === "Integer" ? Expr.int(-v.num) : Expr.rat(-v.num, v.den);
}

function printFactorsText(factors, envStack) {
  const numFactors = [];
  const denFactors = [];
  for (const t of factors) {
    if (t.kind === "Pow" && t.exp.kind === "Integer" && t.exp.value < 0n) {
      const posExp = -t.exp.value;
      denFactors.push(posExp === 1n ? t.base : Expr.pow(t.base, Expr.int(posExp)));
    } else {
      numFactors.push(t);
    }
  }
  let negPrefix = false;
  if (numFactors.length > 0 && numFactors[0].kind === "Integer" && numFactors[0].value === -1n) {
    negPrefix = true;
    numFactors.shift();
  }
  const numStr = numFactors.length === 0 ? "1" : numFactors.map((f) => textChild(f, envStack, PREC.MUL)).join("*");
  const numOut = (negPrefix ? "-" : "") + numStr;
  if (denFactors.length === 0) return numOut;
  // A single denominator factor still needs parens if IT is itself a product (or lower
  // precedence): "/" and "*" share precedence and are left-associative in the parser, so an
  // unparenthesized "x*y" right after "/" would only bind the first factor — (x+y)/x*y
  // reparses as ((x+y)/x)*y, not (x+y)/(x*y). Require strictly higher than Mul, not merely
  // not-lower, to force those parens (this was a real, previously undetected round-trip bug).
  const denStr =
    denFactors.length === 1
      ? textChild(denFactors[0], envStack, PREC.MUL + 1)
      : "(" + denFactors.map((f) => textChild(f, envStack, PREC.MUL)).join("*") + ")";
  return numOut + "/" + denStr;
}

function printMulText(e, envStack) {
  return printFactorsText(e.args, envStack);
}

function printPowText(e, envStack) {
  const baseStr = textChild(e.base, envStack, PREC.POW + 1);
  const expStr = textChild(e.exp, envStack, PREC.POW);
  return baseStr + "^" + expStr;
}

function printText(e, envStack) {
  envStack = envStack || [];
  switch (e.kind) {
    case "Integer":
      return e.value.toString();
    case "Rational":
      return e.value.toString();
    case "Symbol":
      return e.name;
    case "BoundVar":
      return envStack[e.depth] !== undefined ? envStack[e.depth] : "_free" + e.depth;
    case "Add":
      return printAddText(e, envStack);
    case "Mul":
      return printMulText(e, envStack);
    case "Pow":
      if (e.exp.kind === "Integer" && e.exp.value < 0n) return printFactorsText([e], envStack);
      return printPowText(e, envStack);
    case "Func":
      return e.name + "(" + e.args.map((a) => printText(a, envStack)).join(",") + ")";
    case "Bind": {
      const keyword = BIND_KEYWORD[e.head] || e.head.toLowerCase();
      const avoid = bindAvoidSet(e, envStack);
      const name = pickFreshName(e.displayName, avoid);
      const bodyStr = printText(e.body, [name, ...envStack]);
      const extraStr = e.extra.map((x) => printText(x, envStack));
      return keyword + "(" + [bodyStr, name, ...extraStr].join(",") + ")";
    }
    default:
      throw new Error("printText: unknown kind " + e.kind);
  }
}

// ---------------------------------------------------------------------------------------
// LaTeX printer — one-way rendering, not re-parsed. Good-enough coverage for the corpus;
// full aesthetic fidelity is L5 territory.
// ---------------------------------------------------------------------------------------

const LATEX_FUNC = {
  sin: "\\sin", cos: "\\cos", tan: "\\tan",
  asin: "\\arcsin", acos: "\\arccos", atan: "\\arctan",
  sinh: "\\sinh", cosh: "\\cosh", tanh: "\\tanh",
  ln: "\\ln", exp: "\\exp",
  sqrt: "\\sqrt",
  abs: "\\operatorname{abs}",
};

const LATEX_BIND = {
  Integral: (bodyStr, name, extra) =>
    extra.length === 2
      ? `\\int_{${extra[0]}}^{${extra[1]}} ${bodyStr} \\, d${name}`
      : `\\int ${bodyStr} \\, d${name}`,
  Sum: (bodyStr, name, extra) =>
    extra.length === 2 ? `\\sum_{${name}=${extra[0]}}^{${extra[1]}} ${bodyStr}` : `\\sum_{${name}} ${bodyStr}`,
  Product: (bodyStr, name, extra) =>
    extra.length === 2 ? `\\prod_{${name}=${extra[0]}}^{${extra[1]}} ${bodyStr}` : `\\prod_{${name}} ${bodyStr}`,
  Limit: (bodyStr, name, extra) => `\\lim_{${name} \\to ${extra[0]}} ${bodyStr}`,
  Derivative: (bodyStr, name) => `\\frac{d}{d${name}}\\left(${bodyStr}\\right)`,
};

function latexChild(e, envStack, minPrec) {
  const s = printLatex(e, envStack);
  return precedenceOf(e) < minPrec ? "\\left(" + s + "\\right)" : s;
}

function printAddLatex(e, envStack) {
  let out = "";
  e.args.forEach((term, i) => {
    let sign = "+";
    let display = term;
    if (isNegativeNumeric(term)) {
      sign = "-";
      display = negateNumeric(term);
    } else if (term.kind === "Mul" && isNegativeNumeric(term.args[0])) {
      sign = "-";
      display = Expr.mul(negateNumeric(term.args[0]), ...term.args.slice(1));
    }
    const text = latexChild(display, envStack, PREC.MUL);
    if (i === 0) out += sign === "-" ? "-" + text : text;
    else out += " " + sign + " " + text;
  });
  return out;
}

function printFactorsLatex(factors, envStack) {
  const numFactors = [];
  const denFactors = [];
  for (const t of factors) {
    if (t.kind === "Pow" && t.exp.kind === "Integer" && t.exp.value < 0n) {
      const posExp = -t.exp.value;
      denFactors.push(posExp === 1n ? t.base : Expr.pow(t.base, Expr.int(posExp)));
    } else {
      numFactors.push(t);
    }
  }
  let negPrefix = false;
  if (numFactors.length > 0 && numFactors[0].kind === "Integer" && numFactors[0].value === -1n) {
    negPrefix = true;
    numFactors.shift();
  }
  const numStr =
    numFactors.length === 0 ? "1" : numFactors.map((f) => latexChild(f, envStack, PREC.MUL)).join(" \\cdot ");
  const numOut = (negPrefix ? "-" : "") + numStr;
  if (denFactors.length === 0) return numOut;
  const denStr =
    denFactors.length === 1
      ? printLatex(denFactors[0], envStack)
      : denFactors.map((f) => printLatex(f, envStack)).join(" \\cdot ");
  return `\\frac{${numOut}}{${denStr}}`;
}

function printMulLatex(e, envStack) {
  return printFactorsLatex(e.args, envStack);
}

function printLatex(e, envStack) {
  envStack = envStack || [];
  switch (e.kind) {
    case "Integer":
      return e.value.toString();
    case "Rational":
      return e.value.sign < 0
        ? `-\\frac{${-e.value.num}}{${e.value.den}}`
        : `\\frac{${e.value.num}}{${e.value.den}}`;
    case "Symbol":
      return e.name;
    case "BoundVar":
      return envStack[e.depth] !== undefined ? envStack[e.depth] : "?";
    case "Add":
      return printAddLatex(e, envStack);
    case "Mul":
      return printMulLatex(e, envStack);
    case "Pow": {
      if (e.exp.kind === "Rational" && e.exp.value.num === 1n && e.exp.value.den === 2n) {
        return `\\sqrt{${printLatex(e.base, envStack)}}`;
      }
      const baseStr = latexChild(e.base, envStack, PREC.POW + 1);
      return `${baseStr}^{${printLatex(e.exp, envStack)}}`;
    }
    case "Func": {
      const name = LATEX_FUNC[e.name] || `\\operatorname{${e.name}}`;
      if (e.name === "sqrt" && e.args.length === 1) return `\\sqrt{${printLatex(e.args[0], envStack)}}`;
      return `${name}\\left(${e.args.map((a) => printLatex(a, envStack)).join(", ")}\\right)`;
    }
    case "Bind": {
      const avoid = bindAvoidSet(e, envStack);
      const name = pickFreshName(e.displayName, avoid);
      const bodyStr = printLatex(e.body, [name, ...envStack]);
      const extraStr = e.extra.map((x) => printLatex(x, envStack));
      const fn = LATEX_BIND[e.head];
      return fn ? fn(bodyStr, name, extraStr) : `\\operatorname{${e.head}}\\left(${bodyStr}\\right)`;
    }
    default:
      throw new Error("printLatex: unknown kind " + e.kind);
  }
}

module.exports = {
  text: (e) => printText(e, []),
  latex: (e) => printLatex(e, []),
};
