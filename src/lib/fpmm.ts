/**
 * Fixed Product Market Maker (FPMM) Algorithm
 *
 * Used for multi-outcome prediction markets.
 * Invariant: k = q₁ × q₂ × q₃ × ... × qₙ
 *
 * Reference: Gnosis Conditional Tokens Framework
 */

export interface FpmmPools {
  [outcome: string]: number;
}

export interface FpmmTradeResult {
  shares: number;
  newPools: FpmmPools;
  cost: number;
}

export interface FpmmSellResult {
  payout: number;
  newPools: FpmmPools;
}

/**
 * Calculate probabilities from pool reserves
 * Formula: p(i) = (1/qᵢ) / Σ(1/qⱼ)
 */
export function getFpmmProbabilities(pools: FpmmPools): Record<string, number> {
  const inverses: Record<string, number> = {};
  let sumInverses = 0;

  for (const [outcome, pool] of Object.entries(pools)) {
    if (pool <= 0) {
      throw new Error(`Pool for ${outcome} must be positive, got ${pool}`);
    }
    const inverse = 1 / pool;
    inverses[outcome] = inverse;
    sumInverses += inverse;
  }

  const probabilities: Record<string, number> = {};
  for (const [outcome, inverse] of Object.entries(inverses)) {
    probabilities[outcome] = inverse / sumInverses;
  }

  return probabilities;
}

/**
 * Calculate invariant k = q₁ × q₂ × ... × qₙ
 */
function calculateInvariant(pools: FpmmPools): number {
  let k = 1;
  for (const pool of Object.values(pools)) {
    if (pool <= 0) {
      throw new Error('All pools must be positive');
    }
    k *= pool;
  }
  return k;
}

/**
 * Calculate shares received when buying outcome
 *
 * Algorithm:
 * 1. Add amount/(N-1) to all pools except target
 * 2. Solve for new target pool: q'ᵢ = k / ∏(q'ⱼ) for j ≠ i
 * 3. Shares = qᵢ - q'ᵢ
 */
export function calculateBuySharesFpmm(
  pools: FpmmPools,
  amount: number,
  outcome: string
): FpmmTradeResult {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  if (!(outcome in pools)) {
    throw new Error(`Outcome ${outcome} not found in pools`);
  }

  const outcomes = Object.keys(pools);
  const n = outcomes.length;

  if (n < 2) {
    throw new Error('Must have at least 2 outcomes');
  }

  // Calculate current invariant
  const k = calculateInvariant(pools);

  // Create new pools
  const newPools: FpmmPools = { ...pools };

  // Add amount/(N-1) to all pools except target outcome
  const amountPerPool = amount / (n - 1);
  for (const o of outcomes) {
    if (o !== outcome) {
      newPools[o] = pools[o] + amountPerPool;
    }
  }

  // Calculate product of all non-target pools
  let productOthers = 1;
  for (const o of outcomes) {
    if (o !== outcome) {
      productOthers *= newPools[o];
    }
  }

  // Solve for new target pool: q'ᵢ = k / ∏(q'ⱼ)
  const newTargetPool = k / productOthers;
  newPools[outcome] = newTargetPool;

  // Shares received
  const shares = pools[outcome] - newTargetPool;

  if (shares <= 0) {
    throw new Error('Trade would result in non-positive shares');
  }

  return {
    shares,
    newPools,
    cost: amount,
  };
}

/**
 * Calculate payout when selling shares
 *
 * Uses binary search to find amount M such that buying M worth
 * of shares gives exactly sharesToSell shares.
 *
 * Payout = sharesToSell - M
 */
export function calculateSellPayoutFpmm(
  pools: FpmmPools,
  sharesToSell: number,
  outcome: string
): FpmmSellResult {
  if (sharesToSell <= 0) {
    throw new Error('Shares to sell must be positive');
  }

  if (!(outcome in pools)) {
    throw new Error(`Outcome ${outcome} not found in pools`);
  }

  // Binary search for the cost
  let low = 0;
  let high = sharesToSell; // Upper bound: payout can't exceed shares
  const epsilon = 0.0001; // Precision tolerance
  const maxIterations = 100;

  let iterations = 0;
  let bestCost = 0;
  let bestResult: FpmmTradeResult | null = null;

  while (high - low > epsilon && iterations < maxIterations) {
    const mid = (low + high) / 2;

    try {
      const result = calculateBuySharesFpmm(pools, mid, outcome);

      if (Math.abs(result.shares - sharesToSell) < epsilon) {
        // Found exact match
        bestCost = mid;
        bestResult = result;
        break;
      }

      if (result.shares < sharesToSell) {
        // Need more shares, increase cost
        low = mid;
      } else {
        // Got too many shares, decrease cost
        high = mid;
      }

      bestCost = mid;
      bestResult = result;
    } catch (e) {
      // If calculation fails, try lower amount
      high = mid;
    }

    iterations++;
  }

  if (!bestResult) {
    throw new Error('Failed to converge on sell price');
  }

  const payout = sharesToSell - bestCost;

  if (payout < 0) {
    throw new Error('Payout cannot be negative');
  }

  return {
    payout,
    newPools: bestResult.newPools,
  };
}

/**
 * Calculate initial pools for equal probability distribution
 */
export function createEqualProbabilityPools(
  outcomes: string[],
  totalLiquidity: number
): FpmmPools {
  if (outcomes.length < 2) {
    throw new Error('Must have at least 2 outcomes');
  }

  if (outcomes.length > 10) {
    throw new Error('Cannot have more than 10 outcomes');
  }

  if (totalLiquidity <= 0) {
    throw new Error('Total liquidity must be positive');
  }

  const liquidityPerOutcome = totalLiquidity / outcomes.length;
  const pools: FpmmPools = {};

  for (const outcome of outcomes) {
    pools[outcome] = liquidityPerOutcome;
  }

  return pools;
}

/**
 * Verify that buying one share of each outcome costs >= N leaves
 * (No arbitrage condition)
 */
export function verifyNoArbitrage(pools: FpmmPools): boolean {
  const n = Object.keys(pools).length;
  let totalCost = 0;

  // Calculate cost of buying 1 share of each outcome
  let currentPools = { ...pools };
  for (const outcome of Object.keys(pools)) {
    const result = calculateBuySharesFpmm(currentPools, 1, outcome);
    // Normalize to 1 share
    const costPerShare = result.cost / result.shares;
    totalCost += costPerShare;
    currentPools = result.newPools;
  }

  // Should cost at least N leaves (with small tolerance for rounding)
  return totalCost >= n - 0.01;
}

/**
 * Verify invariant is preserved after trade
 */
export function verifyInvariant(
  oldPools: FpmmPools,
  newPools: FpmmPools,
  tolerance: number = 0.01
): boolean {
  const oldK = calculateInvariant(oldPools);
  const newK = calculateInvariant(newPools);

  const percentDiff = Math.abs((newK - oldK) / oldK);
  return percentDiff < tolerance;
}
