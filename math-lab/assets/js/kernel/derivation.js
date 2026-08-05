"use strict";
/* L5 — Derivation IR. See docs/kernel/03_ARCHITECTURE.md §3 "The derivation IR".

   A derivation is a TREE, not a list — narration is rendered FROM it lazily and is never
   the source of truth. Building this now (Phase 2), rather than after the first integration
   technique ships, is deliberate: provenance is first recorded here, and a flat step list is
   expensive to widen into a tree once every technique already emits one.

   Structural shape (docs/kernel/03_ARCHITECTURE.md §3 L5):
     goal, result : Expr
     rule         : { id, name, source }   -- 'kernel' | 'rubi' | 'nerdamer'
     binding      : { patternVar -> Expr }
     context      : AssumptionContext in force at this node
     children     : Derivation[]           -- sub-derivations, dependency order
     narration()  : { text, latex }        -- COMPUTED from the fields above, never stored
                                               as raw prose — see the note on why below. */

let nodeCounter = 0;

class Derivation {
  constructor({ goal, result, rule, binding, context, children }) {
    this.id = ++nodeCounter;
    this.goal = goal;
    this.result = result;
    this.rule = rule || null; // { id, name, source, describe? }
    this.binding = binding || {};
    this.context = context || null;
    this.children = children || [];
  }

  // A leaf: nothing was rewritten, goal and result are the same expression. Used as the
  // base case a technique starts from, or to represent "no applicable rule" honestly rather
  // than omitting the node.
  static leaf(goal, context) {
    return new Derivation({ goal, result: goal, rule: null, binding: {}, context, children: [] });
  }

  static step(rule, binding, goal, result, context, children) {
    return new Derivation({ goal, result, rule, binding, context, children: children || [] });
  }

  // Narration is DERIVED, never authored directly — this is what makes it impossible to
  // construct a Derivation that carries prose with no structural backing. A rule may supply
  // `describe(binding, goal, result) -> {text, latex}`; nodes without a rule (leaves) or
  // whose rule supplies no describe() get a generic fallback built from the same fields.
  narration() {
    if (this.rule && typeof this.rule.describe === "function") {
      return this.rule.describe(this.binding, this.goal, this.result);
    }
    return genericNarration(this);
  }

  // Post-order walk: f(node) called for every node, children first.
  walk(f) {
    for (const c of this.children) c.walk(f);
    f(this);
  }

  // Every node whose rule fired (i.e. not a leaf where goal===result trivially) — the count
  // by rule.source is exactly the fall-through-rate metric, computed from the tree itself
  // rather than needing separate instrumentation (docs/kernel/03_ARCHITECTURE.md §3 L5).
  countBySource() {
    const counts = Object.create(null);
    this.walk((node) => {
      if (node.rule) counts[node.rule.source] = (counts[node.rule.source] || 0) + 1;
    });
    return counts;
  }

  // Flatten to the numbered list a student actually reads — a RENDERING of the tree, never
  // the tree itself. Only includes nodes where a rule actually fired.
  flatten() {
    const steps = [];
    this.walk((node) => {
      if (node.rule) steps.push({ rule: node.rule, narration: node.narration(), goal: node.goal, result: node.result });
    });
    return steps;
  }
}

const printer = require("./printer");

function genericNarration(node) {
  const name = node.rule ? node.rule.name : "no rewrite";
  return {
    text: `${name}: ${printer.text(node.goal)} -> ${printer.text(node.result)}`,
    latex: `${printer.latex(node.goal)} \\;\\to\\; ${printer.latex(node.result)}`,
  };
}

module.exports = { Derivation };
