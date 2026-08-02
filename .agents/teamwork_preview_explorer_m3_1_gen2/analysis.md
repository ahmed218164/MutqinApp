# Milestone 3: Supabase Database & RLS Policy Audit Report

## Executive Summary
This report presents a read-only security and structural audit of the Supabase client integration (`lib/supabase.ts`) and database migration scripts (`supabase/migrations/*.sql`) for MutqinApp. The audit targets 4 core database tables: `profiles`, `daily_logs`, `mistake_log`, and `qiraat_metadata`. 

### Key Findings:
1. **Client Setup (`lib/supabase.ts`)**: Well-configured with `AsyncStorage` persistence, URL polyfills, environment variable validation, and a custom `fetch` wrapper that enforces exponential backoff retries **only** on safe/idempotent HTTP methods (`GET`, `HEAD`, `OPTIONS`) to prevent duplicate mutating transactions.
2. **Missing Core Table Declarations & RLS Policies**:
   - `profiles`: Modified across existing migrations (`20260307`, `20260308`), but `CREATE TABLE IF NOT EXISTS profiles` and explicit RLS policy declarations (`auth.uid() = id`) are missing in migration scripts.
   - `daily_logs`: Columns appended across migrations (`20260307`, `20260308`, `20260531`), but base table creation and RLS policies (`auth.uid() = user_id`) are missing from migrations.
   - `mistake_log`: Column `event_id` added in `20260531`, but base table creation and RLS policy (`auth.uid() = user_id`) are missing from migrations.
   - `qiraat_metadata`: Table is completely absent from all existing migration scripts. Requires creation and public read-only RLS policy (`FOR SELECT USING (true)`).
3. **Actionable Deliverable**: An idempotent SQL migration script (`20260802_rls_security_audit.sql`) has been designed to resolve all missing table definitions and enforce strict RLS security policies without breaking existing data.

---

## 1. Supabase Client Integration Audit (`lib/supabase.ts`)

### Code Analysis (`lib/supabase.ts:1-61`)
```typescript
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { isNetworkError, warnNetworkOnce } from './network-errors';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('❌ Supabase configuration missing!');
}
```

### Assessment:
- **Security & Config**: Correctly checks for environment variables `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` at runtime.
- **Session Persistence**: Configured with `AsyncStorage` for React Native session persistence across app restarts, with `autoRefreshToken: true` and `detectSessionInUrl: false` (appropriate for non-web mobile target).
- **Custom Fetch Safeguard**: 
  - `customFetch` intercepts network requests and retries network failures with exponential delay (1s, 2s).
  - Crucially checks `const isSafeToRetry = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';`. Mutating methods (`POST`, `DELETE`, `PATCH`) bypass retry logic, preventing accidental duplicate XP awards or duplicate logs.

---

## 2. Table-by-Table RLS Policy Audit

| Table | Required RLS Rule | Current Migration Status | Verification / Deficiency |
|-------|-------------------|--------------------------|---------------------------|
| `profiles` | User read/write own profile (`auth.uid() = id`) | Columns altered in `20260307` and `20260308`. RLS not enabled in `.sql` scripts. | **DEFICIENT**: Base table & RLS policies missing in `supabase/migrations/`. pgTAP test `__tests__/rls/profiles_rls.test.sql` expects isolation. |
| `daily_logs` | User read/write own logs (`auth.uid() = user_id`) | Columns added in `20260307`, `20260308`, `20260531`. RLS not enabled in `.sql` scripts. | **DEFICIENT**: Base table & RLS policies missing in `supabase/migrations/`. pgTAP test `__tests__/rls/daily_logs_rls.test.sql` expects user isolation & RLS error on cross-user insert. |
| `mistake_log` | User read/write own mistakes (`auth.uid() = user_id`) | `event_id` added in `20260531`. Base table & RLS missing in `.sql` scripts. | **DEFICIENT**: Base table & RLS policies missing in `supabase/migrations/`. pgTAP test `__tests__/rls/mistake_log_rls.test.sql` expects isolation. |
| `qiraat_metadata` | Public read-only (`true` for SELECT, restricted write) | Entirely missing from all migration scripts. | **DEFICIENT**: Table does not exist in migration history. Requires creation & public SELECT policy. |

---

## 3. Existing Migration History Overview (`supabase/migrations/`)

1. **`20260307_fix_surah_progress.sql`**:
   - Added `surah_number`, `verse_from`, `verse_to`, `score` to `daily_logs`.
   - Created `surah_progress` table with RLS policy `auth.uid() = user_id`.
   - Added `current_surah` and `current_verse` to `profiles`.
   - Created RPC `upsert_surah_progress`.

2. **`20260307_memorization_plan.sql`**:
   - Created `memorization_plan` table with RLS policy `auth.uid() = user_id`.
   - Created RPC `advance_ward_position`.

3. **`20260308_fix_all.sql`**:
   - Created RPC `fetch_due_reviews_sm2` and `award_xp_atomic`.
   - Created `bookmarks` table with RLS policy `auth.uid() = user_id`.
   - Added user metrics columns to `profiles` (`nickname`, `target_date`, `total_xp`, `level`, `streak_days`, `last_active`).

4. **`20260408_comprehensive_fix.sql`**:
   - Added `surah_number` to `review_schedule`.
   - Updated RPCs `fetch_due_reviews_sm2`, `award_xp_atomic`, `advance_ward_position`, `update_sm2_schedule`.

5. **`20260531_trust_and_idempotency.sql`**:
   - Created `xp_events` table with RLS policy `auth.uid() = user_id`.
   - Added `event_id` to `daily_logs` and `mistake_log`.
   - Created RPC `award_xp_for_event` and `upsert_daily_log_atomic`.

---

## 4. Required Migration Script (`supabase/migrations/20260802_rls_security_audit.sql`)

The following SQL migration script completes the schema definitions and enforces strict, idempotent RLS policies for the 4 core tables:

```sql
-- ================================================================
-- MutqinApp — Milestone 3: RLS Security Audit & Core Tables Fix
-- Migration File: 20260802_rls_security_audit.sql
-- Description: Idempotently creates profiles, daily_logs, mistake_log, 
--              and qiraat_metadata, enables RLS, and sets security policies.
-- Safe to re-run in Supabase SQL Editor or CI/CD migrations.
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. Profiles Table & RLS
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nickname             TEXT,
    current_surah        INTEGER DEFAULT 1 CHECK (current_surah BETWEEN 1 AND 114),
    current_verse        INTEGER DEFAULT 1 CHECK (current_verse >= 1),
    total_pages_goal     INTEGER DEFAULT 604,
    target_date          DATE,
    total_xp             INTEGER NOT NULL DEFAULT 0,
    level                INTEGER NOT NULL DEFAULT 1,
    streak_days          INTEGER NOT NULL DEFAULT 0,
    last_active          DATE,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "users_own_profile" ON public.profiles;

CREATE POLICY "users_own_profile"
    ON public.profiles FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Trigger to automatically create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, nickname, created_at, updated_at)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ──────────────────────────────────────────────────────────────────
-- 2. Daily Logs Table & RLS
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_logs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date             DATE NOT NULL DEFAULT CURRENT_DATE,
    surah_number     INTEGER CHECK (surah_number BETWEEN 1 AND 114),
    verse_from       INTEGER CHECK (verse_from >= 1),
    verse_to         INTEGER CHECK (verse_to >= 1),
    pages_completed  INTEGER DEFAULT 1,
    score            NUMERIC(5,2),
    event_id         TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own daily logs" ON public.daily_logs;
DROP POLICY IF EXISTS "users_own_daily_logs" ON public.daily_logs;

CREATE POLICY "users_own_daily_logs"
    ON public.daily_logs FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON public.daily_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_surah ON public.daily_logs(user_id, surah_number);


-- ──────────────────────────────────────────────────────────────────
-- 3. Mistake Log Table & RLS
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mistake_log (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    surah_number     INTEGER NOT NULL CHECK (surah_number BETWEEN 1 AND 114),
    verse_number     INTEGER NOT NULL CHECK (verse_number >= 1),
    mistake_type     TEXT NOT NULL,
    word_index       INTEGER,
    event_id         TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.mistake_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own mistakes" ON public.mistake_log;
DROP POLICY IF EXISTS "users_own_mistakes" ON public.mistake_log;

CREATE POLICY "users_own_mistakes"
    ON public.mistake_log FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_mistake_log_user_surah ON public.mistake_log(user_id, surah_number);


-- ──────────────────────────────────────────────────────────────────
-- 4. Qiraat Metadata Table & RLS (Public Read-Only)
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qiraat_metadata (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qiraat_name      TEXT NOT NULL UNIQUE,
    description      TEXT,
    riwayat          TEXT[],
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.qiraat_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read qiraat metadata" ON public.qiraat_metadata;
DROP POLICY IF EXISTS "Service role can manage qiraat metadata" ON public.qiraat_metadata;
DROP POLICY IF EXISTS "public_read_qiraat_metadata" ON public.qiraat_metadata;
DROP POLICY IF EXISTS "service_role_manage_qiraat_metadata" ON public.qiraat_metadata;

-- Public read access for authenticated and anon users
CREATE POLICY "public_read_qiraat_metadata"
    ON public.qiraat_metadata FOR SELECT
    TO public
    USING (true);

-- Restricted write access (only service_role or admin can modify metadata)
CREATE POLICY "service_role_manage_qiraat_metadata"
    ON public.qiraat_metadata FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
```

---

## 5. Verification Plan & Test Alignment

1. **pgTAP Test Suite Execution**:
   - `__tests__/rls/profiles_rls.test.sql` (Verifies user query isolation & anon block)
   - `__tests__/rls/daily_logs_rls.test.sql` (Verifies user query isolation & blocked cross-user insert `42501`)
   - `__tests__/rls/mistake_log_rls.test.sql` (Verifies mistake log user isolation)

2. **Verification Command**:
   ```bash
   # Execute pgTAP tests using Supabase CLI
   supabase test db --path __tests__/rls/
   ```

3. **Invalidation Conditions**:
   - If any policy uses `user_id` instead of `id` on `profiles`.
   - If `qiraat_metadata` allows anonymous or authenticated write operations.
   - If any policy fails to declare both `USING` and `WITH CHECK` clauses for write operations.
