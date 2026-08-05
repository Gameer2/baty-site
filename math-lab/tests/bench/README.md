# Benchmark Harness

Measures the symbolic kernel's real capability. Methodology in `docs/kernel/05_BENCHMARKS.md`.

```bash
node tests/bench/baseline.js            # 40-problem smoke corpus + kernel probes, writes snapshot
node tests/bench/baseline.js --quick    # same, no snapshot
node tests/bench/baseline.js --compare  # diff vs newest snapshot; exit 1 on regression

# The real measure — the Rubi corpus (Phase 0)
node tests/bench/import-rubi.js                        # download + parse, once
node tests/bench/baseline.js --corpus=syllabus         # 875 undergraduate problems
node tests/bench/baseline.js --corpus=full --limit=2000 # stretch measure, sampled
node tests/bench/baseline.js --corpus=syllabus --offset=400 --limit=100
```

## The two corpora

| Corpus | Size | Role |
|---|---|---|
| `rubi-syllabus.json` | 875 | Stewart/Apostol/Moses/Hearn, special functions excluded. **This defines "done."** Committed. |
| `rubi-full.json` | 72,039 | Everything. Stretch measure only — reaches far past an undergraduate syllabus. Gitignored; regenerate with the importer. |
| built-in 40 | 40 | Fast smoke test. Hand-picked and *easy* — it flatters the engine, so never quote it as the headline. |

Source: [RuleBasedIntegration/MaximaSyntaxTestSuite](https://github.com/RuleBasedIntegration/MaximaSyntaxTestSuite) — **MIT**. Maxima
syntax is used because it is infix and maps nearly one-to-one onto math.js; the Maxima
*program* is GPL but this is Rubi's own test data in Maxima notation, MIT-licensed.

Each entry is `[integrand, variable, optimalSteps, expectedAntiderivative]`, where
`optimalSteps` is how many rule applications Rubi needs — a genuine difficulty rating, which
the harness reports coverage against.

**Symbolic parameters:** 63,153 of the 72,039 problems carry them (`a`, `b`, `m`, `n`, …). The
importer renames every one to `p1, p2, …` so none can collide with a math.js constant — a bare
`e` would otherwise silently resolve to Euler's number instead of the value being substituted.
The harness then binds each to a distinct incommensurate value before verifying.

## What it measures

Every problem is classified into one of four buckets:

| Class | Meaning | Severity |
|---|---|---|
| **CORRECT** | Result produced and independently verified | — |
| **WRONG** | Result produced, verification failed | **critical — the number that matters** |
| **REFUSED** | No result; declined or returned unevaluated | acceptable, safe failure |
| **UNVERIFIABLE** | Result produced but not checkable at ≥3 sample points | investigate; may hide a WRONG |

**A refusal is a safe failure. A confident wrong answer shown to a student is the worst possible
outcome.** Any change turning REFUSED into WRONG is a regression even if total coverage rises —
`--compare` enforces this and exits non-zero.

## How verification works

Central differences via math.js:

```
  (F(x+h) − F(x−h)) / 2h  ≈  f(x)     h = 1e-5, tolerance 1e-3·max(1,|f|)
```

**The CAS never verifies its own output.** `verify-calculus.js:198` documents why: nerdamer's
`diff()` is wrong on √(quadratic) forms, so using it would *reject correct answers*. The verifier
and the verified must not share an implementation.

Sample points use irrational-looking offsets (`0.21, 0.43, 0.67…`) to avoid accidental symmetry,
removable singularities, and exact zeros that could make a wrong answer look right. Point sets are
chosen per problem so they lie inside the domain of both `F` and `f`.

## Baseline — 2026-07-25

```
  INTEGRATION CORPUS
    correct                   28/40    70.0%
    SILENTLY WRONG             6/40    15.0%
    refused (safe)             5/40    12.5%
    unverifiable               1/40     2.5%

  KERNEL PROBES
    canonical simplify         6/8     75.0%
    inverse-trig compose       0/4      0.0%
    branch/domain arith        3/3    100.0%
    assumptions system       ABSENT
    symbolic dsolve          ABSENT
    symbolic summation       ABSENT
```

## Snapshots

Each run writes `snapshots/<ISO-timestamp>.json` with counts, kernel probes, git revision, and the
full failure list. **Keep these forever** — they are the record of which decisions actually moved
the number.

## Extending

| To add | Do this |
|---|---|
| Integration problems | Append `[integrand, samplePoints, topic]` to `INTEGRATION_CORPUS` |
| Kernel probes | Append to `CANONICAL`, `INVERSE_TRIG`, or `BRANCH` |
| The Rubi corpus (Phase 0) | Import 72k problems, filter to the syllabus subset, feed through `runIntegration` |
| ODE corpus (Phase 6) | New runner; verify by **substitution into the original equation**, residual ≈ 0 |
| Complex corpus (Phase 7) | New runner; verify residues two ways — Laurent `c₋₁` and numeric contour ÷ 2πi |

Once the kernel exists, point `runIntegration` at it instead of nerdamer and set `fallThrough` to
the measured fraction of calls still reaching nerdamer. That metric tracks strangler-fig progress
toward 0%.

## Rules

1. Run before and after every change.
2. **Never delete a failing case to improve a number.** Move it to known-failures with a reason and
   a target phase.
3. Every bug found anywhere becomes a permanent case here, the same day.
4. REFUSED → WRONG is always a regression.
5. Snapshot at every phase gate and commit it.
