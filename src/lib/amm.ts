/**
 * Maniswap CPMM (Constant Product Market Maker) implementation.
 * Based on Manifold Markets' algorithm.
 *
 * Invariant: k = y^p * n^(1-p)
 * where y = YES pool reserves, n = NO pool reserves, p = probability parameter
 */

export function getCpmmProbability(
  poolYes: number,
  poolNo: number,
  p: number
): number {
  return (p * poolNo) / ((1 - p) * poolYes + p * poolNo);
}

export function calculateBuyShares(
  poolYes: number,
  poolNo: number,
  p: number,
  betAmount: number,
  outcome: "YES" | "NO"
): number {
  if (betAmount <= 0) return 0;

  const k = Math.pow(poolYes, p) * Math.pow(poolNo, 1 - p);

  if (outcome === "YES") {
    const newNo = poolNo + betAmount;
    const newYes = Math.pow(k / Math.pow(newNo, 1 - p), 1 / p);
    return poolYes + betAmount - newYes;
  } else {
    const newYes = poolYes + betAmount;
    const newNo = Math.pow(k / Math.pow(newYes, p), 1 / (1 - p));
    return poolNo + betAmount - newNo;
  }
}

/**
 * Calculate mana received from selling shares.
 * Selling S YES = buying S NO for cost M, then redeeming S pairs for S mana.
 * Mana received = S - M.
 * We use binary search to find M such that buying the opposite outcome gives exactly S shares.
 */
export function calculateSellPayout(
  poolYes: number,
  poolNo: number,
  p: number,
  sharesToSell: number,
  outcome: "YES" | "NO"
): number {
  if (sharesToSell <= 0) return 0;

  const oppositeOutcome = outcome === "YES" ? "NO" : "YES";

  // Binary search for M: cost to buy sharesToSell of the opposite outcome
  let lo = 0;
  let hi = sharesToSell * 10; // Upper bound (cost can't exceed this realistically)

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const shares = calculateBuyShares(poolYes, poolNo, p, mid, oppositeOutcome);

    if (Math.abs(shares - sharesToSell) < 1e-8) {
      return sharesToSell - mid;
    }

    if (shares < sharesToSell) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const costM = (lo + hi) / 2;
  return sharesToSell - costM;
}

/**
 * Get the new pool state after a buy trade.
 */
export function getPoolAfterBuy(
  poolYes: number,
  poolNo: number,
  p: number,
  betAmount: number,
  outcome: "YES" | "NO"
): { newPoolYes: number; newPoolNo: number } {
  const k = Math.pow(poolYes, p) * Math.pow(poolNo, 1 - p);

  if (outcome === "YES") {
    const newNo = poolNo + betAmount;
    const newYes = Math.pow(k / Math.pow(newNo, 1 - p), 1 / p);
    return { newPoolYes: newYes, newPoolNo: newNo };
  } else {
    const newYes = poolYes + betAmount;
    const newNo = Math.pow(k / Math.pow(newYes, p), 1 / (1 - p));
    return { newPoolYes: newYes, newPoolNo: newNo };
  }
}

/**
 * Get the new probability after a buy trade.
 */
export function getProbabilityAfterBuy(
  poolYes: number,
  poolNo: number,
  p: number,
  betAmount: number,
  outcome: "YES" | "NO"
): number {
  const { newPoolYes, newPoolNo } = getPoolAfterBuy(
    poolYes,
    poolNo,
    p,
    betAmount,
    outcome
  );
  return getCpmmProbability(newPoolYes, newPoolNo, p);
}

/**
 * Get the new probability after a sell trade.
 * Selling YES is equivalent to buying NO (and vice versa) in terms of pool movement.
 */
export function getProbabilityAfterSell(
  poolYes: number,
  poolNo: number,
  p: number,
  sharesToSell: number,
  outcome: "YES" | "NO"
): number {
  const oppositeOutcome = outcome === "YES" ? "NO" : "YES";

  // Find the cost M via binary search (same as in calculateSellPayout)
  let lo = 0;
  let hi = sharesToSell * 10;

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const shares = calculateBuyShares(
      poolYes,
      poolNo,
      p,
      mid,
      oppositeOutcome
    );

    if (Math.abs(shares - sharesToSell) < 1e-8) break;

    if (shares < sharesToSell) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const costM = (lo + hi) / 2;
  // Pool updates as if someone bought the opposite outcome for costM
  const { newPoolYes, newPoolNo } = getPoolAfterBuy(
    poolYes,
    poolNo,
    p,
    costM,
    oppositeOutcome
  );
  return getCpmmProbability(newPoolYes, newPoolNo, p);
}
