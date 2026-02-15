/**
 * Fixed Product Market Maker (FPMM) for Multi-Resolution markets
 * Invariant: k = q₁ × q₂ × q₃ × ... × qₙ
 * Used by Polymarket, Gnosis
 */

export interface FpmmPools {
  [outcome: string]: number;
}

export interface FpmmResult {
  shares: number;
  newPools: FpmmPools;
}

/**
 * Calculate probabilities from FPMM pools
 * Formula: p(i) = (1/qᵢ) / Σ(1/qⱼ)
 */
export function getFpmmProbabilities(pools: FpmmPools): Record<string, number> {
  const inverses: Record<string, number> = {};
  let sumInverses = 0;

  for (const [outcome, pool] of Object.entries(pools)) {
    if (pool <= 0) {
      throw new Error(`Pool for ${outcome} must be positive`);
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
 * Calculate FPMM invariant k = q₁ × q₂ × ... × qₙ
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
 * Calculate shares received from buying outcome
 * Algorithm:
 * 1. Add amount/(N-1) to all non-target pools
 * 2. Solve for new target pool: q'ᵢ = k / ∏(q'ⱼ)
 * 3. Shares = qᵢ - q'ᵢ
 */
export function calculateBuyShares(
  pools: FpmmPools,
  amount: number,
  outcome: string
): FpmmResult {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  if (!(outcome in pools)) {
    throw new Error(`Outcome ${outcome} not found`);
  }

  const outcomes = Object.keys(pools);
  const n = outcomes.length;

  if (n < 2) {
    throw new Error('Must have at least 2 outcomes');
  }

  // Calculate invariant
  const k = calculateInvariant(pools);

  // Create new pools
  const newPools: FpmmPools = { ...pools };

  // Add amount/(N-1) to all non-target pools
  const amountPerPool = amount / (n - 1);
  for (const o of outcomes) {
    if (o !== outcome) {
      newPools[o] = pools[o] + amountPerPool;
    }
  }

  // Calculate product of non-target pools
  let productOthers = 1;
  for (const o of outcomes) {
    if (o !== outcome) {
      productOthers *= newPools[o];
    }
  }

  // Solve for new target pool
  const newTargetPool = k / productOthers;
  newPools[outcome] = newTargetPool;

  // Shares received
  const shares = pools[outcome] - newTargetPool;

  if (shares <= 0) {
    throw new Error('Trade would result in non-positive shares');
  }

  return { shares, newPools };
}

/**
 * Calculate payout from selling shares
 * Uses binary search to find cost M where buying M gives exactly sharesToSell
 * Payout = sharesToSell - M
 */
export function calculateSellPayout(
  pools: FpmmPools,
  sharesToSell: number,
  outcome: string
): number {
  if (sharesToSell <= 0) {
    throw new Error('Shares must be positive');
  }

  if (!(outcome in pools)) {
    throw new Error(`Outcome ${outcome} not found`);
  }

  // Binary search for cost
  let low = 0;
  let high = sharesToSell;
  const epsilon = 0.0001;
  const maxIterations = 100;

  let iterations = 0;
  let bestCost = 0;

  while (high - low > epsilon && iterations < maxIterations) {
    const mid = (low + high) / 2;

    try {
      const result = calculateBuyShares(pools, mid, outcome);

      if (Math.abs(result.shares - sharesToSell) < epsilon) {
        bestCost = mid;
        break;
      }

      if (result.shares < sharesToSell) {
        low = mid;
      } else {
        high = mid;
      }

      bestCost = mid;
    } catch (e) {
      high = mid;
    }

    iterations++;
  }

  const payout = sharesToSell - bestCost;

  if (payout < 0) {
    return 0;
  }

  return payout;
}

/**
 * Get probability after buying
 */
export function getProbabilityAfterBuy(
  pools: FpmmPools,
  amount: number,
  outcome: string
): number {
  const result = calculateBuyShares(pools, amount, outcome);
  const newProbs = getFpmmProbabilities(result.newPools);
  return newProbs[outcome];
}

/**
 * Get probability after selling
 */
export function getProbabilityAfterSell(
  pools: FpmmPools,
  sharesToSell: number,
  outcome: string
): number {
  // Binary search to find the cost that gives us these shares
  let low = 0;
  let high = sharesToSell;
  const epsilon = 0.0001;
  let bestResult: FpmmResult | null = null;

  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    try {
      const result = calculateBuyShares(pools, mid, outcome);
      if (Math.abs(result.shares - sharesToSell) < epsilon) {
        bestResult = result;
        break;
      }
      if (result.shares < sharesToSell) {
        low = mid;
      } else {
        high = mid;
      }
      bestResult = result;
    } catch {
      high = mid;
    }
  }

  if (!bestResult) {
    return getFpmmProbabilities(pools)[outcome];
  }

  const newProbs = getFpmmProbabilities(bestResult.newPools);
  return newProbs[outcome];
}
