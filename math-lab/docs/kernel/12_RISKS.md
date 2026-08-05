# 12 — Risk Register

Ordered by expected damage. Review at every phase gate.

---

## R1 — Assumptions retrofitted late
**Severity: critical · Likelihood without action: high**

Building L2–L5 before L1 means every rewrite rule, every branch decision, and every domain
condition gets written *without* a way to express what is known about a symbol. Retrofitting means
revisiting all of it. SymPy's assumptions system is among its most complex subsystems precisely
because it interacts with everything.

**Evidence this is real:** three independent measured findings converge on it — trig-substitution
branch failures in calculus, the branch-cut hazard already flagged in the complex roadmap, and the
complete absence of any assumptions machinery in nerdamer to extend.

**Mitigation:** Phase 1, before anything else. This is the only non-negotiable ordering constraint
in `04_BUILD_PHASES.md`.

---

## R2 — Scope creep back toward "complete"
**Severity: high · Likelihood: high**

"Complete CAS" has no finish line. Full Risch is >100 pages and not completely implemented anywhere
after fifty years. A project without a definition of done runs until morale fails.

**Mitigation:** corpus closure is the definition of done (`02_TARGET_STATE.md`). The syllabus subset
of the Rubi corpus is the target; the full 72k suite is a stretch measure only. **Track the subset
for morale, the full corpus for honesty.** Say no to anything outside the corpus, and record it as
a future corpus expansion rather than silent scope growth.

---

## R3 — Silently wrong answers reach students
**Severity: critical · Likelihood: low (already mitigated)**

The measured baseline is **15% silently wrong**. A confident wrong answer is worse than a refusal,
because a student cannot detect it.

**Mitigation:** the L4 verification gate already exists and works — it is why the suite reads
809/809 over a 70% dependency. Keep it **mandatory**: never return an unverified result; when the
check cannot run, refuse. Track `REFUSED → WRONG` transitions as regressions even when total
coverage rises.

---

## R3b — Inconsistent assumptions produce wrong answers the gate cannot catch
**Severity: critical · Likelihood: medium without action · Identified 2026-07-26**

Every other correctness risk in this register is caught by the L4 verification gate. **This one is
not.** If a context holds both `x>0` and `x<0`, it proves anything, and a result derived under it
will still differentiate back correctly at the sample points where one of the two happens to hold.
The gate sees a passing check. The answer is unsound.

The same applies more quietly to *unstated* assumptions: a step valid only under `x>0`, applied to
an input where nothing was assumed, produces an answer that verifies numerically at positive sample
points and is simply wrong elsewhere. `05_BENCHMARKS.md` §5 already picks sample points inside the
domain — which means the gate is *structurally unable* to notice.

**Mitigation:**
- Contradiction detection at assertion time, not query time (`04_BUILD_PHASES.md` Phase 1, task 6c)
- `isConsistent()` asserted at every scope entry
- Property test: no context answers `true` to both `P` and `¬P` (`07_VALIDATION.md` §3)
- Per-node `context` in the derivation tree, plus the **assumption-honesty check** — every
  assumption relied on is either implied by the input or surfaced in the narration
  (`07_VALIDATION.md` §8)

**This is why assumptions must be a small constraint store rather than a bag of flags:** a flag set
cannot detect its own inconsistency.

---

## R4 — Branch cuts baked into the complex engine before assumptions exist
**Severity: high · Likelihood: medium**

Complex engine Phases 1–2 are already marked complete, but they were built before any assumptions
layer existed. Branch errors are *plausible-looking* and pass pointwise numeric checks — a 2πi
offset is invisible at a single point.

**Mitigation:** do not build complex Phases 3–6 before kernel Phase 1. **Re-validate the shipped
exp/log/powers work** against the assumptions layer when it lands. Make "evaluate on both sides of
the cut, assert the jump is exactly where declared" a standing test for every multivalued function.

---

## R5 — Rubi port stalls
**Severity: medium · Likelihood: medium**

6,700 rules in Mathematica notation is a large mechanical translation. A stalled port could block
Phase 5 indefinitely.

**Mitigation:** port **subtree by subtree**, gated by corpus coverage. Partial ports are immediately
useful, so the phase never blocks — coverage rises monotonically and you can stop at any point.
Write the translator first and test it on one subtree end-to-end before scaling.

---

## R6 — The rewrite stalls product progress
**Severity: medium · Likelihood: medium**

A 12–24 month kernel rewrite with no shippable output in between is how projects die.

**Mitigation:** strangler fig (`03_ARCHITECTURE.md` §4). Nerdamer remains the fallback; each kernel
capability simply stops falling through. **Working software at every commit.** You can stop after
any phase and still be better off than today — Phase 2 alone clears 8 of 12 measured failures.

---

## R7 — Performance makes the kernel unusable
**Severity: medium · Likelihood: medium**

Exact rational arithmetic on big integers, hash-consing, and pattern matching over thousands of
rules are all slower than nerdamer's float-and-string approach. Expression swell in intermediate
results is a classic CAS failure mode.

**Mitigation:** measure latency from Phase 1 (it is already a benchmark metric). Memoise via
hash-consing. Index the rule database by head symbol rather than scanning linearly. Budget: p95
under 300 ms per user-level operation. Do not optimise before measuring — but do measure from the
start, because an architecture that cannot hit the target needs to be known early.

**Upgraded 2026-07-26 from a warning to a mechanism.** This risk previously named expression swell
without saying what would prevent it. **Phase 2d** now owns it: a `cost(e)` metric, head-symbol rule
indexing, a `maxNodes` swell ceiling, and `maxSteps` bounded search — with **peak expression size
tracked per problem in every snapshot** (`05_BENCHMARKS.md` §1). Swell is invisible without that
instrumentation: intermediates grow by orders of magnitude while the final answer stays small, so
the first symptom is a timeout months later with no obvious cause. Note that `maxSteps` is
machine-independent where latency is not, which makes it the metric that can actually gate a commit.

---

## R8 — Server costs or latency undermine the product
**Severity: medium · Likelihood: medium**

Server-side is required for kernel secrecy but introduces per-request cost and network latency.

**Mitigation:** aggressive result caching (identical queries are extremely common in education —
a whole class does the same homework). Keep plotting and numeric evaluation client-side so the UI
stays responsive between symbolic calls. Batch related calls per page.

---

## R9 — Licence contamination
**Severity: high (legal) · Likelihood: low**

Copying GPL code (Maxima) into a closed-source commercial product would force open-sourcing of
derivatives.

**Mitigation:** the licence gate in `06_DATA_SOURCES.md`; MIT/BSD sources cover everything needed.
Maintain the licence ledger. Do not rely on the server-side SaaS gap. **Fix the missing
`*.LICENSE.txt` files in `assets/vendor/` before anything ships.**

---

## R10 — Solo-developer bus factor
**Severity: high · Likelihood: certain (single developer)**

A 12–24 month project held in one person's head, with a deliberately closed-source kernel, has no
redundancy.

**Mitigation:** this documentation set is the primary defence — decisions and their *evidence* are
written down, not just the conclusions. Keep it current at every phase gate. Keep the benchmark
snapshots forever: they are the record of what worked. Write design rationale in code comments in
the style already used in `verify-calculus.js`, which explains *why* finite differences are used
rather than just using them.

---

## R10b — CAS global state contaminates later operations
**Severity: high · Likelihood: certain (confirmed 2026-07-25)**

A single nerdamer `evaluate()` that throws leaves the library unable to classify a later,
unrelated equation (`01_CURRENT_STATE.md` §5b). Because `cas-worker.js` is persistent, one user
input silently degrades every subsequent one into a false refusal.

**Mitigation:** benchmarks run in child processes; the worker needs a state reset between
operations (Phase 2c); the new kernel must hold no mutable global state by construction.

---

## R11 — Test suite rots into a rubber stamp
**Severity: medium · Likelihood: medium**

Suites decay when failing cases get deleted to make numbers look good, or when assertions drift
toward asserting whatever the code currently does.

**Mitigation:** never delete a failing case — move it to known-failures with a reason and a target
phase. Assert on behaviour, never on strings. Keep the rule that a system may never verify itself.
Property-based and metamorphic tests (`07_VALIDATION.md` §3–4) resist rot because they encode
mathematical truth rather than current behaviour.

---

## R12 — Documentation rots
**Severity: low · Likelihood: high**

Already observed: `CURRICULUM_ROADMAP.md` claimed the ODE engine had "zero automated tests" while
`verify-ode.js` existed at 37 KB and passed. The §5 statuses had also rotted badly enough to need a
documented audit on 2026-07-22.

**Mitigation:** status claims must cite a runnable artifact (a test file, a benchmark snapshot).
Re-audit at every phase gate. Prefer generated numbers over hand-written ones wherever possible —
`tests/bench/baseline.js` output should be pasted into docs rather than summarised from memory.

---

## Review checklist

At every phase gate:

- [ ] R1 — is anything being built that will need assumptions retrofitted?
- [ ] R2 — has anything entered scope that is not in the corpus?
- [ ] R3 — did any `REFUSED → WRONG` transition occur?
- [ ] R3b — does any derivation node rely on an assumption that is neither implied by the input nor
      stated in the narration?
- [ ] R4 — has any complex work shipped without branch re-validation?
- [ ] R5 — did Rubi coverage rise this phase?
- [ ] R6 — is the product still shippable at this commit?
- [ ] R7 — is p95 latency still under budget, and did **peak expression size** hold steady?
- [ ] R9 — is the licence ledger current?
- [ ] R10/R12 — are these docs current, and do status claims cite artifacts?
