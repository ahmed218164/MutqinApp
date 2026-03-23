-- ==============================================================================
-- Migration: Full Memorization Plan (Ward System)
-- Date: 2026-03-07
-- Adds a structured daily ward system with 3 direction modes:
--   forward  → Fatiha to Nas
--   backward → Nas to Fatiha
--   both     → Two fronts meeting in the middle
-- ==============================================================================

CREATE TABLE IF NOT EXISTS memorization_plan (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Direction of memorization
    direction       TEXT        NOT NULL DEFAULT 'forward'
                                CHECK (direction IN ('forward', 'backward', 'both')),

    -- Daily target in pages (1 page ≈ 15 verses)
    daily_pages     INTEGER     NOT NULL DEFAULT 2 CHECK (daily_pages BETWEEN 1 AND 20),

    -- Forward position: current surah + verse being memorized (Fatiha → Nas)
    fwd_surah       INTEGER     NOT NULL DEFAULT 1  CHECK (fwd_surah  BETWEEN 1 AND 114),
    fwd_verse       INTEGER     NOT NULL DEFAULT 1  CHECK (fwd_verse  >= 1),

    -- Backward position: current surah + verse (Nas → Fatiha)
    bwd_surah       INTEGER     NOT NULL DEFAULT 114 CHECK (bwd_surah BETWEEN 1 AND 114),
    bwd_verse       INTEGER     NOT NULL DEFAULT 1   CHECK (bwd_verse  >= 1),
    -- bwd_verse=0 means "start from last verse of the surah"

    -- Timestamps
    plan_started_at TIMESTAMPTZ DEFAULT now(),
    last_ward_at    DATE,           -- date of last completed ward session
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),

    UNIQUE (user_id)               -- one active plan per user
);

-- RLS
ALTER TABLE memorization_plan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_plan" ON memorization_plan;
CREATE POLICY "users_own_plan"
    ON memorization_plan FOR ALL
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Index
CREATE INDEX IF NOT EXISTS idx_memorization_plan_user
    ON memorization_plan (user_id);

-- ==============================================================================
-- Function: advance_ward_position
-- Called after user completes a ward session.
-- Advances fwd_surah/fwd_verse (or bwd) by the verses recited.
-- Returns the new position.
-- ==============================================================================
CREATE OR REPLACE FUNCTION advance_ward_position(
    p_user_id       UUID,
    p_side          TEXT,      -- 'forward' or 'backward'
    p_surah         INTEGER,
    p_verse_to      INTEGER,   -- last verse completed
    p_total_verses  INTEGER    -- total verses in that surah
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_side = 'forward' THEN
        IF p_verse_to >= p_total_verses THEN
            -- Completed entire surah → move to next surah, verse 1
            UPDATE memorization_plan
            SET fwd_surah   = LEAST(114, p_surah + 1),
                fwd_verse   = 1,
                updated_at  = now()
            WHERE user_id = p_user_id;
        ELSE
            -- Partial surah → advance verse pointer
            UPDATE memorization_plan
            SET fwd_verse  = p_verse_to + 1,
                updated_at = now()
            WHERE user_id = p_user_id;
        END IF;
    ELSIF p_side = 'backward' THEN
        IF p_verse_to >= p_total_verses THEN
            -- Completed entire surah (backward) → move to previous surah
            UPDATE memorization_plan
            SET bwd_surah   = GREATEST(1, p_surah - 1),
                bwd_verse   = 1,
                updated_at  = now()
            WHERE user_id = p_user_id;
        ELSE
            UPDATE memorization_plan
            SET bwd_verse  = p_verse_to + 1,
                updated_at = now()
            WHERE user_id = p_user_id;
        END IF;
    END IF;

    -- Record last ward date
    UPDATE memorization_plan
    SET last_ward_at = CURRENT_DATE
    WHERE user_id = p_user_id;
END;
$$;
