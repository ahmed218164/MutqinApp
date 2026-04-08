-- ================================================================
-- MutqinApp — Comprehensive Fix Migration (2026-04-08)
-- Addresses: column naming, XP source of truth, missing RPCs
-- Safe to re-run (all CREATE OR REPLACE / IF NOT EXISTS)
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. Ensure review_schedule has `surah_number` column
--    The client uses `surah_number` but the old migration used `surah`.
--    Add surah_number as an alias if it doesn't exist, copying data.
-- ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
    -- Add surah_number column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'review_schedule' AND column_name = 'surah_number'
    ) THEN
        -- Check if 'surah' column exists (old name)
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'review_schedule' AND column_name = 'surah'
        ) THEN
            ALTER TABLE review_schedule ADD COLUMN surah_number INTEGER;
            UPDATE review_schedule SET surah_number = surah;
            RAISE NOTICE 'Copied surah → surah_number in review_schedule';
        ELSE
            ALTER TABLE review_schedule ADD COLUMN surah_number INTEGER NOT NULL DEFAULT 1;
        END IF;
    END IF;
END $$;

-- Ensure the unique constraint covers the new column name
DO $$
BEGIN
    -- Drop old constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'review_schedule_user_id_surah_key'
        AND table_name = 'review_schedule'
    ) THEN
        ALTER TABLE review_schedule DROP CONSTRAINT review_schedule_user_id_surah_key;
    END IF;

    -- Create new constraint on (user_id, surah_number) if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'review_schedule_user_id_surah_number_key'
        AND table_name = 'review_schedule'
    ) THEN
        ALTER TABLE review_schedule
            ADD CONSTRAINT review_schedule_user_id_surah_number_key
            UNIQUE (user_id, surah_number);
    END IF;
END $$;



-- ──────────────────────────────────────────────────────────────────
-- 2. Fix fetch_due_reviews_sm2 — use surah_number column
-- ──────────────────────────────────────────────────────────────────
-- DROP required: return-type signature changed (column names differ from old version)
DROP FUNCTION IF EXISTS fetch_due_reviews_sm2(UUID);
CREATE OR REPLACE FUNCTION fetch_due_reviews_sm2(p_user_id UUID)
RETURNS TABLE (
    out_surah    INTEGER,
    review_date  DATE,
    ease_factor  NUMERIC,
    repetitions  INTEGER,
    days_overdue INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        rs.surah_number                          AS out_surah,
        rs.next_review                           AS review_date,
        rs.efactor                               AS ease_factor,
        rs.sm2_repetitions                       AS repetitions,
        GREATEST(0, (CURRENT_DATE - rs.next_review)::INTEGER) AS days_overdue
    FROM review_schedule rs
    WHERE rs.user_id    = p_user_id
      AND rs.next_review IS NOT NULL
      AND rs.next_review <= CURRENT_DATE
    ORDER BY
        rs.next_review ASC,
        rs.efactor     ASC
    LIMIT 15;
END;
$$;


-- ──────────────────────────────────────────────────────────────────
-- 3. Fix award_xp_atomic — use user_progress table (single SOT)
--    Returns new_total_xp, new_level, leveled_up to match TypeScript
-- ──────────────────────────────────────────────────────────────────
-- DROP required: returning new columns (new_total_xp, new_level, leveled_up)
-- instead of old columns (out_total_xp, out_level, etc.)
-- Drop BOTH old parametecr orders — old version had (amount, reason, user_id)
DROP FUNCTION IF EXISTS award_xp_atomic(INTEGER, TEXT, UUID);
DROP FUNCTION IF EXISTS award_xp_atomic(UUID, INTEGER, TEXT);
CREATE OR REPLACE FUNCTION award_xp_atomic(
    p_user_id UUID,
    p_amount  INTEGER,
    p_reason  TEXT DEFAULT 'XP Award'
)
RETURNS TABLE (
    new_total_xp INTEGER,
    new_level    INTEGER,
    leveled_up   BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_level  INTEGER;
    v_total_xp   INTEGER;
    v_new_level  INTEGER;
BEGIN
    -- Get old level before update
    SELECT COALESCE(up.level, 1) INTO v_old_level
    FROM user_progress up WHERE up.user_id = p_user_id;

    IF NOT FOUND THEN
        v_old_level := 0;  -- Will trigger insert below
    END IF;

    -- Upsert: atomic increment on user_progress
    INSERT INTO user_progress (user_id, total_xp, level, current_streak, longest_streak, total_surahs_completed)
    VALUES (p_user_id, p_amount, GREATEST(1, p_amount / 100), 0, 0, 0)
    ON CONFLICT (user_id) DO UPDATE
        SET total_xp   = user_progress.total_xp + p_amount,
            level      = GREATEST(1, (user_progress.total_xp + p_amount) / 100),
            updated_at = NOW()
    RETURNING user_progress.total_xp, user_progress.level
    INTO v_total_xp, v_new_level;

    RETURN QUERY SELECT v_total_xp, v_new_level, (v_new_level > v_old_level);
END;
$$;



-- ──────────────────────────────────────────────────────────────────
-- 4. Create advance_ward_position RPC (server-authoritative)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION advance_ward_position(
    p_user_id      UUID,
    p_side         TEXT,       -- 'forward' or 'backward'
    p_surah        INTEGER,
    p_verse_to     INTEGER,
    p_total_verses INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_completed BOOLEAN;
BEGIN
    v_completed := (p_verse_to >= p_total_verses);

    IF p_side = 'forward' THEN
        IF v_completed THEN
            UPDATE memorization_plan
            SET fwd_surah   = LEAST(114, p_surah + 1),
                fwd_verse   = 1,
                last_ward_at = CURRENT_DATE,
                updated_at   = NOW()
            WHERE user_id = p_user_id;
        ELSE
            UPDATE memorization_plan
            SET fwd_verse    = p_verse_to + 1,
                last_ward_at = CURRENT_DATE,
                updated_at   = NOW()
            WHERE user_id = p_user_id;
        END IF;
    ELSIF p_side = 'backward' THEN
        IF v_completed THEN
            UPDATE memorization_plan
            SET bwd_surah   = GREATEST(1, p_surah - 1),
                bwd_verse   = 1,
                last_ward_at = CURRENT_DATE,
                updated_at   = NOW()
            WHERE user_id = p_user_id;
        ELSE
            UPDATE memorization_plan
            SET bwd_verse    = p_verse_to + 1,
                last_ward_at = CURRENT_DATE,
                updated_at   = NOW()
            WHERE user_id = p_user_id;
        END IF;
    END IF;

    -- Update profiles.current_surah for dashboard display (both directions)
    IF v_completed THEN
        IF p_side = 'forward' THEN
            UPDATE profiles
            SET current_surah = LEAST(114, p_surah + 1)
            WHERE id = p_user_id;
        ELSIF p_side = 'backward' THEN
            UPDATE profiles
            SET current_surah = GREATEST(1, p_surah - 1)
            WHERE id = p_user_id;
        END IF;
    END IF;
END;
$$;


-- ──────────────────────────────────────────────────────────────────
-- 5. Create update_sm2_schedule RPC (server-authoritative SM-2)
-- ──────────────────────────────────────────────────────────────────
-- DROP required: new function, but guard against any prior version with different signature
DROP FUNCTION IF EXISTS update_sm2_schedule(UUID, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION update_sm2_schedule(
    p_user_id UUID,
    p_surah   INTEGER,
    p_quality INTEGER  -- 0-5 SM-2 quality
)
RETURNS TABLE (
    out_next_review_date DATE,
    out_new_interval     INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ef             NUMERIC := 2.5;
    v_interval       INTEGER := 1;
    v_reps           INTEGER := 0;
    v_new_ef         NUMERIC;
    v_new_interval   INTEGER;
    v_new_reps       INTEGER;
    v_next_review    DATE;
    v_old_mistakes   INTEGER := 0;
BEGIN
    -- Fetch current SM-2 state (COALESCE all — existing rows may have NULLs)
    SELECT COALESCE(efactor, 2.5), COALESCE(sm2_interval, 1), COALESCE(sm2_repetitions, 0), COALESCE(mistake_count, 0)
    INTO v_ef, v_interval, v_reps, v_old_mistakes
    FROM review_schedule
    WHERE user_id = p_user_id AND surah_number = p_surah;

    -- If no row found, use defaults (already set above)

    -- Compute new ease factor (SM-2 formula)
    v_new_ef := GREATEST(
        1.3,
        v_ef + 0.1 - (5 - p_quality) * (0.08 + (5 - p_quality) * 0.02)
    );

    IF p_quality < 3 THEN
        -- Failed: reset
        v_new_reps     := 0;
        v_new_interval := 1;
    ELSE
        v_new_reps := v_reps + 1;
        IF v_new_reps = 1 THEN
            v_new_interval := 1;
        ELSIF v_new_reps = 2 THEN
            v_new_interval := 6;
        ELSE
            v_new_interval := GREATEST(1, LEAST(365, ROUND(v_interval * v_new_ef)));
        END IF;
    END IF;

    v_next_review := CURRENT_DATE + v_new_interval;

    -- Upsert the review schedule
    INSERT INTO review_schedule (
        user_id, surah_number, last_reviewed, next_review,
        mistake_count, efactor, sm2_interval, sm2_repetitions, quality
    )
    VALUES (
        p_user_id, p_surah, CURRENT_DATE, v_next_review,
        CASE WHEN p_quality < 3 THEN v_old_mistakes + 1 ELSE 0 END,
        ROUND(v_new_ef::NUMERIC, 2), v_new_interval, v_new_reps, p_quality
    )
    ON CONFLICT (user_id, surah_number) DO UPDATE
        SET last_reviewed   = CURRENT_DATE,
            next_review     = v_next_review,
            mistake_count   = CASE WHEN p_quality < 3
                              THEN review_schedule.mistake_count + 1
                              ELSE 0 END,
            efactor         = ROUND(v_new_ef::NUMERIC, 2),
            sm2_interval    = v_new_interval,
            sm2_repetitions = v_new_reps,
            quality         = p_quality;

    RETURN QUERY SELECT v_next_review, v_new_interval;
END;
$$;


-- ──────────────────────────────────────────────────────────────────
-- 6. Grant execute on all functions
-- ──────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION fetch_due_reviews_sm2(UUID)               TO authenticated;
GRANT EXECUTE ON FUNCTION award_xp_atomic(UUID, INTEGER, TEXT)      TO authenticated;
GRANT EXECUTE ON FUNCTION advance_ward_position(UUID, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION update_sm2_schedule(UUID, INTEGER, INTEGER)                  TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_surah_progress(UUID, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
