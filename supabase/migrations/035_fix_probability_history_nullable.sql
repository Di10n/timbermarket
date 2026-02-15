-- Fix: Make probability column nullable in probability_history table
-- Multi-outcome markets use probability_distribution, not probability

-- Remove NOT NULL constraint from probability column
ALTER TABLE probability_history
ALTER COLUMN probability DROP NOT NULL;

-- Add constraint to ensure at least one field is populated
ALTER TABLE probability_history
ADD CONSTRAINT probability_history_data_check
CHECK (
  probability IS NOT NULL OR probability_distribution IS NOT NULL
);

-- Add helpful comments
COMMENT ON COLUMN probability_history.probability IS 'Binary markets only: Single probability value';
COMMENT ON COLUMN probability_history.probability_distribution IS 'Multi-outcome markets only: JSONB map of outcome to probability';
