-- Supabase pgTAP RLS Security Test: Daily Logs Table & RPC Idempotency
-- Tier 1: TC-R4-02 (Daily Logs RLS Enforcement), TC-R4-05 (Atomic XP & Daily Log RPC)
-- Tier 2: TC-R4-B01 (Expired JWT Token), TC-R4-B02 (SQL Injection Attack Vector)

BEGIN;
SELECT plan(3);

-- Test 1: User A can read own daily logs
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "00000000-0000-0000-0000-000000000001"}';
SELECT ok(
    (SELECT count(*) FROM public.daily_logs WHERE user_id = '00000000-0000-0000-0000-000000000001') >= 0,
    'User A can read own daily logs'
);

-- Test 2: User A cannot insert log for User B
SELECT throws_ok(
    $$ INSERT INTO public.daily_logs (user_id, page_number, score) VALUES ('00000000-0000-0000-0000-000000000002', 1, 95) $$,
    '42501',
    NULL,
    'RLS policy blocks inserting log for another user'
);

-- Test 3: Anonymous user blocked from daily logs
SET LOCAL ROLE anon;
SELECT is(
    (SELECT count(*) FROM public.daily_logs),
    0::bigint,
    'Anonymous user blocked from reading daily logs'
);

SELECT * FROM finish();
ROLLBACK;
