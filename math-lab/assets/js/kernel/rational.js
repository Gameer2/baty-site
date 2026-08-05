"use strict";
/* Exact rational arithmetic on BigInt numerator/denominator pairs.
   No floats anywhere in this module — floats belong only at the numeric-evaluation
   boundary (see docs/kernel/03_ARCHITECTURE.md L0). Every Rational is reduced to lowest
   terms with a positive denominator at construction, which is what makes structural
   equality on Rational meaningful without a separate normalization pass. */

function bigAbs(a) {
  return a < 0n ? -a : a;
}

function bigGcd(a, b) {
  a = bigAbs(a);
  b = bigAbs(b);
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

class Rational {
  // Private-by-convention constructor: always go through Rational.of so reduction happens once.
  constructor(num, den) {
    this.num = num;
    this.den = den;
    Object.freeze(this);
  }

  static of(num, den) {
    if (typeof num === "number") num = BigInt(num);
    if (den === undefined) den = 1n;
    if (typeof den === "number") den = BigInt(den);
    if (den === 0n) throw new RangeError("Rational: division by zero");
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const g = bigGcd(num, den) || 1n;
    return new Rational(num / g, den / g);
  }

  get isInteger() {
    return this.den === 1n;
  }

  get isZero() {
    return this.num === 0n;
  }

  get isOne() {
    return this.num === 1n && this.den === 1n;
  }

  get sign() {
    if (this.num === 0n) return 0;
    return this.num < 0n ? -1 : 1;
  }

  neg() {
    return new Rational(-this.num, this.den);
  }

  abs() {
    return this.num < 0n ? this.neg() : this;
  }

  add(other) {
    return Rational.of(this.num * other.den + other.num * this.den, this.den * other.den);
  }

  sub(other) {
    return Rational.of(this.num * other.den - other.num * this.den, this.den * other.den);
  }

  mul(other) {
    return Rational.of(this.num * other.num, this.den * other.den);
  }

  div(other) {
    if (other.num === 0n) throw new RangeError("Rational: division by zero");
    return Rational.of(this.num * other.den, this.den * other.num);
  }

  // Integer exponent only — fractional powers are an L2/L3 concern (algebraic, not arithmetic).
  pow(n) {
    if (typeof n !== "number" && typeof n !== "bigint") {
      throw new TypeError("Rational.pow: exponent must be a plain integer");
    }
    let e = typeof n === "bigint" ? n : BigInt(n);
    if (e === 0n) return Rational.of(1n, 1n);
    if (this.num === 0n) {
      if (e < 0n) throw new RangeError("Rational: 0 to a negative power");
      return Rational.of(0n, 1n);
    }
    const neg = e < 0n;
    if (neg) e = -e;
    let base = this;
    let result = Rational.of(1n, 1n);
    while (e > 0n) {
      if (e & 1n) result = result.mul(base);
      base = base.mul(base);
      e >>= 1n;
    }
    return neg ? Rational.of(1n, 1n).div(result) : result;
  }

  compare(other) {
    const lhs = this.num * other.den;
    const rhs = other.num * this.den;
    if (lhs < rhs) return -1;
    if (lhs > rhs) return 1;
    return 0;
  }

  equals(other) {
    return other instanceof Rational && this.num === other.num && this.den === other.den;
  }

  // Deterministic small integer hash from the reduced (num, den) pair — used as an input to
  // Expr hashing, not for anything cryptographic.
  hash() {
    // 32-bit FNV-1a mixed over the decimal string of num and den — stable across runs and
    // independent of BigInt internal representation.
    let h = 0x811c9dc5;
    const s = this.num.toString() + "/" + this.den.toString();
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  toNumber() {
    // Numeric-evaluation boundary only (verification, plotting). Never used inside the
    // symbolic core.
    return Number(this.num) / Number(this.den);
  }

  toString() {
    return this.den === 1n ? this.num.toString() : `${this.num}/${this.den}`;
  }
}

Rational.ZERO = Rational.of(0n, 1n);
Rational.ONE = Rational.of(1n, 1n);
Rational.MINUS_ONE = Rational.of(-1n, 1n);

module.exports = { Rational, bigGcd, bigAbs };
