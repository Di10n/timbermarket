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
 * Corrected algorithm that properly reverses buy operation:
 * 1. Add shares back to target pool
 * 2. Binary search for payout P where removing P/(N-1) from non-target pools maintains k
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

  const outcomes = Object.keys(pools);
  const n = outcomes.length;

  if (n < 2) {
    throw new Error('Must have at least 2 outcomes');
  }

  // Calculate invariant
  const k = calculateInvariant(pools);

  // Add shares back to target pool
  const newTargetPool = pools[outcome] + sharesToSell;

  // Calculate target product for non-target pools: k / newTargetPool
  const targetProduct = k / newTargetPool;

  // Find minimum pool to limit upper bound
  let minPool = Infinity;
  for (const o of outcomes) {
    if (o !== outcome && pools[o] < minPool) {
      minPool = pools[o];
    }
  }

  // Binary search for payout P
  let low = 0;
  let high = minPool * (n - 1) * 0.99; // Can't remove more than smallest pool
  const epsilon = 0.0001;
  const maxIterations = 100;

  let iterations = 0;
  let bestPayout = 0;
  let bestDiff = Infinity;

  while (high - low > epsilon && iterations < maxIterations) {
    const mid = (low + high) / 2;

    // Calculate product of (pool - mid/(N-1)) for all non-target pools
    let testProduct = 1;
    let valid = true;

    for (const o of outcomes) {
      if (o !== outcome) {
        const newPool = pools[o] - mid / (n - 1);
        if (newPool <= 0) {
          valid = false;
          break;
        }
        testProduct *= newPool;
      }
    }

    if (!valid) {
      // Removing too much, reduce high
      high = mid;
      iterations++;
      continue;
    }

    // Track best solution
    const diff = Math.abs(testProduct - targetProduct);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestPayout = mid;
    }

    if (diff < epsilon) {
      bestPayout = mid;
      break;
    }

    if (testProduct > targetProduct) {
      // Need to remove more
      low = mid;
    } else {
      // Removing too much
      high = mid;
    }

    iterations++;
  }

  if (bestPayout < 0) {
    return 0;
  }

  return bestPayout;
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
 * Calculate new pools after selling (corrected algorithm)
 */
function calculateSellPools(
  pools: FpmmPools,
  sharesToSell: number,
  outcome: string
): FpmmPools {
  const outcomes = Object.keys(pools);
  const n = outcomes.length;
  const k = calculateInvariant(pools);

  // Add shares back to target pool
  const newTargetPool = pools[outcome] + sharesToSell;

  // Calculate target product
  const targetProduct = k / newTargetPool;

  // Find minimum pool to limit upper bound
  let minPool = Infinity;
  for (const o of outcomes) {
    if (o !== outcome && pools[o] < minPool) {
      minPool = pools[o];
    }
  }

  // Binary search for payout
  let low = 0;
  let high = minPool * (n - 1) * 0.99;
  const epsilon = 0.0001;
  let bestPayout = 0;
  let bestDiff = Infinity;

  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;

    let testProduct = 1;
    let valid = true;

    for (const o of outcomes) {
      if (o !== outcome) {
        const newPool = pools[o] - mid / (n - 1);
        if (newPool <= 0) {
          valid = false;
          break;
        }
        testProduct *= newPool;
      }
    }

    if (!valid) {
      high = mid;
      continue;
    }

    const diff = Math.abs(testProduct - targetProduct);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestPayout = mid;
    }

    if (diff < epsilon) {
      bestPayout = mid;
      break;
    }

    if (testProduct > targetProduct) {
      low = mid;
    } else {
      high = mid;
    }
  }

  // Build new pools
  const newPools: FpmmPools = {};
  for (const o of outcomes) {
    if (o === outcome) {
      newPools[o] = newTargetPool;
    } else {
      newPools[o] = pools[o] - bestPayout / (n - 1);
    }
  }

  return newPools;
}

/**
 * Get probability after selling
 */
export function getProbabilityAfterSell(
  pools: FpmmPools,
  sharesToSell: number,
  outcome: string
): number {
  const newPools = calculateSellPools(pools, sharesToSell, outcome);
  const newProbs = getFpmmProbabilities(newPools);
  return newProbs[outcome];
}
