"use strict";
/* TEST-ONLY helper, shared by every test that independently verifies a kernel/production
   result via math.js's math.parse(). math.js has no "ln" function (only "log" for natural
   log), but the kernel canonicalizes natural log to "ln(...)" everywhere (kernel/printer.js).
   Translate before parsing so a correct result isn't misclassified as unparseable/unverifiable.
   Previously five separate call sites (tests/bench/baseline.js, tests/verify-calculus.js,
   tests/verify-integration-advanced.js, tests/bench/reachability.js, and calc-core.js's own
   tidy()) each carried their own copy of this one-line regex — this is the shared home for
   the test-side copies; calc-core.js's is a production concern (restoring the kernel-wide
   "ln" invariant after a nerdamer round-trip) and stays separate. */
module.exports = function lnToLog(s) {
  return s.replace(/\bln\(/g, "log(");
};
