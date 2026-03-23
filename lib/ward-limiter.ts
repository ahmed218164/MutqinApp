/**
 * Ward Limiter System
 * Implements 5-Ward Limit Protocol with Random Testing
 */

import { supabase } from './supabase';
import { performRandomTest, AI_MODELS } from './ai-models';

export interface WardLimitStatus {
    shouldWarn: boolean;
    wardsToday: number;
    canContinue: boolean;
    isLocked: boolean;
    lockedUntil?: Date;
}

export interface CompletedWard {
    surah: number;
    from_ayah: number;
    to_ayah: number;
    text: string;
}

export interface RandomTestResult {
    passed: boolean;
    score: number;
    testSegment: CompletedWard;
    mistakes: any[];
    modelUsed: string;
}

/**
 * Check if user has reached 5-ward limit today
 */
export async function checkWardLimit(userId: string): Promise<WardLimitStatus> {
    try {
        // Use server-side function to check lock (prevents clock tampering)
        const { data: isLocked, error: lockError } = await supabase
            .rpc('is_user_locked_server', { p_user_id: userId });

        if (lockError) {
            console.error('Error checking lock:', lockError);
        }

        if (isLocked) {
            // Get lock details for UI display
            const { data: lockData } = await supabase
                .from('ward_locks')
                .select('locked_until')
                .eq('user_id', userId)
                .single();

            return {
                shouldWarn: false,
                wardsToday: 0,
                canContinue: false,
                isLocked: true,
                lockedUntil: lockData ? new Date(lockData.locked_until) : undefined,
            };
        }

        // Get today's completed wards count
        const { data: progressData } = await supabase
            .from('progress_logs')
            .select('wards_completed_today')
            .eq('user_id', userId)
            .gte('completion_date', new Date().toISOString().split('T')[0])
            .order('completion_date', { ascending: false });

        const wardsToday = progressData?.reduce((sum, log) => sum + (log.wards_completed_today || 0), 0) || 0;

        return {
            shouldWarn: wardsToday >= 5,
            wardsToday,
            canContinue: wardsToday < 5,
            isLocked: false,
        };
    } catch (error) {
        console.error('Error checking ward limit:', error);
        return {
            shouldWarn: false,
            wardsToday: 0,
            canContinue: true,
            isLocked: false,
        };
    }
}

/**
 * Trigger random test after 5 wards
 */
export async function triggerRandomTest(
    userId: string,
    audioBase64: string,
    completedWardsToday: CompletedWard[]
): Promise<RandomTestResult> {
    try {
        if (completedWardsToday.length === 0) {
            throw new Error('No completed wards to test');
        }

        // Call AI for random test
        const result = await performRandomTest(audioBase64, completedWardsToday);

        const passed = result.data.score >= 85;
        const testSegment = completedWardsToday[Math.floor(Math.random() * completedWardsToday.length)];

        // If failed, lock user for 24 hours
        if (!passed) {
            await lockRecitation(userId, 24);

            // Log errors to error_logs
            if (result.data.mistakes && result.data.mistakes.length > 0) {
                for (const mistake of result.data.mistakes) {
                    const verseId = `${testSegment.surah}:${testSegment.from_ayah}`;
                    await logError(userId, verseId, testSegment.surah, testSegment.from_ayah, mistake);
                }
            }
        }

        return {
            passed,
            score: result.data.score,
            testSegment,
            mistakes: result.data.mistakes || [],
            modelUsed: result.modelUsed,
        };
    } catch (error) {
        console.error('Error in random test:', error);
        throw error;
    }
}

/**
 * Lock recitation for specified hours
 */
export async function lockRecitation(userId: string, hours: number): Promise<void> {
    try {
        // Use server-side function with PostgreSQL NOW() (secure)
        const { error } = await supabase.rpc('lock_user_recitation', {
            p_user_id: userId,
            p_hours: hours,
            p_reason: '5_ward_limit_failed_test'
        });

        if (error) throw error;

        console.log(`🔒 User locked for ${hours} hours (server-side)`);
    } catch (error) {
        console.error('Error locking recitation:', error);
        throw error;
    }
}

/**
 * Unlock recitation (remove lock)
 */
export async function unlockRecitation(userId: string): Promise<void> {
    try {
        // Use server-side function for consistency
        const { error } = await supabase.rpc('unlock_user_recitation', {
            p_user_id: userId
        });

        if (error) throw error;

        console.log('🔓 User unlocked (server-side)');
    } catch (error) {
        console.error('Error unlocking recitation:', error);
        throw error;
    }
}

/**
 * Log error to error_logs table
 */
async function logError(
    userId: string,
    verseId: string,
    surahNumber: number,
    ayahNumber: number,
    mistake: any
): Promise<void> {
    try {
        // Check if error already exists
        const { data: existing } = await supabase
            .from('error_logs')
            .select('*')
            .eq('user_id', userId)
            .eq('verse_id', verseId)
            .single();

        if (existing) {
            // Increment error count
            await supabase
                .from('error_logs')
                .update({
                    error_count: existing.error_count + 1,
                    last_attempt_status: 'failed',
                    error_details: JSON.stringify(mistake),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id);
        } else {
            // Create new error log
            await supabase
                .from('error_logs')
                .insert({
                    user_id: userId,
                    verse_id: verseId,
                    surah_number: surahNumber,
                    ayah_number: ayahNumber,
                    error_count: 1,
                    last_attempt_status: 'failed',
                    error_details: JSON.stringify(mistake),
                });
        }
    } catch (error) {
        console.error('Error logging error:', error);
    }
}

/**
 * Get today's completed wards for random test
 */
export async function getTodaysCompletedWards(userId: string): Promise<CompletedWard[]> {
    try {
        const today = new Date().toISOString().split('T')[0];

        const { data: progressLogs } = await supabase
            .from('progress_logs')
            .select(`
        *,
        user_plans!inner(verses_range)
      `)
            .eq('user_id', userId)
            .gte('completion_date', today);

        if (!progressLogs || progressLogs.length === 0) {
            return [];
        }

        // Extract ward details
        const wards: CompletedWard[] = [];
        for (const log of progressLogs) {
            const versesRange = (log as any).user_plans.verses_range;
            if (versesRange) {
                wards.push({
                    surah: versesRange.surah,
                    from_ayah: versesRange.from_ayah,
                    to_ayah: versesRange.to_ayah,
                    text: '', // Will be fetched from Quran API when needed
                });
            }
        }

        return wards;
    } catch (error) {
        console.error('Error getting today\'s wards:', error);
        return [];
    }
}
