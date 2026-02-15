-- Make binary market fields nullable since multi-outcome markets don't use them
-- Binary markets use: pool_yes, pool_no, p, probability
-- Multi-outcome markets use: outcome_pools (JSONB)

-- Remove NOT NULL constraints from binary-only fields
ALTER TABLE markets
ALTER COLUMN pool_yes DROP NOT NULL,
ALTER COLUMN pool_no DROP NOT NULL,
ALTER COLUMN p DROP NOT NULL,
ALTER COLUMN probability DROP NOT NULL;

-- Add constraint to ensure binary markets have their required fields
ALTER TABLE markets
ADD CONSTRAINT binary_market_fields_check
CHECK (
  (market_type = 'binary' AND
   pool_yes IS NOT NULL AND
   pool_no IS NOT NULL AND
   p IS NOT NULL AND
   probability IS NOT NULL AND
   outcome_pools IS NULL AND
   outcomes IS NULL
  ) OR
  (market_type = 'multi' AND
   outcome_pools IS NOT NULL AND
   outcomes IS NOT NULL AND
   pool_yes IS NULL AND
   pool_no IS NULL AND
   p IS NULL AND
   probability IS NULL
  )
);

-- Set default values for existing binary markets (should already be populated)
-- This ensures no nulls in existing binary markets
UPDATE markets
SET
  pool_yes = COALESCE(pool_yes, 0),
  pool_no = COALESCE(pool_no, 0),
  p = COALESCE(p, 0.5),
  probability = COALESCE(probability, 0.5)
WHERE market_type = 'binary';

-- Add helpful comments
COMMENT ON COLUMN markets.pool_yes IS 'Binary markets only: YES share pool reserves';
COMMENT ON COLUMN markets.pool_no IS 'Binary markets only: NO share pool reserves';
COMMENT ON COLUMN markets.p IS 'Binary markets only: Maniswap probability parameter';
COMMENT ON COLUMN markets.probability IS 'Binary markets only: Current YES probability. For multi-outcome, calculate from outcome_pools using FPMM.';
COMMENT ON COLUMN markets.outcome_pools IS 'Multi-outcome markets only: JSONB map of outcome name to pool reserves';
COMMENT ON COLUMN markets.outcomes IS 'Multi-outcome markets only: Array of outcome names';
