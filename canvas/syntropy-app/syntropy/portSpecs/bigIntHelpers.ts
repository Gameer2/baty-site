/**
 * Number Theory's core (math-lab/assets/js/number-theory.js) is BigInt throughout — the engine's
 * own convention, since a plain JS number silently loses precision past 2^53 and this engine's
 * whole point (RSA moduli, large primes) routinely exceeds that. The node card's "number" input
 * kind runs every edit through `Number(rawValue)`, which would reintroduce exactly that precision
 * loss, so every number-theory port spec uses the "expression" kind instead (a plain text field —
 * SyntropyNodeCard never numeric-coerces it) and parses straight to BigInt here, bypassing
 * `Number()` entirely on the way in.
 *
 * Outputs are a different story: `PortOutputKind` only renders "number" (or "text"), so a BigInt
 * result gets narrowed back to a display Number via bigIntToDisplay. That's exact for anything
 * within Number.MAX_SAFE_INTEGER and an approximation beyond it — acceptable because the node
 * card is a live preview, not the source of truth; the exact value is always one portal click
 * away on the real lab page.
 */

export const parseBigInt = (value: unknown, label = "value"): bigint => {
  const s = String(value ?? "").trim();
  if (!/^-?\d+$/.test(s)) {
    throw new Error(`${label} must be a whole number.`);
  }
  return BigInt(s);
};

export const parseBigIntList = (value: unknown, label = "value"): bigint[] => {
  const s = String(value ?? "").trim();
  if (!s) {
    return [];
  }
  return s.split(",").map((part) => parseBigInt(part, label));
};

export const bigIntToDisplay = (value: bigint): number => Number(value);
