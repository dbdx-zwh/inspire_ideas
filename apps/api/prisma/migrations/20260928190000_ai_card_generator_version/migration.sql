-- Existing rows were generated with the previous cross-section prompt. Keep them
-- for auditability, but mark them as legacy so the reader does not display stale
-- or mismatched summaries before the user explicitly regenerates the cards.
ALTER TABLE "AICard"
ADD COLUMN "generatorVersion" TEXT NOT NULL DEFAULT 'legacy';
