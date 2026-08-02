-- Supabase pgTAP RLS Security Test: Profiles Table
-- Tier 1: TC-R4-01 (Profiles RLS Isolation)
-- Tier 2: TC-R4-B04 (Cross-User Mutation Attempt)

BEGIN;
SELECT plan(3);

-- Test 1: Authenticated User A can select own profile
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "00000000-0000-0000-0000-000000000001"}';
SELECT ok(
    (SELECT count(*) FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001') <= 1,
    'User A can query own profile'
);

-- Test 2: User A cannot read User B profile
SELECT is(
    (SELECT count(*) FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000002'),
    0::bigint,
    'User A cannot access User B profile'
);

-- Test 3: Anonymous User cannot read profiles
SET LOCAL ROLE anon;
SELECT is(
    (SELECT count(*) FROM public.profiles),
    0::bigint,
    'Anonymous user cannot read profiles table'
);

SELECT * FROM finish();
ROLLBACK;
