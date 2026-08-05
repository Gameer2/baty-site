# 11 — Protecting the Kernel

Goal: the kernel is proprietary and must not end up in anyone else's hands.

---

## 1. The hard truth

**Anything that reaches a browser is recoverable.**

| Technique | Time to defeat | Verdict |
|---|---|---|
| Minification | minutes (any online beautifier) | Not protection |
| Name mangling / obfuscation | hours | Speed bump only |
| WASM compilation | hours (`wasm2c`, Ghidra, wasm-decompile) | Speed bump only |
| Anti-debugging tricks | hours; breaks real users meanwhile | Counterproductive |
| Licence key checks in client code | trivially patched out | Theatre |

If the kernel ships to the client, **you have published it.** The algorithms are recoverable, and —
more importantly — trade-secret status is legally forfeited, because a trade secret must actually be
secret to be one.

## 2. The only real protection: server-side

Client sends the expression; the server computes and returns the result plus steps. This is exactly
Wolfram Alpha's model — their kernel has never shipped to a user in thirty years.

### You are unusually well positioned

`cas-client.js:101` is **already** Promise-based with a timeout, dispatching `{id, op, args}`:

```js
CAS.call = function (op, args, opts) {
  ...
  return new Promise(function (resolve, reject) {
    ...
    w.postMessage({ id, op, args: args || [] });
  });
};
```

Swapping `postMessage` for `fetch()` is contained to this one file. **None of the other 139 modules
notice**, because the hard part — async all the way up through the UI — is already done.

This is the single luckiest fact about the current architecture.

### Trade-offs

| | Client-side | Server-side |
|---|---|---|
| Kernel secrecy | none | **real** |
| Trade-secret status | forfeited | maintained |
| Latency | ~0 | 50–300 ms |
| Offline | works | doesn't |
| Cost | free | per-request |
| Abuse surface | none | needs rate limiting |
| Update speed | ship a build | instant, server-side |

That last row is an underrated benefit: a kernel bug becomes a server deploy, not an app-store
release cycle.

## 3. The split

| Stays client-side | Moves server-side |
|---|---|
| Parsing and input validation | **All symbolic computation** |
| Plotting, rendering, animation | Integration, ODE solving, residues |
| Numeric evaluation of a *given* expression | Simplification and rewriting |
| LaTeX display (KaTeX) | Step generation |
| Domain colouring (per-pixel) | Assumptions reasoning |

Principle: **fast, cheap, and not the moat stays local. The mathematics goes to the server.**

Keeping plotting and numeric evaluation client-side also means the UI stays responsive between
symbolic calls, which preserves the feel of the current app.

## 4. Abuse and extraction

Server-side stops source copying but not behavioural extraction: an attacker can query the API
systematically and distil the input→output mapping.

| Defence | Note |
|---|---|
| Rate limiting per account and per IP | The baseline |
| Anomaly detection on query patterns | Systematic enumeration looks nothing like a student studying |
| Authentication required for symbolic endpoints | No anonymous bulk access |
| Result caching | Cuts cost and makes repeated probing cheap to absorb |
| Tiered quotas | Free tier bounded well below the volume useful for distillation |

Perfect prevention is not achievable; making extraction slower and more expensive than
reimplementation is.

## 5. Legal layers

| Instrument | Protects | Cost | Verdict |
|---|---|---|---|
| **Trade secret** | The algorithms, indefinitely | Free — but requires actual secrecy | ✅ **Your primary instrument.** Server-side is what makes it available |
| **Copyright** | Literal copying of your source | Automatic | ✅ Free backstop; does not stop reimplementation |
| **Terms of Service** | Contractual limits on API use | Low | ✅ Worth having; enables enforcement against scraping |
| Patents | Specific algorithmic methods | High, slow, **publishes the method** | ❌ Wrong tool — publication is the opposite of the goal |

**Trade secret + server-side + ToS** is the practical combination. Note also that most of the
mathematics you implement is centuries old and unpatentable; what is genuinely yours is the
*implementation*, the *rule curation*, and the *pedagogy layer*.

## 6. Third-party licence obligations

From `06_DATA_SOURCES.md`: nerdamer-prime (MIT), math.js (Apache 2.0), Rubi (MIT), SymPy (BSD),
FriCAS (BSD) all permit closed-source commercial derivatives. Obligations amount to retaining
copyright notices.

⚠️ **Outstanding debt:** `math.min.js`, `gsap.min.js`, and `three.min.js` reference `*.LICENSE.txt`
files that are absent from `assets/vendor/`. Harmless while private; **fix before shipping.**

⚠️ Avoid GPL sources entirely (Maxima). The server-side "SaaS gap" technically avoids GPL
obligations, but relying on it poisons any future desktop or offline app and is not worth the risk
when permissive alternatives cover everything you need.

## 7. Decide this before Phase 1 ships

**A kernel written on the assumption of local synchronous calls is painful to move behind a network
boundary later** — every call site has to change, error handling has to change, and batching has to
be retrofitted.

Deciding now costs nothing, because `cas-client.js` is already async. Design the kernel with:

- **Coarse-grained operations.** One request per user-level action (`integrate this`), never per
  internal rewrite step. Chatty kernels are unusable over a network.
- **Serialisable results.** Expression trees, steps, and diagnostics must round-trip through JSON.
- **Stateless requests**, or explicit session state — never hidden global state in the kernel.
- **Batched calls** where a page needs several results at once.

These are good design constraints regardless, which is why adopting them early is free.
