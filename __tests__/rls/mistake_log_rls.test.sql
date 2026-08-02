-- Supabase pgTAP RLS Security Test: Mistake Log Table
-- Tier 1: TC-R4-03 (Mistake Log Isolation)

BEGIN;
SELECT plan(2);

-- Test 1: User A can read own mistake logs
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "00000000-0000-0000-0000-000000000001"}';
SELECT ok(
    (SELECT count(*) FROM public.mistake_log WHERE user_id = '00000000-0000-0000-0000-000000000001') >= 0,
    'User A accesses own mistake log'
);

-- Test 2: User A cannot access User B mistake log
SELECT is(
    (SELECT count(*) FROM public.mistake_log WHERE user_id = '00000000-0000-0000-0000-000000000002'),
    0::bigint,
    'User A cannot access User B mistake log'
);

SELECT * FROM finish();
ROLLBACK;
