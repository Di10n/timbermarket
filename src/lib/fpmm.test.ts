import { describe, it, expect } from '@jest/globals';
import {
  getFpmmProbabilities,
  calculateBuySharesFpmm,
  calculateSellPayoutFpmm,
  createEqualProbabilityPools,
  verifyNoArbitrage,
  verifyInvariant,
  type FpmmPools,
} from './fpmm';

describe('FPMM Algorithm', () => {
  describe('getFpmmProbabilities', () => {
    it('should calculate correct probabilities for 2 outcomes', () => {
      const pools: FpmmPools = { A: 100, B: 100 };
      const probs = getFpmmProbabilities(pools);

      expect(probs.A).toBeCloseTo(0.5, 4);
      expect(probs.B).toBeCloseTo(0.5, 4);
    });

    it('should calculate correct probabilities for 3 outcomes', () => {
      const pools: FpmmPools = { A: 100, B: 100, C: 100 };
      const probs = getFpmmProbabilities(pools);

      expect(probs.A).toBeCloseTo(0.333, 3);
      expect(probs.B).toBeCloseTo(0.333, 3);
      expect(probs.C).toBeCloseTo(0.333, 3);
    });

    it('should sum to 1.0', () => {
      const pools: FpmmPools = { A: 50, B: 100, C: 150, D: 200 };
      const probs = getFpmmProbabilities(pools);

      const sum = Object.values(probs).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('should handle uneven pools', () => {
      const pools: FpmmPools = { A: 50, B: 150 };
      const probs = getFpmmProbabilities(pools);

      // Lower pool = higher probability
      expect(probs.A).toBeGreaterThan(probs.B);
      expect(probs.A).toBeCloseTo(0.75, 2);
      expect(probs.B).toBeCloseTo(0.25, 2);
    });

    it('should throw on zero or negative pools', () => {
      expect(() => getFpmmProbabilities({ A: 0, B: 100 })).toThrow();
      expect(() => getFpmmProbabilities({ A: -50, B: 100 })).toThrow();
    });
  });

  describe('createEqualProbabilityPools', () => {
    it('should create equal pools for 2 outcomes', () => {
      const pools = createEqualProbabilityPools(['A', 'B'], 1000);

      expect(pools.A).toBe(500);
      expect(pools.B).toBe(500);
    });

    it('should create equal pools for 5 outcomes', () => {
      const pools = createEqualProbabilityPools(['A', 'B', 'C', 'D', 'E'], 1000);

      expect(pools.A).toBe(200);
      expect(pools.B).toBe(200);
      expect(pools.C).toBe(200);
      expect(pools.D).toBe(200);
      expect(pools.E).toBe(200);
    });

    it('should throw on < 2 outcomes', () => {
      expect(() => createEqualProbabilityPools(['A'], 1000)).toThrow();
    });

    it('should throw on > 10 outcomes', () => {
      const outcomes = Array.from({ length: 11 }, (_, i) => `O${i}`);
      expect(() => createEqualProbabilityPools(outcomes, 1000)).toThrow();
    });
  });

  describe('calculateBuySharesFpmm', () => {
    it('should increase probability when buying', () => {
      const pools: FpmmPools = { A: 100, B: 100 };
      const probsBefore = getFpmmProbabilities(pools);

      const result = calculateBuySharesFpmm(pools, 50, 'A');
      const probsAfter = getFpmmProbabilities(result.newPools);

      expect(probsAfter.A).toBeGreaterThan(probsBefore.A);
      expect(probsAfter.B).toBeLessThan(probsBefore.B);
    });

    it('should preserve invariant', () => {
      const pools: FpmmPools = { A: 100, B: 100, C: 100 };
      const result = calculateBuySharesFpmm(pools, 50, 'A');

      expect(verifyInvariant(pools, result.newPools, 0.0001)).toBe(true);
    });

    it('should work with 2 outcomes', () => {
      const pools: FpmmPools = { YES: 250, NO: 250 };
      const result = calculateBuySharesFpmm(pools, 100, 'YES');

      expect(result.shares).toBeGreaterThan(0);
      expect(result.cost).toBe(100);
      expect(verifyInvariant(pools, result.newPools)).toBe(true);
    });

    it('should work with 10 outcomes', () => {
      const outcomes = Array.from({ length: 10 }, (_, i) => `O${i}`);
      const pools = createEqualProbabilityPools(outcomes, 1000);

      const result = calculateBuySharesFpmm(pools, 50, 'O0');

      expect(result.shares).toBeGreaterThan(0);
      expect(verifyInvariant(pools, result.newPools)).toBe(true);
    });

    it('should throw on invalid outcome', () => {
      const pools: FpmmPools = { A: 100, B: 100 };
      expect(() => calculateBuySharesFpmm(pools, 50, 'C')).toThrow();
    });

    it('should throw on negative amount', () => {
      const pools: FpmmPools = { A: 100, B: 100 };
      expect(() => calculateBuySharesFpmm(pools, -50, 'A')).toThrow();
    });

    it('should handle small amounts', () => {
      const pools: FpmmPools = { A: 100, B: 100 };
      const result = calculateBuySharesFpmm(pools, 0.01, 'A');

      expect(result.shares).toBeGreaterThan(0);
      expect(verifyInvariant(pools, result.newPools)).toBe(true);
    });

    it('should handle large amounts', () => {
      const pools: FpmmPools = { A: 100, B: 100 };
      const result = calculateBuySharesFpmm(pools, 10000, 'A');

      expect(result.shares).toBeGreaterThan(0);
      expect(verifyInvariant(pools, result.newPools)).toBe(true);
    });
  });

  describe('calculateSellPayoutFpmm', () => {
    it('should give reasonable payout', () => {
      const pools: FpmmPools = { A: 100, B: 100 };

      // Buy some shares
      const buyResult = calculateBuySharesFpmm(pools, 50, 'A');

      // Sell them back
      const sellResult = calculateSellPayoutFpmm(
        buyResult.newPools,
        buyResult.shares,
        'A'
      );

      // Payout should be less than what we spent (market maker spread)
      expect(sellResult.payout).toBeGreaterThan(0);
      expect(sellResult.payout).toBeLessThan(50);
      expect(verifyInvariant(buyResult.newPools, sellResult.newPools)).toBe(true);
    });

    it('should preserve invariant', () => {
      const pools: FpmmPools = { A: 100, B: 100, C: 100 };
      const result = calculateSellPayoutFpmm(pools, 10, 'A');

      expect(verifyInvariant(pools, result.newPools)).toBe(true);
    });

    it('should work with multiple outcomes', () => {
      const pools: FpmmPools = { A: 100, B: 100, C: 100, D: 100 };
      const result = calculateSellPayoutFpmm(pools, 5, 'B');

      expect(result.payout).toBeGreaterThan(0);
      expect(verifyInvariant(pools, result.newPools)).toBe(true);
    });

    it('should throw on invalid outcome', () => {
      const pools: FpmmPools = { A: 100, B: 100 };
      expect(() => calculateSellPayoutFpmm(pools, 10, 'C')).toThrow();
    });

    it('should throw on non-positive shares', () => {
      const pools: FpmmPools = { A: 100, B: 100 };
      expect(() => calculateSellPayoutFpmm(pools, 0, 'A')).toThrow();
      expect(() => calculateSellPayoutFpmm(pools, -10, 'A')).toThrow();
    });

    it('should handle selling all shares', () => {
      const pools: FpmmPools = { A: 100, B: 100 };

      // Buy shares
      const buyResult = calculateBuySharesFpmm(pools, 100, 'A');

      // Sell all of them
      const sellResult = calculateSellPayoutFpmm(
        buyResult.newPools,
        buyResult.shares,
        'A'
      );

      expect(sellResult.payout).toBeGreaterThan(0);
      expect(verifyInvariant(buyResult.newPools, sellResult.newPools)).toBe(true);
    });
  });

  describe('verifyNoArbitrage', () => {
    it('should pass for equal probability pools', () => {
      const pools: FpmmPools = { A: 100, B: 100 };
      expect(verifyNoArbitrage(pools)).toBe(true);
    });

    it('should pass for 5 outcome market', () => {
      const pools = createEqualProbabilityPools(['A', 'B', 'C', 'D', 'E'], 500);
      expect(verifyNoArbitrage(pools)).toBe(true);
    });

    it('should pass after trades', () => {
      const pools: FpmmPools = { A: 100, B: 100, C: 100 };

      // Execute some trades
      let currentPools = pools;
      currentPools = calculateBuySharesFpmm(currentPools, 50, 'A').newPools;
      currentPools = calculateBuySharesFpmm(currentPools, 30, 'B').newPools;

      expect(verifyNoArbitrage(currentPools)).toBe(true);
    });
  });

  describe('Round-trip trade', () => {
    it('should lose money on buy-sell round trip', () => {
      const pools: FpmmPools = { A: 100, B: 100, C: 100 };

      // Buy 50 leaves worth
      const buyResult = calculateBuySharesFpmm(pools, 50, 'A');

      // Immediately sell back
      const sellResult = calculateSellPayoutFpmm(
        buyResult.newPools,
        buyResult.shares,
        'A'
      );

      // Should get back less than we spent (spread)
      expect(sellResult.payout).toBeLessThan(50);

      // Pools should return to approximately original state
      const finalProbs = getFpmmProbabilities(sellResult.newPools);
      const initialProbs = getFpmmProbabilities(pools);

      expect(finalProbs.A).toBeCloseTo(initialProbs.A, 2);
      expect(finalProbs.B).toBeCloseTo(initialProbs.B, 2);
      expect(finalProbs.C).toBeCloseTo(initialProbs.C, 2);
    });
  });

  describe('Edge cases', () => {
    it('should handle very small pools', () => {
      const pools: FpmmPools = { A: 0.1, B: 0.1 };
      const result = calculateBuySharesFpmm(pools, 0.01, 'A');

      expect(result.shares).toBeGreaterThan(0);
      expect(verifyInvariant(pools, result.newPools)).toBe(true);
    });

    it('should handle very large pools', () => {
      const pools: FpmmPools = { A: 1000000, B: 1000000 };
      const result = calculateBuySharesFpmm(pools, 1000, 'A');

      expect(result.shares).toBeGreaterThan(0);
      expect(verifyInvariant(pools, result.newPools)).toBe(true);
    });

    it('should handle extreme probability differences', () => {
      const pools: FpmmPools = { A: 10, B: 1000 };
      const probs = getFpmmProbabilities(pools);

      // A should be much more likely
      expect(probs.A).toBeGreaterThan(0.9);
      expect(probs.B).toBeLessThan(0.1);

      const result = calculateBuySharesFpmm(pools, 50, 'B');
      expect(verifyInvariant(pools, result.newPools)).toBe(true);
    });
  });

  describe('Multi-outcome stress tests', () => {
    it('should handle 10 outcomes with multiple trades', () => {
      const outcomes = Array.from({ length: 10 }, (_, i) => `O${i}`);
      let pools = createEqualProbabilityPools(outcomes, 1000);

      // Execute random trades
      pools = calculateBuySharesFpmm(pools, 50, 'O0').newPools;
      pools = calculateBuySharesFpmm(pools, 30, 'O5').newPools;
      pools = calculateBuySharesFpmm(pools, 70, 'O9').newPools;
      pools = calculateBuySharesFpmm(pools, 40, 'O3').newPools;

      // Probabilities should still sum to 1
      const probs = getFpmmProbabilities(pools);
      const sum = Object.values(probs).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 10);

      // No arbitrage should still hold
      expect(verifyNoArbitrage(pools)).toBe(true);
    });

    it('should handle alternating buys and sells', () => {
      let pools: FpmmPools = { A: 100, B: 100, C: 100 };

      // Buy A
      const buy1 = calculateBuySharesFpmm(pools, 50, 'A');
      pools = buy1.newPools;

      // Sell half of A
      const sell1 = calculateSellPayoutFpmm(pools, buy1.shares / 2, 'A');
      pools = sell1.newPools;

      // Buy B
      const buy2 = calculateBuySharesFpmm(pools, 30, 'B');
      pools = buy2.newPools;

      // Buy C
      const buy3 = calculateBuySharesFpmm(pools, 40, 'C');
      pools = buy3.newPools;

      // Sell all of B
      const sell2 = calculateSellPayoutFpmm(pools, buy2.shares, 'B');
      pools = sell2.newPools;

      // Verify no arbitrage throughout
      expect(verifyNoArbitrage(pools)).toBe(true);

      // Probabilities should sum to 1
      const probs = getFpmmProbabilities(pools);
      const sum = Object.values(probs).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });
  });
});
