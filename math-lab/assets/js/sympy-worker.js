/* SymPy worker — hosts a real, general-purpose CAS (SymPy, via Pyodide/WebAssembly) off the
   main thread, as a strangler-fig fallback for what assets/js/kernel/ and nerdamer cannot yet
   solve (see docs/kernel/04_BUILD_PHASES.md Phase 3's still-open ℚ(α)/Rothstein-Trager gap —
   this is the "bring in a library instead of hand-deriving the rest of Phase 3" path).

   Deliberately a SEPARATE worker from cas-worker.js, not an added OP there: Pyodide is a
   multi-megabyte WASM runtime with its own async boot sequence (~2s core + ~2s per package),
   wildly heavier than nerdamer/the kernel bundle. Coupling it to the always-loaded CAS worker
   would tax every page that uses CAS.* for techniques that never need SymPy. This worker is
   spawned lazily, on first actual use, by sympy-client.js — most page loads never touch it.

   Same message protocol as cas-worker.js (id-based request/response) so sympy-client.js can
   mirror cas-client.js's timeout/kill-switch discipline, but boot is handled specially: the
   first message pays the multi-second Pyodide+package load cost, everything after is fast. */
"use strict";

const PYODIDE_VERSION = "0.26.4";
const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v" + PYODIDE_VERSION + "/full/";

let pyodideReady = null; // Promise<pyodide instance>, memoized so concurrent requests share one boot.

function bootPyodide() {
  if (pyodideReady) return pyodideReady;
  pyodideReady = (async () => {
    importScripts(PYODIDE_CDN + "pyodide.js");
    const pyodide = await self.loadPyodide({ indexURL: PYODIDE_CDN });
    await pyodide.loadPackage("sympy");
    await pyodide.runPythonAsync(`
import sympy as sp
import json
import re

def _integrate(expr_str, var_name):
    v = sp.symbols(var_name)
    # A bare "e" in the input means Euler's number on every other page of this site (nerdamer,
    # math.js, the math keypad's own "e" button) — but sp.sympify's default parser treats an
    # undeclared lowercase "e" as an ordinary free symbol, not sp.E. Left unfixed, "x*e^x" turns
    # into a nonsense two-variable Piecewise instead of x*exp(x). Force "e" to mean Euler's number.
    expr = sp.sympify(expr_str, locals={"e": sp.E})
    result = sp.integrate(expr, v)
    if isinstance(result, sp.Integral):
        raise ValueError("SymPy could not find a closed form for this integral.")
    return str(sp.simplify(result))

def _limit(expr_str, var_name, point_str):
    v = sp.symbols(var_name)
    expr = sp.sympify(expr_str, locals={"e": sp.E})
    if point_str == "Infinity":
        point = sp.oo
    elif point_str == "-Infinity":
        point = -sp.oo
    else:
        point = sp.sympify(point_str, locals={"e": sp.E})
    result = sp.limit(expr, v, point)
    # zoo (complex/undirected infinity), nan, or an AccumBounds (an oscillating limit with no
    # single value) all mean "no single limit value" — a wrong-looking but technically-not-an-
    # exception result if left unchecked, so these are raised as failures instead.
    if result == sp.zoo or result == sp.nan or result.has(sp.AccumBounds):
        raise ValueError("SymPy could not determine a single limit value here (the limit may not exist).")
    return str(result)

def _format_dsolve(sol):
    # dsolve can return a single Eq or a list of them (e.g. several algebraic branches) — the
    # caller only ever wants ONE answer, and an explicit y(x)=... form specifically, since that
    # is the only shape ode-symbolic.js's own numeric verifier (diff of y(x) vs rhs) can check.
    # An implicit/relational answer is tagged so the JS side refuses it honestly instead of
    # trying to verify something it cannot evaluate as a function of x.
    if isinstance(sol, (list, tuple)):
        if not sol:
            raise ValueError("SymPy returned no solution.")
        sol = sol[0]
    if hasattr(sol, "lhs") and str(sol.lhs) == "y(x)":
        return "EXPLICIT:" + str(sp.simplify(sol.rhs))
    return "IMPLICIT:" + str(sol)

def _prepare_ode_text(s):
    # y'' -> Derivative(y(x), x, 2) must run BEFORE y' -> Derivative(y(x), x), since "y''"
    # contains "y'" as a substring — reversing the order would corrupt every second
    # derivative. Bare "y" (Cauchy-Euler-style equations still have a plain y term) is only
    # turned into y(x) where it isn't already part of y' / y'' / an identifier / a call.
    s = re.sub(r"y''", "Derivative(y(x), x, 2)", s)
    s = re.sub(r"y'", "Derivative(y(x), x)", s)
    s = re.sub(r"(?<![A-Za-z0-9_])y(?![A-Za-z0-9_'(])", "y(x)", s)
    return s

def _prepare_ode_text_general(s):
    # Handles y, y', y'', y''', ... in one pass: the regex's '+' is greedy, so "y''''" matches
    # as ONE occurrence with a 4-character prime group, not four separate "y'" matches — this
    # sidesteps the substring-ordering trap _prepare_ode_text's two-step version has to work
    # around (y'' contains y' as a substring), for any order at once.
    def repl_derivative(m):
        order = len(m.group(1))
        return f"Derivative(y(x), x, {order})"
    s = re.sub(r"y('+)", repl_derivative, s)
    s = re.sub(r"(?<![A-Za-z0-9_])y(?![A-Za-z0-9_'(])", "y(x)", s)
    return s

_HINT_LABELS = {
    "separable": "Separable equation",
    "1st_exact": "Exact equation",
    "1st_linear": "First-order linear",
    "Bernoulli": "Bernoulli equation",
    "1st_homogeneous_coeff_best": "Homogeneous coefficients",
    "1st_homogeneous_coeff_subs_indep_div_dep": "Homogeneous coefficients",
    "1st_homogeneous_coeff_subs_dep_div_indep": "Homogeneous coefficients",
    "1st_rational_riccati": "Riccati equation",
    "nth_linear_constant_coeff_homogeneous": "Constant-coefficient linear (homogeneous)",
    "nth_linear_constant_coeff_undetermined_coefficients": "Constant-coefficient linear (undetermined coefficients)",
    "nth_linear_constant_coeff_variation_of_parameters": "Constant-coefficient linear (variation of parameters)",
    "nth_linear_euler_eq_homogeneous": "Euler-Cauchy equation",
    "nth_algebraic": "Algebraic equation",
    "nth_order_reducible": "Reducible to lower order",
    "2nd_power_series_ordinary": "Power series solution (ordinary point)",
    "2nd_power_series_regular": "Power series solution (regular singular point)",
    "2nd_linear_airy": "Airy equation",
    "2nd_linear_bessel": "Bessel equation",
    "2nd_hypergeometric": "Hypergeometric equation",
}

def _classification_label(eq, yfunc):
    try:
        hints = sp.classify_ode(eq, yfunc)
    except Exception:
        return "General ODE"
    if not hints:
        return "General ODE"
    best = hints[0]
    return _HINT_LABELS.get(best, best.replace("_", " "))

def _dsolve_general(equation_text, order, ics_list):
    x = sp.symbols('x')
    yf = sp.Function('y')
    parts = equation_text.split("=")
    lhs_raw, rhs_raw = parts[0], (parts[1] if len(parts) > 1 else "0")
    locals_map = {"e": sp.E, "I": sp.I, "x": x, "y": yf, "Derivative": sp.Derivative,
                  "Heaviside": sp.Heaviside, "DiracDelta": sp.DiracDelta}
    try:
        lhs = sp.sympify(_prepare_ode_text_general(lhs_raw), locals=locals_map)
        rhs = sp.sympify(_prepare_ode_text_general(rhs_raw), locals=locals_map)
    except Exception as ex:
        raise ValueError("Couldn't parse this equation: " + str(ex))
    eq = sp.Eq(lhs, rhs)

    ics = None
    if ics_list:
        x0 = sp.sympify(ics_list[0])
        ics = {}
        for k, val_str in enumerate(ics_list[1:]):
            val = sp.sympify(val_str)
            if k == 0:
                ics[yf(x0)] = val
            else:
                ics[yf(x).diff(x, k).subs(x, x0)] = val

    try:
        sol = sp.dsolve(eq, yf(x), ics=ics)
    except NotImplementedError as ex:
        raise ValueError("No closed-form method matched this equation: " + str(ex))
    except Exception as ex:
        raise ValueError("SymPy could not solve this ODE: " + str(ex))

    label = _classification_label(eq, yf(x))
    return json.dumps({"solution": _format_dsolve(sol), "classification": label})

def _format_dsolve_system(sol, xs):
    # dsolve on a system returns a list of Eq(xi(t), expr), one per state variable, in whatever
    # order SymPy chose internally — never assume it matches the input order. Match each
    # equation back to its xi by lhs identity; refuse (as with the single-equation solver) if any
    # component came back in a form that isn't a plain xi(t) = <explicit expression>, since that's
    # the only shape the JS-side numeric verifier can substitute into.
    if not isinstance(sol, (list, tuple)):
        sol = [sol]
    by_func = {}
    for eq in sol:
        if not hasattr(eq, "lhs"):
            raise ValueError("SymPy returned a non-equation result for this system.")
        for i, xi in enumerate(xs):
            if eq.lhs == xi:
                by_func[i] = eq.rhs
    if len(by_func) != len(xs):
        raise ValueError("SymPy's system solution didn't come back as one explicit equation per state variable.")
    return [str(sp.simplify(by_func[i])) for i in range(len(xs))]

def _dsolve_system(matrix_rows, g_list, ics_list):
    t = sp.symbols('t')
    n = len(matrix_rows)
    funcs = [sp.Function('x' + str(i + 1)) for i in range(n)]
    xs = [f(t) for f in funcs]
    locals_map = {"e": sp.E, "I": sp.I, "t": t, "Heaviside": sp.Heaviside, "DiracDelta": sp.DiracDelta}

    try:
        A = sp.Matrix([[sp.sympify(str(v)) for v in row] for row in matrix_rows])
        g = [sp.sympify(gi, locals=locals_map) for gi in g_list] if g_list else [sp.Integer(0)] * n
    except Exception as ex:
        raise ValueError("Couldn't parse the matrix or forcing term: " + str(ex))

    eqs = []
    for i in range(n):
        rhs = sum(A[i, j] * xs[j] for j in range(n)) + g[i]
        eqs.append(sp.Eq(xs[i].diff(t), rhs))

    ics = None
    if ics_list:
        ics = {}
        for i, val_str in enumerate(ics_list):
            ics[xs[i].subs(t, 0)] = sp.sympify(val_str)

    try:
        sol = sp.dsolve(eqs, xs, ics=ics)
    except NotImplementedError as ex:
        raise ValueError("No closed-form method matched this system: " + str(ex))
    except Exception as ex:
        raise ValueError("SymPy could not solve this system: " + str(ex))

    return json.dumps({"components": _format_dsolve_system(sol, xs)})

def _series_solution(equation_text, point_str, order):
    # Series Solutions page — homogeneous linear 2nd-order ODEs with variable coefficients,
    # around an ordinary or regular singular point. SymPy's own '2nd_power_series_regular'
    # hint is NOT trustworthy on its own: verified directly against Bessel's equation of
    # order 0 (a repeated indicial root) and order 1 (roots differing by the integer 2) that
    # it silently returns only ONE of the two independent solutions where the second
    # genuinely needs a logarithmic term — an incomplete general solution with no error
    # raised. So the indicial roots are computed and checked HERE first, and the hint is
    # only ever called in the one case confirmed safe: real, distinct roots differing by a
    # non-integer. Every other case (repeated root, integer-differing roots) refuses rather
    # than risk showing an incomplete answer.
    x = sp.symbols('x')
    yf = sp.Function('y')
    y = yf(x)
    point = sp.sympify(point_str)

    parts = equation_text.split("=")
    if len(parts) > 1 and sp.sympify(_prepare_ode_text(parts[1]), locals={"e": sp.E, "x": x, "y": yf, "Derivative": sp.Derivative}) != 0:
        raise ValueError("This page solves homogeneous equations only (right-hand side must be 0).")
    lhs_expr = sp.sympify(_prepare_ode_text(parts[0]), locals={"e": sp.E, "x": x, "y": yf, "Derivative": sp.Derivative})

    lhs = sp.expand(lhs_expr)
    p = lhs.coeff(y.diff(x, 2))
    q = lhs.coeff(y.diff(x))
    r = lhs.coeff(y)
    if sp.expand(lhs - (p * y.diff(x, 2) + q * y.diff(x) + r * y)) != 0:
        raise ValueError("Couldn't read this as p(x)y'' + q(x)y' + r(x)y = 0.")
    if p == 0:
        raise ValueError("The y'' coefficient vanishes at every x — not a genuine second-order equation.")

    qp = sp.together(q / p)
    rp = sp.together(r / p)

    def finite_at(expr):
        try:
            v = sp.limit(expr, x, point)
            return bool(v.is_finite) and not v.has(sp.zoo, sp.nan)
        except Exception:
            return False

    if finite_at(qp) and finite_at(rp):
        sol = sp.dsolve(sp.Eq(lhs_expr, 0), y, hint="2nd_power_series_ordinary", n=order, x0=point)
        kind = "ordinary"
    else:
        p0 = sp.limit((x - point) * qp, x, point)
        q0 = sp.limit((x - point) ** 2 * rp, x, point)
        if not (p0.is_finite and q0.is_finite):
            raise ValueError("This is neither an ordinary point nor a regular singular point of the equation.")
        rsym = sp.symbols("r")
        roots = sp.solve(rsym * (rsym - 1) + p0 * rsym + q0, rsym)
        distinct_non_integer = (
            len(roots) == 2 and not sp.simplify(roots[0] - roots[1]).is_integer
        )
        if distinct_non_integer:
            sol = sp.dsolve(sp.Eq(lhs_expr, 0), y, hint="2nd_power_series_regular", n=order, x0=point)
            series = sol.rhs.removeO()
            kind = "regular-singular"
        else:
            # Repeated root, or roots differing by an integer: SymPy's own hint still returns
            # a VALID first solution y1 in these cases (confirmed against Bessel orders 0 and
            # 1) -- it just silently omits the second, independent solution, which may need a
            # logarithmic term. Reduction of order, applied to that same y1, produces the
            # correct second solution directly; whether a log term appears (and with what
            # coefficient) falls out of the integral automatically -- one technique for both
            # cases, no separate branch needed.
            try:
                sol1 = sp.dsolve(sp.Eq(lhs_expr, 0), y, hint="2nd_power_series_regular", n=order, x0=point)
                y1 = sol1.rhs.removeO().subs(sp.Symbol('C1'), 1)
                weight = sp.exp(-sp.integrate(qp, x))
                integrand = sp.series(weight / y1**2, x, point, order).removeO()
                antideriv = sp.integrate(integrand, x)
                y2 = sp.expand(y1 * antideriv)
            except Exception as ex:
                raise ValueError("Could not compute a second, independent series solution here: " + str(ex))
            C1, C2 = sp.symbols('C1 C2')
            series = C1 * y1 + C2 * y2
            kind = "regular-singular-log"

    if kind == "ordinary":
        series = sol.rhs.removeO()
    yp = sp.diff(series, x)
    ypp = sp.diff(series, x, 2)
    return json.dumps({
        "kind": kind,
        "y": str(series), "yp": str(yp), "ypp": str(ypp),
        "p": str(p), "q": str(q), "r": str(r),
        "point": str(point),
    })

# positive=True here MUST match every function below's own local x, s = sp.symbols('x s',
# positive=True) -- sympy treats differently-assumed symbols with the same name as genuinely
# different objects, so a mismatch here silently makes sp.laplace_transform/inverse_laplace_
# transform treat the parsed expression as not containing the transform variable at all
# (confirmed: this exact mismatch previously made L{exp(-2*x)} return exp(-2*x)/s instead of
# 1/(s+2) -- a constant-with-respect-to-x reading, not a transform at all).
_LAPLACE_LOCALS_X = {"e": sp.E, "x": sp.symbols('x', positive=True), "Heaviside": sp.Heaviside, "DiracDelta": sp.DiracDelta}
_LAPLACE_LOCALS_S = {"e": sp.E, "s": sp.symbols('s', positive=True), "Heaviside": sp.Heaviside, "DiracDelta": sp.DiracDelta}

def _laplace_transform_of(expr_text):
    x, s = sp.symbols('x s', positive=True)
    try:
        expr = sp.sympify(expr_text, locals=_LAPLACE_LOCALS_X)
    except Exception as ex:
        raise ValueError("Couldn't parse this expression: " + str(ex))
    try:
        F = sp.laplace_transform(expr, x, s, noconds=True)
    except NotImplementedError as ex:
        raise ValueError("SymPy doesn't know a closed-form transform for this: " + str(ex))
    return str(sp.simplify(F))

def _inverse_laplace_transform_of(expr_text):
    x, s = sp.symbols('x s', positive=True)
    try:
        expr = sp.sympify(expr_text, locals=_LAPLACE_LOCALS_S)
    except Exception as ex:
        raise ValueError("Couldn't parse this expression: " + str(ex))
    try:
        f = sp.inverse_laplace_transform(expr, s, x)
    except NotImplementedError as ex:
        raise ValueError("SymPy doesn't know a closed-form inverse transform for this: " + str(ex))
    return str(sp.simplify(f))

def _laplace_solve_ivp(coeffs, rhs_text, ics_list):
    # coeffs: [a_n, ..., a_0] (highest order first, as typed left-to-right). ics_list:
    # [y(0), y'(0), ..., y^(n-1)(0)] as strings. Builds the s-domain equation via the
    # transform-of-derivative property L{y^(k)} = s^k*Y - sum_{j=0}^{k-1} s^(k-1-j)*y^(j)(0) —
    # the literal definition, not a per-case branch — solves algebraically for Y(s), then
    # inverse-transforms. Returns all three stages for the worked-walkthrough display.
    x, s = sp.symbols('x s', positive=True)
    Y = sp.symbols('Y')
    n = len(coeffs) - 1

    def laplace_deriv(order, y0_list):
        expr = s**order * Y
        for k in range(order):
            expr -= s**(order - 1 - k) * y0_list[k]
        return expr

    try:
        y0_list = [sp.sympify(v) for v in ics_list]
        rhs = sp.sympify(rhs_text, locals=_LAPLACE_LOCALS_X)
        coeff_syms = [sp.sympify(str(c)) for c in coeffs]
    except Exception as ex:
        raise ValueError("Couldn't parse the equation: " + str(ex))

    lhs_s = sum(coeff_syms[n - k] * laplace_deriv(k, y0_list) for k in range(n + 1))
    try:
        rhs_s = sp.laplace_transform(rhs, x, s, noconds=True)
    except NotImplementedError as ex:
        raise ValueError("SymPy doesn't know a closed-form transform for the right-hand side: " + str(ex))
    eq = sp.Eq(lhs_s, rhs_s)

    sols = sp.solve(eq, Y)
    if not sols:
        raise ValueError("Could not solve the transformed equation for Y(s).")
    Y_sol = sp.simplify(sols[0])
    try:
        y_x = sp.simplify(sp.inverse_laplace_transform(Y_sol, s, x))
    except NotImplementedError as ex:
        raise ValueError("SymPy doesn't know a closed-form inverse transform for Y(s): " + str(ex))

    return json.dumps({"s_domain_eq": str(eq), "Y_s": str(Y_sol), "y_x": str(y_x)})

def _laplace_convolution(f_text, g_text):
    x, s = sp.symbols('x s', positive=True)
    try:
        f = sp.sympify(f_text, locals=_LAPLACE_LOCALS_X)
        g = sp.sympify(g_text, locals=_LAPLACE_LOCALS_X)
    except Exception as ex:
        raise ValueError("Couldn't parse f(x) or g(x): " + str(ex))
    F = sp.laplace_transform(f, x, s, noconds=True)
    G = sp.laplace_transform(g, x, s, noconds=True)
    product = sp.simplify(F * G)
    try:
        conv_result = sp.simplify(sp.inverse_laplace_transform(product, s, x))
    except NotImplementedError as ex:
        raise ValueError("SymPy doesn't know a closed-form inverse transform for F(s)*G(s): " + str(ex))
    return json.dumps({"F": str(F), "G": str(G), "product": str(product), "conv_result": str(conv_result)})

def _singularities_with_residues(expr_str, var_name):
    # Shared module for Complex Analysis Phase 3 (contour integration) AND, later, the ODE
    # Engine's Laplace-transform inversion — both are the residue theorem underneath, so this
    # is the one place that finds poles and their residues; complex-residues.js is the only
    # caller today, but it is written to be reused, not duplicated, the second consumer arrives.
    v = sp.symbols(var_name)
    expr = sp.sympify(expr_str, locals={"e": sp.E, "I": sp.I, var_name: v})
    try:
        sings = sp.singularities(expr, v)
    except Exception as ex:
        raise ValueError("SymPy could not find the singularities of this function: " + str(ex))
    out = []
    for s in sings:
        # A parametric/non-isolated singularity (no numeric location) can't be placed against a
        # contour geometrically — skip it rather than guess. Same for one where residue() itself
        # fails (an essential singularity or branch point has no ordinary residue).
        try:
            loc = complex(sp.N(s))
        except Exception:
            continue
        try:
            res_exact = sp.simplify(sp.residue(expr, v, s))
            res_num = complex(sp.N(res_exact))
        except Exception:
            continue
        out.append({
            "locationExact": str(sp.simplify(s)),
            "location": {"re": loc.real, "im": loc.imag},
            "residueExact": str(res_exact),
            "residue": {"re": res_num.real, "im": res_num.imag},
        })
    return json.dumps(out)

def _laurent_series(expr_str, var_name, point_str, order):
    v = sp.symbols(var_name)
    expr = sp.sympify(expr_str, locals={"e": sp.E, "I": sp.I, var_name: v})
    point = sp.sympify(point_str, locals={"e": sp.E, "I": sp.I})
    try:
        ser = sp.series(expr, v, point, order)
    except Exception as ex:
        raise ValueError("SymPy could not expand a series here: " + str(ex))
    return str(ser)

def _classify_singularity(expr_str, var_name, point_str, max_order=20):
    # Classify the isolated singularity of f at point, by the textbook limit definitions
    # (NOT by parsing a series — sp.series leaves essential singularities like exp(1/z) unexpanded
    # and raises PoleError on sin(1/z), so a principal-part parse is unreliable). The definitions:
    #   removable : lim_{z->p} f(z) exists and is finite
    #   pole of m  : lim_{z->p} (z-p)^m f(z) is finite & nonzero, and is infinite for smaller powers
    #   essential  : neither — the limit is absent (AccumBounds / nan) or no finite order is found
    # analytic (a regular point, not a singularity at all) is reported separately when the limit is
    # finite AND f is already defined and equal there.
    v = sp.symbols(var_name)
    expr = sp.sympify(expr_str, locals={"e": sp.E, "I": sp.I, var_name: v})
    pt = sp.sympify(point_str, locals={"e": sp.E, "I": sp.I})
    w = v - pt
    def _is_inf(L):
        if L in (sp.oo, sp.zoo) or L == -sp.oo: return True
        return bool(getattr(L, "is_infinite", False))
    def _is_accum(L):
        return isinstance(L, sp.AccumBounds)
    def _finite_single(L):
        if L is None or _is_accum(L) or _is_inf(L) or L == sp.nan: return False
        return bool(getattr(L, "is_finite", False))
    try:
        direct = expr.subs(v, pt)
        direct_finite = bool(getattr(direct, "is_finite", False))
    except Exception:
        direct_finite = False
    out = {}
    try:
        L = sp.limit(expr, v, pt)
    except Exception as ex:
        raise ValueError("SymPy could not take the limit at this point: " + str(ex))
    if _finite_single(L):
        if direct_finite and sp.simplify(direct - L) == 0:
            out["kind"] = "analytic"
        else:
            out["kind"] = "removable"
            out["value"] = str(L)
        return json.dumps(out)
    if _is_inf(L):
        for m in range(1, max_order + 1):
            Lm = sp.limit(w**m * expr, v, pt)
            if _finite_single(Lm) and Lm != 0:
                out["kind"] = "pole"
                out["order"] = m
                # The residue is the (z-p)^-1 coefficient: for a simple pole it equals the leading
                # coeff Lm; for higher poles fall back to sp.residue, which handles ordinary poles.
                if m == 1:
                    out["residue"] = str(Lm)
                else:
                    try:
                        out["residue"] = str(sp.simplify(sp.residue(expr, v, pt)))
                    except Exception:
                        pass
                return json.dumps(out)
        out["kind"] = "essential"
        return json.dumps(out)
    out["kind"] = "essential"
    return json.dumps(out)

def _real_integral_by_residues(expr_str, var_name, mode):
    # Real integral of a (non-oscillatory) rational R(x) via closing the contour with a large
    # semicircle in the upper half-plane and summing the residues there:
    #   whole : int_{-oo}^{oo} R(x) dx = 2*pi*i * sum_{Im(pole)>0} Res(R, pole)
    #   half  : int_0^{oo} R(x) dx    = pi*i   * sum_{Im(pole)>0} Res(R, pole)   (R even)
    # Restrictions that make the simple closure valid (anything else is refused rather than
    # guessed at, and the JS-side numeric verify gate is the final backstop anyway):
    #   - no real-axis poles (an indented contour would be needed — out of scope here)
    #   - deg(denominator) >= deg(numerator) + 2, so the semicircle's arc contributes zero
    #   - for the half-line mode, R must be even (R(-x) = R(x)); otherwise halving is wrong
    v = sp.symbols(var_name)
    expr = sp.sympify(expr_str, locals={"e": sp.E, "I": sp.I, var_name: v})
    if mode not in ("whole", "half"):
        raise ValueError("mode must be 'whole' or 'half'")
    out = {"mode": mode, "poles": []}
    if mode == "half":
        if sp.simplify(expr.subs(v, -v) - expr) != 0:
            raise ValueError("The 0-to-infinity mode requires an even integrand (R(-x) = R(x)); this one is not even, so halving the full-line integral would be wrong.")
    try:
        sings = sp.singularities(expr, v)
    except Exception as ex:
        raise ValueError("SymPy could not find the singularities of this function: " + str(ex))
    upper = []
    for s in sings:
        try:
            loc = complex(sp.N(s))
        except Exception:
            continue
        if abs(loc.imag) < 1e-12:
            raise ValueError("R(z) has a pole on the real axis at " + str(s) + " — the simple semicircle closure does not apply here (an indented contour would be needed).")
        if loc.imag > 0:
            try:
                res = sp.simplify(sp.residue(expr, v, s))
            except Exception:
                continue
            upper.append((s, res, loc))
    try:
        num, den = sp.fraction(sp.together(expr))
        if sp.degree(den, v) < sp.degree(num, v) + 2:
            raise ValueError("The integrand does not decay fast enough (need deg(denominator) >= deg(numerator) + 2) for the semicircle's arc to vanish.")
    except ValueError:
        raise
    except Exception:
        pass  # non-rational or undecidable degree — let the independent numeric check decide
    if not upper:
        val = sp.Integer(0)
    else:
        acc = sp.Integer(0)
        for p in upper:
            acc = acc + p[1]
        val = 2 * sp.pi * sp.I * acc
        if mode == "half":
            val = val / 2
    val_num = complex(sp.N(val))
    out["value_exact"] = str(sp.simplify(val))
    out["value"] = {"re": val_num.real, "im": val_num.imag}
    out["poles"] = [{"location": str(sp.simplify(p[0])), "residue": str(p[1]),
                     "location_numeric": {"re": p[2].real, "im": p[2].imag}} for p in upper]
    return json.dumps(out)
`);
    return pyodide;
  })();
  return pyodideReady;
}

// Whitelist, same discipline as cas-worker.js's OPS: only what pages actually need, dispatched
// through a null-prototype table so nothing on Python's/JS's builtin surface is reachable by name.
// `integrate` (integral-calculator.js + the technique pages) and `limit` (lhopital.js, only for
// genuinely-indeterminate forms L'Hôpital itself couldn't settle within LH_MAX_PASSES) — add
// further ops here when a page actually needs them, not speculatively ahead of a real consumer,
// same discipline as the rest of this codebase's kernel<->production wiring.
const OPS = Object.assign(Object.create(null), {
  integrate: async (pyodide, args) => {
    const [exprStr, varName] = args;
    return pyodide.runPython(`_integrate(${JSON.stringify(exprStr)}, ${JSON.stringify(varName)})`);
  },
  limit: async (pyodide, args) => {
    const [exprStr, varName, pointStr] = args;
    return pyodide.runPython(`_limit(${JSON.stringify(exprStr)}, ${JSON.stringify(varName)}, ${JSON.stringify(pointStr)})`);
  },
  // General any-order solver — Phase 1 of the ODE engine redesign. ics_list is
  // [x0, y(x0), y'(x0), ...] as strings, or [] for the general solution with no IC applied.
  dsolveGeneral: async (pyodide, args) => {
    const [equationText, order, icsList] = args;
    const icsArg = icsList && icsList.length ? JSON.stringify(icsList.map(String)) : "[]";
    return pyodide.runPython(
      `_dsolve_general(${JSON.stringify(equationText)}, ${JSON.stringify(order)}, ${icsArg})`
    );
  },
  // Systems of first-order linear ODEs, x' = Ax + g(t) — Phase 2 of the ODE engine redesign.
  // matrixRows: number[][] (n x n). gList: string[] of length n (SymPy-syntax expressions in
  // t, or "0"). icsList: string[] of length n (x_i(0) values as strings), or [] for the
  // general solution with no IC applied.
  dsolveSystem: async (pyodide, args) => {
    const [matrixRows, gList, icsList] = args;
    return pyodide.runPython(
      `_dsolve_system(${JSON.stringify(matrixRows)}, ${JSON.stringify(gList)}, ${JSON.stringify(icsList)})`
    );
  },
  laplaceTransform: async (pyodide, args) => {
    const [exprText] = args;
    return pyodide.runPython(`_laplace_transform_of(${JSON.stringify(exprText)})`);
  },
  inverseLaplaceTransform: async (pyodide, args) => {
    const [exprText] = args;
    return pyodide.runPython(`_inverse_laplace_transform_of(${JSON.stringify(exprText)})`);
  },
  laplaceSolveIvp: async (pyodide, args) => {
    const [coeffs, rhsText, icsList] = args;
    return pyodide.runPython(
      `_laplace_solve_ivp(${JSON.stringify(coeffs.map(String))}, ${JSON.stringify(rhsText)}, ${JSON.stringify(icsList)})`
    );
  },
  laplaceConvolution: async (pyodide, args) => {
    const [fText, gText] = args;
    return pyodide.runPython(`_laplace_convolution(${JSON.stringify(fText)}, ${JSON.stringify(gText)})`);
  },
  seriesSolution: async (pyodide, args) => {
    const [equationText, point, order] = args;
    return pyodide.runPython(`_series_solution(${JSON.stringify(equationText)}, ${JSON.stringify(String(point))}, ${JSON.stringify(order)})`);
  },
  // Shared residue-theorem module (complex-residues.js) — Complex Analysis contour integration
  // today, ODE Laplace-transform inversion later.
  singularitiesWithResidues: async (pyodide, args) => {
    const [exprStr, varName] = args;
    return pyodide.runPython(`_singularities_with_residues(${JSON.stringify(exprStr)}, ${JSON.stringify(varName)})`);
  },
  laurentSeries: async (pyodide, args) => {
    const [exprStr, varName, pointStr, order] = args;
    return pyodide.runPython(
      `_laurent_series(${JSON.stringify(exprStr)}, ${JSON.stringify(varName)}, ${JSON.stringify(pointStr)}, ${JSON.stringify(order)})`
    );
  },
  // Singularity classification for the Laurent/singularity page — limit-based (not series-parse),
  // so essential singularities SymPy's series leaves unexpanded (exp(1/z)) or errors on (sin(1/z))
  // are still classified correctly. Returns JSON {kind: "analytic"|"removable"|"pole"|"essential",
  // order?, value?, residue?}. Reached only through ComplexResidues.classifySingularity.
  classifySingularity: async (pyodide, args) => {
    const [exprStr, varName, pointStr] = args;
    return pyodide.runPython(
      `_classify_singularity(${JSON.stringify(exprStr)}, ${JSON.stringify(varName)}, ${JSON.stringify(pointStr)})`
    );
  },
  // Real integrals by residues — rational R(x) over (-inf,inf) or (0,inf), closed with an upper
  // semicircle. Refuses real-axis poles, slow decay, and (for the half-line mode) non-even
  // integrands. The JS-side numeric verify gate (complex-residues.js) is the final backstop.
  realIntegralByResidues: async (pyodide, args) => {
    const [exprStr, varName, mode] = args;
    return pyodide.runPython(
      `_real_integral_by_residues(${JSON.stringify(exprStr)}, ${JSON.stringify(varName)}, ${JSON.stringify(mode)})`
    );
  },
});

self.onmessage = async function (e) {
  const msg = e.data || {};
  const id = msg.id;
  const op = OPS[msg.op];

  if (!op) {
    self.postMessage({ id, ok: false, error: "Unknown operation: " + msg.op });
    return;
  }

  try {
    const pyodide = await bootPyodide();
    const result = await op(pyodide, msg.args || []);
    self.postMessage({ id, ok: true, result: { resultText: result } });
  } catch (err) {
    // Pyodide surfaces Python exceptions as Error objects with the Python traceback in
    // .message; the last line is the actual exception, which is what a user should see.
    const raw = err && err.message ? err.message : String(err);
    const lastLine = raw.trim().split("\n").pop();
    self.postMessage({ id, ok: false, error: lastLine || raw });
  }
};

self.postMessage({ id: "__ready__", ok: true, result: { ready: true } });
