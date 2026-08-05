"use strict";
/* L2 — Rule representation and rule database. See docs/kernel/03_ARCHITECTURE.md §3 L2/L2b
   and docs/kernel/04_BUILD_PHASES.md Phase 2 task 1 and Phase 2d task 2.

   A rule is DATA: { name, pattern, replacement, guard, direction }. This is what lets
   Phase 5 mechanically import 6,700 Rubi rules later, and what lets L5 report which rule
   fired as a derivation step (rule.describe).

   Rules are indexed by the HEAD SYMBOL of their pattern, never scanned linearly — 6,700
   Rubi rules make linear scanning quadratic in the worst case (docs/kernel/12_RISKS.md R7).
   Within a bucket, more specific patterns are tried before more general ones, then static
   priority, then rule name — the name tie-break is what keeps rule order deterministic
   regardless of what order rules were *added* in (the Phase 2d determinism gate). */

const { match } = require("./pattern");

function exprHead(expr) {
  switch (expr.kind) {
    case "Func": return "Func:" + expr.name;
    case "Pow": return "Pow";
    case "Add": return "Add";
    case "Mul": return "Mul";
    default: return expr.kind; // Integer, Rational, Symbol, BoundVar, Bind
  }
}

function patternHead(pattern) {
  switch (pattern.kind) {
    case "PFunc": return "Func:" + pattern.name;
    case "PPow": return "Pow";
    case "PAdd": return "Add";
    case "PMul": return "Mul";
    case "PSym": return "Symbol";
    case "PInt": return "Integer";
    case "PExact": return exprHead(pattern.expr);
    default: return "*"; // PVar / PAny at the top level — can match any node kind
  }
}

function specificity(pattern) {
  switch (pattern.kind) {
    case "PVar":
    case "PAny":
      return 0;
    case "PInt":
    case "PExact":
    case "PSym":
      return 2;
    case "PPow":
      return 1 + specificity(pattern.base) + specificity(pattern.exp);
    case "PFunc":
    case "PFuncAny":
      return 2 + pattern.args.reduce((s, p) => s + specificity(p), 0);
    case "PAdd":
    case "PMul":
      return 1 + pattern.args.reduce((s, p) => s + specificity(p), 0);
    default:
      return 0;
  }
}

let ruleCounter = 0;

function makeRule(spec) {
  if (!spec.name) throw new TypeError("makeRule: every rule needs a name");
  return {
    id: "kernel:" + spec.name,
    seq: ++ruleCounter, // construction order — used ONLY for a stable sort key, never for
                        // selection priority, so adding rules never silently reorders others
    name: spec.name,
    pattern: spec.pattern,
    replacement: spec.replacement,
    guard: spec.guard || null,
    direction: spec.direction || "normalize",
    category: spec.category || "uncategorized",
    priority: spec.priority || 0,
    describe: spec.describe || null,
    source: spec.source || "kernel",
  };
}

function applyRule(rule, expr, ctx) {
  const bindings = match(rule.pattern, expr);
  if (!bindings) return null;
  const binding = Object.fromEntries(bindings);
  if (rule.guard && !rule.guard(binding, ctx)) return null;
  const result = rule.replacement(binding, ctx);
  return { result, binding };
}

class RuleSet {
  constructor(rules) {
    this.buckets = new Map();
    this.wildcard = [];
    for (const rule of rules || []) this._add(rule);
    this._sortAll();
  }

  _add(rule) {
    const head = patternHead(rule.pattern);
    if (head === "*") {
      this.wildcard.push(rule);
      return;
    }
    if (!this.buckets.has(head)) this.buckets.set(head, []);
    this.buckets.get(head).push(rule);
  }

  _sortAll() {
    const cmp = (a, b) => {
      const sa = specificity(a.pattern), sb = specificity(b.pattern);
      if (sa !== sb) return sb - sa;
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; // deterministic, not insertion order
    };
    for (const bucket of this.buckets.values()) bucket.sort(cmp);
    this.wildcard.sort(cmp);
  }

  add(rule) {
    this._add(rule);
    this._sortAll();
    return this;
  }

  merge(other) {
    return new RuleSet([...this.all(), ...other.all()]);
  }

  all() {
    return [...[...this.buckets.values()].flat(), ...this.wildcard];
  }

  // Candidate rules for `expr`, in try-order (specificity, then priority, then name).
  rulesFor(expr) {
    const head = exprHead(expr);
    const bucket = this.buckets.get(head) || [];
    return this.wildcard.length ? bucket.concat(this.wildcard) : bucket;
  }
}

module.exports = { makeRule, applyRule, RuleSet, exprHead, patternHead, specificity };
