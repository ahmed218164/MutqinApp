import { supabase } from './supabase';
import { sendAchievementNotification } from './notifications';

export interface Achievement {
    id: string;
    user_id: string;
    achievement_type: string;
    achievement_name: string;
    achievement_description: string;
    icon: string;
    earned_at: string;
    xp_reward: number;
}

export interface UserProgress {
    id: string;
    user_id: string;
    total_xp: number;
    level: number;
    current_streak: number;
    longest_streak: number;
    total_surahs_completed: number;
    updated_at: string;
}

export interface Challenge {
    id: string;
    user_id: string;
    challenge_type: 'daily' | 'weekly';
    challenge_name: string;
    challenge_description: string;
    target_value: number;
    current_value: number;
    xp_reward: number;
    status: 'active' | 'completed' | 'expired';
    expires_at: string;
    completed_at?: string;
    created_at: string;
}

// XP Constants
export const XP_REWARDS = {
    PAGE_COMPLETED: 10,
    SURAH_COMPLETED: 50,
    DAILY_STREAK: 5,
    PERFECT_RECITATION: 20,
    CHALLENGE_COMPLETED: 30,
    REVIEW_COMPLETED: 15,
};

// Level calculation (100 XP per level, increasing by 50 each level)
export function calculateLevel(totalXP: number): number {
    let level = 1;
    let xpNeeded = 100;
    let currentXP = totalXP;

    while (currentXP >= xpNeeded) {
        currentXP -= xpNeeded;
        level++;
        xpNeeded += 50;
    }

    return level;
}

// XP needed for next level
export function getXPForNextLevel(currentLevel: number): number {
    return 100 + (currentLevel - 1) * 50;
}

// Get current XP progress in current level
export function getCurrentLevelProgress(totalXP: number): { current: number; needed: number } {
    let level = 1;
    let xpNeeded = 100;
    let currentXP = totalXP;

    while (currentXP >= xpNeeded) {
        currentXP -= xpNeeded;
        level++;
        xpNeeded = 100 + (level - 1) * 50;
    }

    return {
        current: currentXP,
        needed: xpNeeded,
    };
}

// Award XP to user — atomic version (no race condition)
export async function awardXP(userId: string, xpAmount: number, reason: string) {
    try {
        // ── Preferred: server-side atomic increment (prevents race conditions) ──────
        // The RPC does: UPDATE user_progress SET total_xp = total_xp + p_amount
        // This is atomic at the DB level — safe for concurrent calls.
        const { data: rpcResult, error: rpcError } = await supabase.rpc('award_xp_atomic', {
            p_user_id: userId,
            p_amount:  xpAmount,
            p_reason:  reason,
        });

        if (!rpcError && rpcResult) {
            // RETURNS TABLE RPCs return an array — extract the first row
            const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
            const { new_total_xp, new_level, leveled_up } = (row ?? {}) as any;
            if (leveled_up) {
                await sendAchievementNotification(
                    `المستوى ${new_level}!`,
                    `وصلت إلى المستوى ${new_level}! 🎉`,
                    0
                );
            }
            console.log(`✅ Atomic XP +${xpAmount} → total=${new_total_xp} level=${new_level} [${reason}]`);
            return { newTotalXP: new_total_xp, newLevel: new_level, leveledUp: leveled_up };
        }

        // ── Fallback: classic read-then-write (if RPC not yet deployed) ──────────
        if (rpcError) console.warn('[awardXP] RPC unavailable, using fallback:', rpcError.message);

        const { data: progress, error: fetchError } = await supabase
            .from('user_progress')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

        const currentXP  = progress?.total_xp || 0;
        const newTotalXP = currentXP + xpAmount;
        const newLevel   = calculateLevel(newTotalXP);
        const oldLevel   = progress?.level || 1;

        const { error: updateError } = await supabase
            .from('user_progress')
            .upsert({
                user_id:    userId,
                total_xp:   newTotalXP,
                level:      newLevel,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

        if (updateError) throw updateError;

        if (newLevel > oldLevel) {
            await sendAchievementNotification(
                `المستوى ${newLevel}!`,
                `وصلت إلى المستوى ${newLevel}! 🎉`,
                0
            );
        }

        console.log(`✅ XP +${xpAmount} → total=${newTotalXP} [${reason}]`);
        return { newTotalXP, newLevel, leveledUp: newLevel > oldLevel };
    } catch (error) {
        console.error('Error awarding XP:', error);
        return null;
    }
}

// Check and award achievements — batched to avoid N+1 round-trips
export async function checkAchievements(userId: string) {
    try {
        const { data: progress } = await supabase
            .from('user_progress')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (!progress) return;

        const achievementsToAward: Array<{
            type: string;
            name: string;
            description: string;
            icon: string;
            xp: number;
        }> = [];

        // ── Streak milestones (use >= so milestones aren't missed if streak jumps) ──
        const streak = progress.current_streak ?? 0;
        if (streak >= 3) {
            achievementsToAward.push({
                type: 'streak_3',
                name: 'ثلاثة أيام متتالية',
                description: 'حافظت على سلسلة 3 أيام — أحسنت!',
                icon: '✨',
                xp: 15,
            });
        }
        if (streak >= 7) {
            achievementsToAward.push({
                type: 'streak_7',
                name: 'أسبوع من الالتزام',
                description: 'حافظت على سلسلة 7 أيام متتالية',
                icon: '🔥',
                xp: 50,
            });
        }
        if (streak >= 30) {
            achievementsToAward.push({
                type: 'streak_30',
                name: 'شهر من الإصرار',
                description: 'حافظت على سلسلة 30 يوماً متتالياً',
                icon: '💪',
                xp: 200,
            });
        }
        if (streak >= 100) {
            achievementsToAward.push({
                type: 'streak_100',
                name: 'مئة يوم من النور',
                description: 'حافظت على سلسلة 100 يوم متتالية — ما شاء الله!',
                icon: '🌟',
                xp: 1000,
            });
        }

        // ── Surah completion milestones (use >= for same reason) ─────────────────
        const surahs = progress.total_surahs_completed ?? 0;
        if (surahs >= 1) {
            achievementsToAward.push({
                type: 'first_surah',
                name: 'أول سورة',
                description: 'أتممت حفظ أول سورة',
                icon: '📖',
                xp: 100,
            });
        }
        if (surahs >= 10) {
            achievementsToAward.push({
                type: 'ten_surahs',
                name: 'عشر سور',
                description: 'أتممت حفظ 10 سور',
                icon: '⭐',
                xp: 500,
            });
        }
        if (surahs >= 30) {
            achievementsToAward.push({
                type: 'thirty_surahs',
                name: 'حافظ الجزء',
                description: 'أتممت حفظ 30 سورة',
                icon: '🏆',
                xp: 2000,
            });
        }

        // ── Batch: fetch existing achievements in ONE query, then award only new ones concurrently
        const candidateTypes = achievementsToAward.map(a => a.type);
        const { data: existingAchievements } = await supabase
            .from('achievements')
            .select('achievement_type')
            .eq('user_id', userId)
            .in('achievement_type', candidateTypes);

        const earnedTypes = new Set((existingAchievements ?? []).map(a => a.achievement_type));
        const newAchievements = achievementsToAward.filter(a => !earnedTypes.has(a.type));

        await Promise.all(newAchievements.map(achievement => awardAchievement(userId, achievement)));
    } catch (error) {
        console.error('Error checking achievements:', error);
    }
}

// Award achievement
async function awardAchievement(
    userId: string,
    achievement: {
        type: string;
        name: string;
        description: string;
        icon: string;
        xp: number;
    }
) {
    try {
        // Check if already earned
        const { data: existing } = await supabase
            .from('achievements')
            .select('id')
            .eq('user_id', userId)
            .eq('achievement_type', achievement.type)
            .single();

        if (existing) return; // Already earned

        // Insert achievement
        const { error } = await supabase
            .from('achievements')
            .insert({
                user_id: userId,
                achievement_type: achievement.type,
                achievement_name: achievement.name,
                achievement_description: achievement.description,
                icon: achievement.icon,
                xp_reward: achievement.xp,
                earned_at: new Date().toISOString(),
            });

        if (error) throw error;

        // Award XP
        await awardXP(userId, achievement.xp, `Achievement: ${achievement.name}`);

        // Send notification
        await sendAchievementNotification(
            achievement.name,
            achievement.description,
            achievement.xp
        );

        console.log(`Achievement awarded: ${achievement.name}`);
    } catch (error) {
        console.error('Error awarding achievement:', error);
    }
}

// Get user achievements
export async function getUserAchievements(userId: string): Promise<Achievement[]> {
    try {
        const { data, error } = await supabase
            .from('achievements')
            .select('*')
            .eq('user_id', userId)
            .order('earned_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting achievements:', error);
        return [];
    }
}

// Get user progress
export async function getUserProgress(userId: string): Promise<UserProgress | null> {
    try {
        const { data, error } = await supabase
            .from('user_progress')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (!data) {
            // Create initial progress
            const { data: newProgress, error: createError } = await supabase
                .from('user_progress')
                .insert({
                    user_id: userId,
                    total_xp: 0,
                    level: 1,
                    current_streak: 0,
                    longest_streak: 0,
                    total_surahs_completed: 0,
                })
                .select()
                .single();

            if (createError) throw createError;
            return newProgress;
        }

        return data;
    } catch (error) {
        console.error('Error getting user progress:', error);
        return null;
    }
}

// Update streak — safe version with same-day guard
// Returns 'incremented' | 'already_done' | 'reset' | 'error'
export async function updateStreak(userId: string): Promise<'incremented' | 'already_done' | 'reset' | 'error'> {
    try {
        const { data: progress } = await supabase
            .from('user_progress')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (!progress) return 'error';

        // Use LOCAL date (not UTC) to avoid timezone issues.
        // e.g. user in UTC+3 practicing at 23:00 local → UTC gives next day → streak breaks.
        const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local TZ
        const lastUpdateStr = progress.updated_at
            ? new Date(progress.updated_at).toLocaleDateString('en-CA')
            : null;

        // ── Guard: already updated today → skip silently ──────────────────────
        if (lastUpdateStr === todayStr) {
            console.log('[updateStreak] Already updated today — skipping.');
            return 'already_done';
        }

        // ── Detect break: last update was >1 day ago → reset streak ──────────
        let newStreak: number;
        if (lastUpdateStr) {
            const lastDate = new Date(lastUpdateStr);
            const today   = new Date(todayStr);
            const diffDays = Math.round(
                (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            // Only consecutive (diff == 1) keeps the streak; anything more resets
            newStreak = diffDays === 1 ? progress.current_streak + 1 : 1;
        } else {
            newStreak = 1; // First ever activity
        }

        const newLongestStreak = Math.max(newStreak, progress.longest_streak ?? 0);
        const result = newStreak > progress.current_streak ? 'incremented' : 'reset';

        await supabase
            .from('user_progress')
            .update({
                current_streak: newStreak,
                longest_streak: newLongestStreak,
                // updated_at acts as "last_activity_date" — keep it date-only precision
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);

        // Note: streak XP is awarded by the CALLER (recite.tsx) to avoid double-award.

        // Check for streak achievements
        await checkAchievements(userId);

        return result;
    } catch (error) {
        console.error('Error updating streak:', error);
        return 'error';
    }
}

// Create daily challenges — adaptive to the user's memorization plan
export async function createDailyChallenges(userId: string) {
    // Check if challenges already exist for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const { data: existing } = await supabase
        .from('challenges')
        .select('id')
        .eq('user_id', userId)
        .gte('created_at', todayStr)
        .eq('challenge_type', 'daily');

    if (existing && existing.length > 0) return;

    // ── Fetch user's daily_pages from their memorization plan ────────────────
    const { data: plan } = await supabase
        .from('memorization_plan')
        .select('daily_pages')
        .eq('user_id', userId)
        .maybeSingle();

    // Adaptive targets: base on the user's actual daily commitment
    // If no plan found, fall back to sensible defaults (0.5 page / 1 page)
    const dailyPages = plan?.daily_pages ?? 1;

    // Review target: 3× their daily memorization goal (minimum 1, max 10)
    const reviewTarget = Math.min(10, Math.max(1, Math.round(dailyPages * 3)));
    // Memorization target: 1 page if they do ≥1 page/day, else 0.5 (show as fraction description)
    const memTarget = Math.max(1, Math.round(dailyPages));
    const memDescription = dailyPages >= 1
        ? `احفظ ${memTarget} ${memTarget === 1 ? 'صفحة' : 'صفحات'} جديدة اليوم`
        : 'أكمل وردك اليومي من الحفظ';

    const challenges = [
        {
            challenge_type: 'daily',
            challenge_name: 'مراجعة يومية',
            challenge_description: `راجع ${reviewTarget} ${reviewTarget === 1 ? 'صفحة' : 'صفحات'} اليوم`,
            target_value: reviewTarget,
            xp_reward: 30,
        },
        {
            challenge_type: 'daily',
            challenge_name: 'حفظ جديد',
            challenge_description: memDescription,
            target_value: memTarget,
            xp_reward: 20,
        },
    ];

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    for (const challenge of challenges) {
        await supabase.from('challenges').insert({
            user_id: userId,
            ...challenge,
            current_value: 0,
            status: 'active',
            expires_at: tomorrow.toISOString(),
            created_at: new Date().toISOString(),
        });
    }
}

// Get active challenges
export async function getActiveChallenges(userId: string): Promise<Challenge[]> {
    try {
        const { data, error } = await supabase
            .from('challenges')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .gt('expires_at', new Date().toISOString()) // Only show non-expired
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting challenges:', error);
        return [];
    }
}

// Update challenge progress
export async function updateChallengeProgress(
    challengeId: string,
    progressValue: number
) {
    try {
        const { data: challenge } = await supabase
            .from('challenges')
            .select('*')
            .eq('id', challengeId)
            .single();

        if (!challenge) return;

        // Check if expired
        if (new Date(challenge.expires_at) < new Date()) return;

        const newValue = challenge.current_value + progressValue;
        const isCompleted = newValue >= challenge.target_value;

        await supabase
            .from('challenges')
            .update({
                current_value: newValue,
                status: isCompleted ? 'completed' : 'active',
                completed_at: isCompleted ? new Date().toISOString() : null,
            })
            .eq('id', challengeId);

        if (isCompleted) {
            await awardXP(
                challenge.user_id,
                challenge.xp_reward,
                `Challenge: ${challenge.challenge_name}`
            );

            await sendAchievementNotification(
                'تحدٍّ مكتمل! 🎉',
                `أتممت: ${challenge.challenge_name}`,
                challenge.xp_reward
            );
        }
    } catch (error) {
        console.error('Error updating challenge progress:', error);
    }
}
