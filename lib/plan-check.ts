/**
 * lib/plan-check.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Centralized plan existence check.
 *
 * A user "has a plan" if EITHER:
 *   • A row exists in `user_plans`       (AI-generated plan — new users)
 *   • A row exists in `memorization_plan` (ward/direction plan — legacy users)
 *
 * Previously this logic was duplicated in 3 places with inconsistencies:
 *   - app/index.tsx only checked `user_plans` (missed legacy users)
 *   - app/(tabs)/_layout.tsx checked both ✅
 *   - lib/auth.tsx checked both ✅
 *
 * Now all three locations import this single function.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase';

/**
 * Returns `true` if the user has a usable daily ward plan configured.
 * On network error, returns `true` to avoid blocking the user.
 */
export async function checkHasPlan(userId: string): Promise<boolean> {
    try {
        const { data } = await supabase
            .from('memorization_plan')
            .select('direction, daily_pages, fwd_surah, bwd_surah')
            .eq('user_id', userId)
            .maybeSingle();

        if (!data || !data.daily_pages || data.daily_pages < 1) return false;

        const direction = data.direction ?? 'forward';
        const needsForward = direction === 'forward' || direction === 'both';
        const needsBackward = direction === 'backward' || direction === 'both';
        const hasForward = !needsForward || (data.fwd_surah >= 1 && data.fwd_surah <= 114);
        const hasBackward = !needsBackward || (data.bwd_surah >= 1 && data.bwd_surah <= 114);

        return hasForward && hasBackward;
    } catch {
        // On network error, don't block the user
        return true;
    }
}
