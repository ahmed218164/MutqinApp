-- ================================================================
-- SM-2 Spaced Repetition — Full Idempotent Migration
-- Safe to run multiple times on any state of the database.
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- STEP 1: Ensure review_schedule table exists with ALL base columns
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_schedule (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    surah      INTEGER NOT NULL,
    UNIQUE (user_id, surah)
);

-- Add base columns (IF NOT EXISTS — safe on any existing table)
ALTER TABLE review_schedule
    ADD COLUMN IF NOT EXISTS last_reviewed    DATE,
    ADD COLUMN IF NOT EXISTS next_review      DATE,
    ADD COLUMN IF NOT EXISTS mistake_count    INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- ────────────────────────────────────────────────────────────────
-- STEP 2: Add SM-2 columns
-- ────────────────────────────────────────────────────────────────
ALTER TABLE review_schedule
    ADD COLUMN IF NOT EXISTS efactor         NUMERIC(4,2) NOT NULL DEFAULT 2.5,
    ADD COLUMN IF NOT EXISTS sm2_interval    INTEGER      NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS sm2_repetitions INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS quality         INTEGER      CHECK (quality BETWEEN 0 AND 5);

-- ────────────────────────────────────────────────────────────────
-- STEP 3: Enable RLS (idempotent)
-- ────────────────────────────────────────────────────────────────
ALTER TABLE review_schedule ENABLE ROW LEVEL SECURITY;

-- Policies (DROP first so re-runs don't fail on "already exists")
DROP POLICY IF EXISTS "Users can view own review schedule"   ON review_schedule;
DROP POLICY IF EXISTS "Users can insert own review schedule" ON review_schedule;
DROP POLICY IF EXISTS "Users can update own review schedule" ON review_schedule;
DROP POLICY IF EXISTS "Users can delete own review schedule" ON review_schedule;

CREATE POLICY "Users can view own review schedule"
    ON review_schedule FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own review schedule"
    ON review_schedule FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own review schedule"
    ON review_schedule FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own review schedule"
    ON review_schedule FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- STEP 4: Migrate existing rows → sensible SM-2 starting values
--   Only touches rows that still have the default efactor=2.5
--   AND sm2_repetitions=0, so re-runs won't overwrite real data.
-- ────────────────────────────────────────────────────────────────
UPDATE review_schedule
SET
    efactor = CASE
                WHEN mistake_count = 0  THEN 2.5
                WHEN mistake_count <= 3 THEN 2.1
                WHEN mistake_count <= 6 THEN 1.7
                ELSE                        1.3
              END,
    sm2_interval = CASE
                     WHEN mistake_count = 0  THEN 3
                     WHEN mistake_count <= 5 THEN 2
                     ELSE                        1
                   END,
    sm2_repetitions = CASE
                        WHEN mistake_count = 0 THEN 1
                        ELSE                       0
                      END,
    quality = CASE
                WHEN mistake_count = 0  THEN 5
                WHEN mistake_count <= 3 THEN 3
                ELSE                        1
              END
WHERE efactor = 2.5
  AND sm2_repetitions = 0;

-- ────────────────────────────────────────────────────────────────
-- STEP 5: Create weekly_reports table
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    week_start  DATE NOT NULL,
    week_end    DATE NOT NULL,
    report_text TEXT NOT NULL,
    stats       JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, week_start)
);

ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own reports"   ON weekly_reports;
DROP POLICY IF EXISTS "Users can insert own reports" ON weekly_reports;

CREATE POLICY "Users can view own reports"
    ON weekly_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reports"
    ON weekly_reports FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- STEP 6: Indexes
-- ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_review_schedule_next
    ON review_schedule(user_id, next_review ASC);

CREATE INDEX IF NOT EXISTS idx_review_schedule_sm2
    ON review_schedule(user_id, next_review ASC, efactor ASC);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_week
    ON weekly_reports(user_id, week_start DESC);

-- ────────────────────────────────────────────────────────────────
-- STEP 7: update_sm2_schedule()
--   All output columns prefixed with "out_" to avoid PostgreSQL
--   name-shadowing issues with RETURNS TABLE.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_sm2_schedule(
    p_user_id UUID,
    p_surah   INTEGER,
    p_quality INTEGER   -- 0-5
)
RETURNS TABLE (
    out_next_review_date DATE,
    out_new_interval     INTEGER,
    out_new_efactor      NUMERIC,
    out_new_repetitions  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_efactor      NUMERIC(4,2) := 2.5;
    v_interval     INTEGER      := 1;
    v_repetitions  INTEGER      := 0;
    v_mistake_cnt  INTEGER      := 0;
    v_new_ef       NUMERIC(4,2);
    v_new_interval INTEGER;
    v_new_reps     INTEGER;
BEGIN
    -- Fetch current SM-2 state
    SELECT
        COALESCE(rs.efactor,         2.5),
        COALESCE(rs.sm2_interval,    1),
        COALESCE(rs.sm2_repetitions, 0),
        COALESCE(rs.mistake_count,   0)
    INTO v_efactor, v_interval, v_repetitions, v_mistake_cnt
    FROM review_schedule rs
    WHERE rs.user_id = p_user_id
      AND rs.surah   = p_surah;

    -- ── SM-2 Algorithm ──────────────────────────────────────────
    v_new_ef := v_efactor + 0.1 - (5 - p_quality) * (0.08 + (5 - p_quality) * 0.02);
    v_new_ef := GREATEST(1.3, v_new_ef);

    IF p_quality < 3 THEN
        v_new_reps     := 0;
        v_new_interval := 1;
    ELSE
        v_new_reps := v_repetitions + 1;
        v_new_interval := CASE
            WHEN v_new_reps = 1 THEN 1
            WHEN v_new_reps = 2 THEN 6
            ELSE ROUND(v_interval * v_new_ef)::INTEGER
        END;
    END IF;

    v_new_interval := GREATEST(1, LEAST(v_new_interval, 365));

    -- ── Upsert ──────────────────────────────────────────────────
    INSERT INTO review_schedule (
        user_id, surah,
        last_reviewed, next_review, mistake_count,
        efactor, sm2_interval, sm2_repetitions, quality
    ) VALUES (
        p_user_id, p_surah,
        CURRENT_DATE,
        CURRENT_DATE + v_new_interval,
        CASE WHEN p_quality < 3 THEN v_mistake_cnt + 1 ELSE 0 END,
        v_new_ef, v_new_interval, v_new_reps, p_quality
    )
    ON CONFLICT (user_id, surah) DO UPDATE SET
        last_reviewed    = CURRENT_DATE,
        next_review      = CURRENT_DATE + v_new_interval,
        mistake_count    = CASE
                             WHEN p_quality < 3 THEN review_schedule.mistake_count + 1
                             ELSE 0
                           END,
        efactor          = v_new_ef,
        sm2_interval     = v_new_interval,
        sm2_repetitions  = v_new_reps,
        quality          = p_quality;

    RETURN QUERY
    SELECT
        (CURRENT_DATE + v_new_interval)::DATE,
        v_new_interval,
        v_new_ef::NUMERIC,
        v_new_reps;
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- STEP 8: fetch_due_reviews_sm2()
--   All output columns use distinct names (no table-column shadows)
-- ────────────────────────────────────────────────────────────────
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
        (CURRENT_DATE - rs.next_review)::INTEGER AS days_overdue
    FROM review_schedule rs
    WHERE rs.user_id    = p_user_id
      AND rs.next_review IS NOT NULL
      AND rs.next_review <= CURRENT_DATE
    ORDER BY
        rs.next_review ASC,
        rs.efactor     ASC;
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (uncomment to run after migration)
-- ────────────────────────────────────────────────────────────────
-- Check new columns exist:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'review_schedule'
-- ORDER BY ordinal_position;

-- Test update_sm2_schedule (replace with a real user UUID):
-- SELECT * FROM update_sm2_schedule('YOUR-USER-UUID'::uuid, 1, 4);

-- Check due reviews:
-- SELECT * FROM fetch_due_reviews_sm2('YOUR-USER-UUID'::uuid);
