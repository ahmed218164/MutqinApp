-- ================================================================
-- MutqinApp — trust and idempotency hardening
-- Adds event-level XP idempotency and an atomic daily log RPC.
-- Safe to re-run.
-- ================================================================

CREATE TABLE IF NOT EXISTS xp_events (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id   TEXT NOT NULL,
    reason     TEXT NOT NULL DEFAULT 'XP Award',
    amount     INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, event_id)
);

ALTER TABLE xp_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_xp_events" ON xp_events;
CREATE POLICY "users_own_xp_events"
    ON xp_events FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

ALTER TABLE daily_logs
    ADD COLUMN IF NOT EXISTS event_id TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE mistake_log
    ADD COLUMN IF NOT EXISTS event_id TEXT;

DROP FUNCTION IF EXISTS award_xp_for_event(UUID, INTEGER, TEXT, TEXT);
CREATE OR REPLACE FUNCTION award_xp_for_event(
    p_user_id  UUID,
    p_amount   INTEGER,
    p_reason   TEXT DEFAULT 'XP Award',
    p_event_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    new_total_xp   INTEGER,
    new_level      INTEGER,
    leveled_up     BOOLEAN,
    already_awarded BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_level INTEGER;
    v_total_xp  INTEGER;
    v_new_level INTEGER;
    v_rows      INTEGER := 0;
    v_inserted  BOOLEAN := FALSE;
BEGIN
    IF p_event_id IS NULL OR length(trim(p_event_id)) = 0 THEN
        RAISE EXCEPTION 'event_id is required';
    END IF;

    INSERT INTO xp_events (user_id, event_id, reason, amount)
    VALUES (p_user_id, p_event_id, COALESCE(p_reason, 'XP Award'), p_amount)
    ON CONFLICT (user_id, event_id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_inserted := v_rows > 0;

    SELECT COALESCE(level, 1)
    INTO v_old_level
    FROM user_progress
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        v_old_level := 0;
    END IF;

    IF v_inserted THEN
        INSERT INTO user_progress (
            user_id, total_xp, level, current_streak, longest_streak, total_surahs_completed
        )
        VALUES (p_user_id, p_amount, GREATEST(1, FLOOR(p_amount / 100.0)::INTEGER), 0, 0, 0)
        ON CONFLICT (user_id) DO UPDATE
            SET total_xp   = user_progress.total_xp + p_amount,
                level      = GREATEST(1, FLOOR((user_progress.total_xp + p_amount) / 100.0)::INTEGER),
                updated_at = NOW()
        RETURNING total_xp, level INTO v_total_xp, v_new_level;
    ELSE
        SELECT COALESCE(total_xp, 0), COALESCE(level, 1)
        INTO v_total_xp, v_new_level
        FROM user_progress
        WHERE user_id = p_user_id;
    END IF;

    RETURN QUERY SELECT
        COALESCE(v_total_xp, 0),
        COALESCE(v_new_level, 1),
        (COALESCE(v_new_level, 1) > v_old_level),
        NOT v_inserted;
END;
$$;

DROP FUNCTION IF EXISTS upsert_daily_log_atomic(UUID, DATE, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION upsert_daily_log_atomic(
    p_user_id       UUID,
    p_date          DATE,
    p_surah_number  INTEGER,
    p_verse_from    INTEGER,
    p_verse_to      INTEGER,
    p_pages         INTEGER,
    p_score         NUMERIC DEFAULT NULL,
    p_event_id      TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(p_user_id::TEXT || ':' || p_date::TEXT || ':' || p_surah_number::TEXT));

    SELECT id
    INTO v_log_id
    FROM daily_logs
    WHERE user_id = p_user_id
      AND date = p_date
      AND surah_number = p_surah_number
    ORDER BY created_at ASC NULLS LAST
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        UPDATE daily_logs
        SET pages_completed = COALESCE(pages_completed, 0) + GREATEST(1, COALESCE(p_pages, 1)),
            verse_from      = p_verse_from,
            verse_to        = p_verse_to,
            score           = p_score,
            event_id        = COALESCE(p_event_id, event_id),
            updated_at      = NOW()
        WHERE id = v_log_id;
    ELSE
        INSERT INTO daily_logs (
            user_id, date, surah_number, verse_from, verse_to,
            pages_completed, score, event_id, created_at, updated_at
        )
        VALUES (
            p_user_id, p_date, p_surah_number, p_verse_from, p_verse_to,
            GREATEST(1, COALESCE(p_pages, 1)), p_score, p_event_id, NOW(), NOW()
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION award_xp_for_event(UUID, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_daily_log_atomic(UUID, DATE, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT) TO authenticated;
