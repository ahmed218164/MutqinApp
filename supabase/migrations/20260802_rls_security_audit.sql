-- -----------------------------------------------------------------------------
-- 🔒 MutqinApp — Supabase RLS Security Audit Migration
-- File: supabase/migrations/20260802_rls_security_audit.sql
-- Description: Enables Row Level Security (RLS) and defines explicit access
--              control policies for public.profiles, public.daily_logs,
--              public.mistake_log, and public.qiraat_metadata.
-- -----------------------------------------------------------------------------

-- 1. Enable Row Level Security (RLS) on unshielded tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mistake_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qiraat_metadata ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. POLICIES FOR: public.profiles
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- 3. POLICIES FOR: public.daily_logs
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own daily_logs" ON public.daily_logs;
CREATE POLICY "Users can view own daily_logs"
    ON public.daily_logs
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own daily_logs" ON public.daily_logs;
CREATE POLICY "Users can insert own daily_logs"
    ON public.daily_logs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own daily_logs" ON public.daily_logs;
CREATE POLICY "Users can update own daily_logs"
    ON public.daily_logs
    FOR UPDATE
    USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 4. POLICIES FOR: public.mistake_log
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own mistake_log" ON public.mistake_log;
CREATE POLICY "Users can view own mistake_log"
    ON public.mistake_log
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own mistake_log" ON public.mistake_log;
CREATE POLICY "Users can insert own mistake_log"
    ON public.mistake_log
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own mistake_log" ON public.mistake_log;
CREATE POLICY "Users can update own mistake_log"
    ON public.mistake_log
    FOR UPDATE
    USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 5. POLICIES FOR: public.qiraat_metadata
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read for qiraat_metadata" ON public.qiraat_metadata;
CREATE POLICY "Allow public read for qiraat_metadata"
    ON public.qiraat_metadata
    FOR SELECT
    USING (true);
