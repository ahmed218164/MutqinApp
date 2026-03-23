-- ==============================================================================
-- Migration: Fix surah progress tracking
-- Date: 2026-03-07
-- Problem: daily_logs had no surah_number column, so surah completion was
--          never detected and the app stayed stuck on Al-Fatiha forever.
-- ==============================================================================

-- 1. Add surah_number to daily_logs so we can query per-surah page counts
ALTER TABLE daily_logs
    ADD COLUMN IF NOT EXISTS surah_number   INTEGER,
    ADD COLUMN IF NOT EXISTS verse_from     INTEGER,
    ADD COLUMN IF NOT EXISTS verse_to       INTEGER,
    ADD COLUMN IF NOT EXISTS score          INTEGER;   -- average score for that session

-- Index for fast surah-level queries
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_surah
    ON daily_logs (user_id, surah_number);

-- ==============================================================================
-- 2. Create surah_progress table
--    One row per (user, surah). Tracks which ayahs have been recited at
--    least once so we can reliably detect completion without guessing.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS surah_progress (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    surah_number    INTEGER     NOT NULL CHECK (surah_number BETWEEN 1 AND 114),
    total_verses    INTEGER     NOT NULL,           -- total ayahs in this surah
    verses_done     INTEGER     NOT NULL DEFAULT 0, -- how many ayahs practiced
    completed       BOOLEAN     NOT NULL DEFAULT false,
    completed_at    TIMESTAMPTZ,
    last_session_at TIMESTAMPTZ DEFAULT now(),
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, surah_number)
);

-- RLS
ALTER TABLE surah_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_surah_progress" ON surah_progress;
CREATE POLICY "users_own_surah_progress"
    ON surah_progress
    FOR ALL
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Index
CREATE INDEX IF NOT EXISTS idx_surah_progress_user
    ON surah_progress (user_id, completed, surah_number);

-- ==============================================================================
-- 3. Add current_surah to profiles for fast home-screen lookup
--    (avoids computing the "current surah" from page ratios every time)
-- ==============================================================================
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS current_surah  INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS current_verse  INTEGER DEFAULT 1;

-- ==============================================================================
-- 4. Function: upsert_surah_progress
--    Called from the app after every recitation session.
--    Parameters:
--      p_user_id       UUID
--      p_surah         INT   surah number (1-114)
--      p_verse_from    INT   first verse recited this session
--      p_verse_to      INT   last verse recited this session
--      p_total_verses  INT   total verses in this surah (from app constants)
--    Returns: completed BOOLEAN (true if surah is now fully done)
-- ==============================================================================
CREATE OR REPLACE FUNCTION upsert_surah_progress(
    p_user_id       UUID,
    p_surah         INTEGER,
    p_verse_from    INTEGER,
    p_verse_to      INTEGER,
    p_total_verses  INTEGER
) RETURNS TABLE (
    out_completed   BOOLEAN,
    out_verses_done INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_verses_done   INTEGER;
    v_completed     BOOLEAN;
    v_range_size    INTEGER;
BEGIN
    -- Range size of this session (verse_to - verse_from + 1)
    v_range_size := GREATEST(1, p_verse_to - p_verse_from + 1);

    -- Upsert the progress row
    INSERT INTO surah_progress (user_id, surah_number, total_verses, verses_done, completed, last_session_at)
    VALUES (p_user_id, p_surah, p_total_verses, v_range_size, false, now())
    ON CONFLICT (user_id, surah_number) DO UPDATE
        SET verses_done     = LEAST(
                                  surah_progress.total_verses,
                                  surah_progress.verses_done + v_range_size
                              ),
            last_session_at = now();

    -- Re-read updated values
    SELECT sp.verses_done,
           (sp.verses_done >= sp.total_verses)
    INTO v_verses_done, v_completed
    FROM surah_progress sp
    WHERE sp.user_id = p_user_id AND sp.surah_number = p_surah;

    -- Mark completed if all verses done
    IF v_completed THEN
        UPDATE surah_progress
        SET completed    = true,
            completed_at = COALESCE(completed_at, now())
        WHERE user_id = p_user_id AND surah_number = p_surah;

        -- Advance current_surah in profiles to the next one
        UPDATE profiles
        SET current_surah = LEAST(114, p_surah + 1),
            current_verse = 1
        WHERE id = p_user_id
          AND (current_surah IS NULL OR current_surah <= p_surah);
    END IF;

    RETURN QUERY SELECT v_completed, v_verses_done;
END;
$$;
