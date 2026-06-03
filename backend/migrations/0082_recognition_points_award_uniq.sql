-- Defense-in-depth against the recognition double-award bug: at most one
-- earned/given point row per (recognition_id, user_id, type).
--
-- 1) Heal any duplicate award rows left by the pre-fix bug — keep the earliest
--    per (recognition_id, user_id, type), delete the rest. Balances are computed
--    by SUM(points) (getUserPointsBalance), so removing the dupes restores the
--    correct available/earned/given totals.
DELETE FROM "recognition_points" rp USING (
    SELECT id, row_number() OVER (
        PARTITION BY recognition_id, user_id, type ORDER BY created_at, id
    ) AS rn
    FROM "recognition_points"
    WHERE recognition_id IS NOT NULL AND type IN ('earned', 'given')
) d
WHERE rp.id = d.id AND d.rn > 1;

-- 2) Enforce uniqueness so a re-publish / re-approve can never double-credit.
--    Partial: granted/redeemed/reversed rows (and any with a null recognition_id)
--    are intentionally unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_recognition_points_award"
    ON "recognition_points" ("recognition_id", "user_id", "type")
    WHERE recognition_id IS NOT NULL AND type IN ('earned', 'given');
