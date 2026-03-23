-- ================================================================
-- MutqinApp — Fix All Outstanding Issues
-- Run this in Supabase SQL Editor (safe to re-run)
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. fetch_due_reviews_sm2 — fix column-name conflict
-- ──────────────────────────────────────────────────────────────────
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
        rs.surah                                 AS out_surah,
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
-- 2. award_xp_atomic — atomic XP update (prevent race conditions)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION award_xp_atomic(
    p_user_id UUID,
    p_xp      INTEGER,
    p_reason  TEXT DEFAULT 'XP Award'
)
RETURNS TABLE (
    out_total_xp INTEGER,
    out_level    INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_xp INTEGER;
    v_level    INTEGER;
BEGIN
    UPDATE profiles
    SET
        total_xp = COALESCE(total_xp, 0) + p_xp,
        level    = GREATEST(1, (COALESCE(total_xp, 0) + p_xp) / 100)
    WHERE id = p_user_id
    RETURNING total_xp, level
    INTO v_total_xp, v_level;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User % not found', p_user_id;
    END IF;

    RETURN QUERY SELECT v_total_xp, v_level;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- 3. upsert_surah_progress — track per-surah verse completion
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS surah_progress (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    surah_number  INTEGER NOT NULL,
    verses_done   INTEGER NOT NULL DEFAULT 0,
    total_verses  INTEGER NOT NULL DEFAULT 0,
    completed     BOOLEAN NOT NULL DEFAULT FALSE,
    last_updated  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, surah_number)
);

ALTER TABLE surah_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own surah progress" ON surah_progress;
CREATE POLICY "Users can manage own surah progress"
    ON surah_progress FOR ALL USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION upsert_surah_progress(
    p_user_id      UUID,
    p_surah        INTEGER,
    p_verse_from   INTEGER,
    p_verse_to     INTEGER,
    p_total_verses INTEGER
)
RETURNS TABLE (
    out_completed   BOOLEAN,
    out_verses_done INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_verses_done INTEGER;
    v_completed   BOOLEAN;
BEGIN
    INSERT INTO surah_progress (user_id, surah_number, verses_done, total_verses)
    VALUES (p_user_id, p_surah, (p_verse_to - p_verse_from + 1), p_total_verses)
    ON CONFLICT (user_id, surah_number) DO UPDATE
        SET verses_done  = LEAST(
                               surah_progress.total_verses,
                               surah_progress.verses_done + (p_verse_to - p_verse_from + 1)
                           ),
            total_verses = p_total_verses,
            last_updated = NOW()
    RETURNING verses_done, (verses_done >= total_verses)
    INTO v_verses_done, v_completed;

    IF v_completed THEN
        UPDATE surah_progress
        SET completed = TRUE
        WHERE user_id = p_user_id AND surah_number = p_surah;
    END IF;

    RETURN QUERY SELECT v_completed, v_verses_done;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- 4. bookmarks table — cross-device sync
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookmarks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    surah_number INTEGER NOT NULL,
    surah_name   TEXT,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, surah_number)
);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own bookmarks" ON bookmarks;
CREATE POLICY "Users can manage own bookmarks"
    ON bookmarks FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);

-- ──────────────────────────────────────────────────────────────────
-- 5. memorization_plan — daily_pages sync column
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE memorization_plan
    ADD COLUMN IF NOT EXISTS daily_pages NUMERIC(5,2) NOT NULL DEFAULT 1;

-- ──────────────────────────────────────────────────────────────────
-- 6. profiles — ensure all needed columns exist
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS nickname     TEXT,
    ADD COLUMN IF NOT EXISTS target_date  DATE,
    ADD COLUMN IF NOT EXISTS total_pages_goal INTEGER DEFAULT 604,
    ADD COLUMN IF NOT EXISTS total_xp     INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS level        INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS streak_days  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_active  DATE;

-- ──────────────────────────────────────────────────────────────────
-- 7. daily_logs — ensure surah_number column exists
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE daily_logs
    ADD COLUMN IF NOT EXISTS surah_number INTEGER,
    ADD COLUMN IF NOT EXISTS verse_from   INTEGER,
    ADD COLUMN IF NOT EXISTS verse_to     INTEGER,
    ADD COLUMN IF NOT EXISTS score        NUMERIC(5,2);

-- ──────────────────────────────────────────────────────────────────
-- 8. Grant execute on new functions
-- ──────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION fetch_due_reviews_sm2(UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION award_xp_atomic(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_surah_progress(UUID, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
