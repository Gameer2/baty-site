"use strict";
/* L2/L2b — Rewrite engine: bottom-up rule application to a fixed point, under an explicit,
   reproducible budget. See docs/kernel/03_ARCHITECTURE.md §3 L2b and
   docs/kernel/04_BUILD_PHASES.md Phase 2d.

   Budget exhaustion is ALWAYS a refusal with a reason, never a partially-simplified
   expression handed back as if it were the answer (docs/kernel/03_ARCHITECTURE.md §3 L2b
   point 4) — this routes into the same safe-failure discipline as the L4 verification gate.

   maxSteps bounds actual rewrite APPLICATIONS (not failed match attempts), which is what
   makes it reproducible across machines where a wall-clock deadline is not — a slower
   machine takes the same number of steps to hit the same limit. */

const { Expr } = require("./expr");
const { cost } = require("./cost");
const { applyRule } = require("./rules");
const { Derivation } = require("./derivation");
const { collectLikeTerms } = require("./collect");

const DEFAULT_BUDGET = { maxSteps: 2000, maxNodes: 20000 };

class RewriteBudgetExceeded extends Error {
  constructor(limit, details) {
    super(`rewrite: search budget exceeded (${limit})`);
    this.name = "RewriteBudgetExceeded";
    this.limit = limit;
    this.details = details;
  }
}

function checkBudget(expr, state, budget) {
  if (state.steps > budget.maxSteps) {
    throw new RewriteBudgetExceeded("maxSteps", { steps: state.steps });
  }
  const c = cost(expr);
  if (c > budget.maxNodes) {
    throw new RewriteBudgetExceeded("maxNodes", { cost: c });
  }
  // The outermost safety net (docs/kernel/03_ARCHITECTURE.md §3 L2b) — maxSteps/maxNodes are
  // the reproducible bounds that should normally catch a problem first; reaching this one is
  // a bug report, not normal operation (docs/kernel/04_BUILD_PHASES.md Phase 2d gate). Checked
  // INSIDE the search loop rather than relying on an external kill switch, because Phase 2c's
  // in-page syncCall fallback (assets/js/cas-client.js) has no external kill switch to rely
  // on — synchronous JS cannot be interrupted from outside itself.
  if (budget.deadline !== undefined && budget.deadline !== null && Date.now() > budget.deadline) {
    throw new RewriteBudgetExceeded("deadline", { steps: state.steps });
  }
}

// Resolve the effective deadline for one normalize() call: an explicit budget.deadline wins;
// otherwise cooperate with cas-client.js's syncCall, which stamps self.CAS_DEADLINE for the
// duration of a call specifically because that path has no external way to stop a hang.
function resolveDeadline(budget) {
  if (budget && budget.deadline !== undefined) return budget.deadline;
  if (typeof self !== "undefined" && self.CAS_DEADLINE) return self.CAS_DEADLINE;
  return null;
}

// One rule-application attempt at the TOP of `expr` (children already handled by the
// caller). Returns { result, binding, rule } or null if no rule in the set applies here.
function tryOneRule(expr, ruleSet, ctx) {
  for (const rule of ruleSet.rulesFor(expr)) {
    const applied = applyRule(rule, expr, ctx);
    if (applied) return { ...applied, rule };
  }
  return null;
}

// Recurse into operands first (post-order), collecting only the "interesting" child
// derivations — ones where something actually changed — so the tree stays focused on what
// happened rather than mirroring the whole parse tree.
function rewriteChildren(expr, ruleSet, ctx, budget, state) {
  switch (expr.kind) {
    case "Add": {
      const results = expr.args.map((a) => rewriteBottomUp(a, ruleSet, ctx, budget, state));
      // collectLikeTerms is unconditionally sound (no assumptions needed), unlike
      // expand/factor/separate — so it runs as standing canonicalization on every Add
      // rebuild, not as an opt-in rule. See collect.js for why this exists.
      const node = collectLikeTerms(Expr.add(...results.map((r) => r.result)));
      const children = results.map((r) => r.derivation).filter(interesting);
      return { node, children };
    }
    case "Mul": {
      const results = expr.args.map((a) => rewriteBottomUp(a, ruleSet, ctx, budget, state));
      const node = Expr.mul(...results.map((r) => r.result));
      const children = results.map((r) => r.derivation).filter(interesting);
      return { node, children };
    }
    case "Pow": {
      const rb = rewriteBottomUp(expr.base, ruleSet, ctx, budget, state);
      const re = rewriteBottomUp(expr.exp, ruleSet, ctx, budget, state);
      return { node: Expr.pow(rb.result, re.result), children: [rb.derivation, re.derivation].filter(interesting) };
    }
    case "Func": {
      const results = expr.args.map((a) => rewriteBottomUp(a, ruleSet, ctx, budget, state));
      return { node: Expr.func(expr.name, results.map((r) => r.result)), children: results.map((r) => r.derivation).filter(interesting) };
    }
    case "Bind": {
      const rBody = rewriteBottomUp(expr.body, ruleSet, ctx, budget, state);
      const rExtra = expr.extra.map((e) => rewriteBottomUp(e, ruleSet, ctx, budget, state));
      const node = Expr.bindRaw(expr.head, rBody.result, rExtra.map((r) => r.result), expr.displayName);
      const children = [rBody.derivation, ...rExtra.map((r) => r.derivation)].filter(interesting);
      return { node, children };
    }
    default: // Integer, Rational, Symbol, BoundVar — no operands to recurse into
      return { node: expr, children: [] };
  }
}

function interesting(derivation) {
  return derivation.result !== derivation.goal || derivation.children.length > 0;
}

// Rewrite `expr` bottom-up to a fixed point under `ruleSet`, respecting the shared budget
// `state`. Returns { result, derivation }; throws RewriteBudgetExceeded if the budget runs
// out (the public entry point `normalize` below converts that into a refusal).
function rewriteBottomUp(expr, ruleSet, ctx, budget, state) {
  const { node, children } = rewriteChildren(expr, ruleSet, ctx, budget, state);

  let current = node;
  let derivation = Derivation.leaf(node, ctx, children);

  while (true) {
    checkBudget(current, state, budget);
    const found = tryOneRule(current, ruleSet, ctx);
    if (!found) break;
    state.steps++;
    derivation = Derivation.step(found.rule, found.binding, current, found.result, ctx, [derivation]);
    current = found.result;
    checkBudget(current, state, budget);
  }

  return { result: current, derivation };
}

// Public entry point. Never throws for budget exhaustion — returns a refusal object instead
// (docs/kernel/03_ARCHITECTURE.md §3 L2b point 4). Genuine bugs (not budget-related) still
// propagate as exceptions; only RewriteBudgetExceeded is converted.
function normalize(expr, ruleSet, ctx, budget) {
  const effectiveBudget = Object.assign({}, DEFAULT_BUDGET, budget || {});
  effectiveBudget.deadline = resolveDeadline(budget);
  const state = { steps: 0 };
  try {
    const { result, derivation } = rewriteBottomUp(expr, ruleSet, ctx, effectiveBudget, state);
    return { refused: false, result, derivation, steps: state.steps };
  } catch (e) {
    if (e instanceof RewriteBudgetExceeded) {
      return { refused: true, reason: e.message, limit: e.limit, details: e.details, steps: state.steps };
    }
    throw e;
  }
}

module.exports = { normalize, RewriteBudgetExceeded, DEFAULT_BUDGET };
