-- SECURITY (P0-1) DATA MIGRATION — run ONCE against production, by hand.
--
-- Context: before this fix, /claim/callback stored matchConfidence='high' for
-- EVERY successful match, including weak LinkedIn name-only matches
-- (verifiedSignal='linkedin-name-match'). Those rows currently grant full
-- profile-mutation ownership on nothing but a user-editable Clerk display name.
-- The code fix (signalConfidence) makes NEW name-only claims 'medium', but
-- existing rows must be downgraded too.
--
-- This is intentionally NOT wired into the drizzle migration chain or any cron
-- — it mutates production rows, so a human runs it deliberately against the
-- prod Neon branch (psql "$DATABASE_URL" -f scripts/sql/downgrade-name-only-claims.sql).
--
-- 1) PREVIEW the rows that will change (run this first, eyeball the count):
--
--    SELECT clerk_user_id, evaluation_id, match_confidence, verified_signal, verified_at
--    FROM users
--    WHERE verified_signal = 'linkedin-name-match'
--      AND match_confidence = 'high'
--    ORDER BY verified_at DESC;
--
-- 2) APPLY the downgrade (uncomment / run after reviewing the preview):

BEGIN;

UPDATE users
SET match_confidence = 'medium'
WHERE verified_signal = 'linkedin-name-match'
  AND match_confidence = 'high';

-- Sanity check inside the txn: expect 0 rows after the UPDATE.
-- SELECT count(*) FROM users
--   WHERE verified_signal = 'linkedin-name-match' AND match_confidence = 'high';

COMMIT;
