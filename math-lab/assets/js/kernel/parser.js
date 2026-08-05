"use strict";
/* L0 — Parser. See docs/kernel/03_ARCHITECTURE.md §3 L0 and
   docs/kernel/08_ENGINE_CALCULUS.md §6 ("the ln() independent-parse gate").

   The tokenizer reads identifiers by maximal munch (a run of letters/digits/underscore is
   ONE token), never letter-by-letter. This is what prevents the classic nerdamer misparse
   where `sin(x)`, `sen(x)`, `lg(x)`, `arctg(x)` get silently read as a product of
   single-character symbols (s*i*n*(x), s*e*n*(x), ...). Structurally, that misparse cannot
   happen here: an unrecognised name just becomes an opaque Func the algorithm layer will
   later refuse on, which is honest (L4 "refuse rather than guess"), not silently wrong. */

const { Expr } = require("./expr");

const BIND_HEAD = {
  integral: "Integral",
  sum: "Sum",
  product: "Product",
  limit: "Limit",
  derivative: "Derivative",
  diff: "Derivative",
};

// ---------------------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------------------

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < n && src[j] >= "0" && src[j] <= "9") j++;
      if (src[j] === "." && src[j + 1] >= "0" && src[j + 1] <= "9") {
        j++;
        while (j < n && src[j] >= "0" && src[j] <= "9") j++;
      }
      tokens.push({ type: "NUMBER", text: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ type: "IDENT", text: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/^(),".includes(c)) {
      tokens.push({ type: c, text: c });
      i++;
      continue;
    }
    throw new SyntaxError(`parse: unexpected character '${c}' at position ${i}`);
  }
  tokens.push({ type: "EOF", text: "" });
  return tokens;
}

function decimalToRational(text) {
  const dot = text.indexOf(".");
  if (dot === -1) return Expr.int(BigInt(text));
  const intPart = text.slice(0, dot);
  const fracPart = text.slice(dot + 1);
  const num = BigInt((intPart || "0") + fracPart);
  const den = 10n ** BigInt(fracPart.length);
  return Expr.rat(num, den);
}

// ---------------------------------------------------------------------------------------
// Recursive-descent parser
//   expr    := addSub
//   addSub  := mulDiv (('+' | '-') mulDiv)*
//   mulDiv  := unary (('*' | '/' | <implicit>) unary)*
//   unary   := ('+' | '-') unary | pow
//   pow     := atom ('^' unary)?          -- right-associative
//   atom    := NUMBER | IDENT ['(' args ')'] | '(' expr ')'
// ---------------------------------------------------------------------------------------

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  advance() {
    return this.tokens[this.pos++];
  }

  expect(type) {
    const t = this.peek();
    if (t.type !== type) {
      throw new SyntaxError(`parse: expected '${type}' but got '${t.text || "EOF"}' at token ${this.pos}`);
    }
    return this.advance();
  }

  parseExpr() {
    return this.parseAddSub();
  }

  parseAddSub() {
    let node = this.parseMulDiv();
    while (this.peek().type === "+" || this.peek().type === "-") {
      const op = this.advance().type;
      const rhs = this.parseMulDiv();
      node = op === "+" ? Expr.add(node, rhs) : Expr.sub(node, rhs);
    }
    return node;
  }

  canStartAtom() {
    const t = this.peek().type;
    return t === "NUMBER" || t === "IDENT" || t === "(";
  }

  parseMulDiv() {
    let node = this.parseUnary();
    while (true) {
      const t = this.peek().type;
      if (t === "*") {
        this.advance();
        node = Expr.mul(node, this.parseUnary());
      } else if (t === "/") {
        this.advance();
        node = Expr.div(node, this.parseUnary());
      } else if (this.canStartAtom()) {
        node = Expr.mul(node, this.parseUnary()); // implicit multiplication: "2x", "2(x+1)"
      } else {
        break;
      }
    }
    return node;
  }

  parseUnary() {
    if (this.peek().type === "-") {
      this.advance();
      return Expr.neg(this.parseUnary());
    }
    if (this.peek().type === "+") {
      this.advance();
      return this.parseUnary();
    }
    return this.parsePow();
  }

  parsePow() {
    const base = this.parseAtom();
    if (this.peek().type === "^") {
      this.advance();
      const exp = this.parseUnary(); // right-associative, allows x^-1
      return Expr.pow(base, exp);
    }
    return base;
  }

  parseArgs() {
    const args = [];
    this.expect("(");
    if (this.peek().type !== ")") {
      args.push(this.parseExpr());
      while (this.peek().type === ",") {
        this.advance();
        args.push(this.parseExpr());
      }
    }
    this.expect(")");
    return args;
  }

  parseAtom() {
    const t = this.peek();
    if (t.type === "NUMBER") {
      this.advance();
      return decimalToRational(t.text);
    }
    if (t.type === "(") {
      this.advance();
      const node = this.parseExpr();
      this.expect(")");
      return node;
    }
    if (t.type === "IDENT") {
      this.advance();
      if (this.peek().type === "(") {
        const args = this.parseArgs();
        const head = BIND_HEAD[t.text];
        if (head) return this.buildBind(head, t.text, args);
        return Expr.func(t.text, args);
      }
      return Expr.sym(t.text);
    }
    throw new SyntaxError(`parse: unexpected token '${t.text || "EOF"}' at token ${this.pos}`);
  }

  buildBind(head, keyword, args) {
    const minArgs = head === "Derivative" ? 2 : 2;
    if (args.length < minArgs) {
      throw new SyntaxError(`parse: ${keyword}(...) needs at least a body and a bound variable`);
    }
    const [body, varExpr, ...rest] = args;
    if (varExpr.kind !== "Symbol") {
      throw new SyntaxError(`parse: ${keyword}(...) second argument must be a plain variable name`);
    }
    return Expr.bind(head, varExpr.name, body, rest);
  }
}

function parse(src) {
  const tokens = tokenize(src);
  const parser = new Parser(tokens);
  const node = parser.parseExpr();
  parser.expect("EOF");
  return node;
}

module.exports = { parse, tokenize };
