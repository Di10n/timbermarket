-- Multi-Outcome Markets Schema Changes
-- Add support for markets with 2-10 outcomes (e.g., "Which team wins?")

-- Add market_type column to distinguish binary from multi-outcome markets
ALTER TABLE markets
ADD COLUMN market_type text NOT NULL DEFAULT 'binary'
CHECK (market_type IN ('binary', 'multi'));

-- Add outcomes array for multi-outcome markets
-- Example: ['OpenAI', 'Anthropic', 'NVIDIA', 'Google']
ALTER TABLE markets
ADD COLUMN outcomes text[];

-- Add outcome_pools JSONB for multi-outcome market reserves
-- Example: {'OpenAI': 125, 'Anthropic': 125, 'NVIDIA': 125, 'Google': 125}
ALTER TABLE markets
ADD COLUMN outcome_pools jsonb;

-- Constraint: multi markets must have outcomes and outcome_pools
-- Binary markets must NOT have them
ALTER TABLE markets
ADD CONSTRAINT multi_market_check
CHECK (
  (market_type = 'binary' AND outcomes IS NULL AND outcome_pools IS NULL) OR
  (market_type = 'multi' AND outcomes IS NOT NULL AND outcome_pools IS NOT NULL
   AND array_length(outcomes, 1) >= 2 AND array_length(outcomes, 1) <= 10)
);

-- Add shares_by_outcome for multi-outcome positions
-- Example: {'OpenAI': 12.5, 'Anthropic': 8.3, 'NVIDIA': 0, 'Google': 5.2}
ALTER TABLE positions
ADD COLUMN shares_by_outcome jsonb;

-- For backward compatibility, positions can have either:
-- - yes_shares/no_shares (binary markets) or
-- - shares_by_outcome (multi-outcome markets)
-- Both can coexist during migration

-- Remove CHECK constraint on trades.outcome to allow dynamic outcomes
-- (Binary markets use 'YES'/'NO', multi-outcome use custom outcome names)
ALTER TABLE trades
DROP CONSTRAINT IF EXISTS trades_outcome_check;

-- Add probability_distribution for multi-outcome markets
-- Example: {'OpenAI': 0.25, 'Anthropic': 0.25, 'NVIDIA': 0.25, 'Google': 0.25}
ALTER TABLE probability_history
ADD COLUMN probability_distribution jsonb;

-- Keep 'probability' column for binary markets (backward compatible)

-- Index for efficient multi-outcome queries
CREATE INDEX IF NOT EXISTS idx_markets_market_type ON markets(market_type);
CREATE INDEX IF NOT EXISTS idx_trades_market_outcome ON trades(market_id, outcome);

-- Comments for documentation
COMMENT ON COLUMN markets.market_type IS 'Type of market: binary (YES/NO) or multi (custom outcomes)';
COMMENT ON COLUMN markets.outcomes IS 'Array of outcome names for multi-outcome markets';
COMMENT ON COLUMN markets.outcome_pools IS 'FPMM pool reserves keyed by outcome name';
COMMENT ON COLUMN positions.shares_by_outcome IS 'Share holdings keyed by outcome name for multi-outcome markets';
COMMENT ON COLUMN probability_history.probability_distribution IS 'Probability distribution across all outcomes for multi-outcome markets';
