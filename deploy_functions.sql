-- ============================================
-- CRITICAL: Server-Side Lock Functions
-- Run this in Supabase SQL Editor
-- ============================================

-- Function 1: Check if user is locked (Server-side time)
CREATE OR REPLACE FUNCTION is_user_locked_server(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_locked_until TIMESTAMPTZ;
BEGIN
    SELECT locked_until INTO v_locked_until
    FROM ward_locks
    WHERE user_id = p_user_id;
    
    IF v_locked_until IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Use PostgreSQL NOW() - cannot be tampered by client
    RETURN v_locked_until > NOW();
END;
$$;

-- Function 2: Lock user recitation (Server-side time)
CREATE OR REPLACE FUNCTION lock_user_recitation(
    p_user_id UUID,
    p_hours INTEGER,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO ward_locks (user_id, locked_until, reason, created_at)
    VALUES (
        p_user_id,
        NOW() + (p_hours || ' hours')::INTERVAL, -- Server time!
        p_reason,
        NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
        locked_until = NOW() + (p_hours || ' hours')::INTERVAL,
        reason = p_reason,
        created_at = NOW();
END;
$$;

-- Function 3: Unlock user
CREATE OR REPLACE FUNCTION unlock_user_recitation(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM ward_locks WHERE user_id = p_user_id;
END;
$$;

-- Verify functions were created
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_name IN (
    'is_user_locked_server',
    'lock_user_recitation',
    'unlock_user_recitation'
)
ORDER BY routine_name;
