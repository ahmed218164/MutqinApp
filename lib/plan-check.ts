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
 * Returns `true` if the user has any kind of memorization plan configured.
 * On network error, returns `true` to avoid blocking the user.
 */
export async function checkHasPlan(userId: string): Promise<boolean> {
    try {
        const [userPlansResult, wardPlanResult] = await Promise.all([
            supabase
                .from('user_plans')
                .select('id')
                .eq('user_id', userId)
                .limit(1),
            supabase
                .from('memorization_plan')
                .select('id')
                .eq('user_id', userId)
                .limit(1),
        ]);

        const hasUserPlan = !!(userPlansResult.data && userPlansResult.data.length > 0);
        const hasWardPlan = !!(wardPlanResult.data && wardPlanResult.data.length > 0);
        return hasUserPlan || hasWardPlan;
    } catch {
        // On network error, don't block the user
        return true;
    }
}
