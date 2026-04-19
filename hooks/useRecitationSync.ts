/**
 * hooks/useRecitationSync.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Encapsulates the massive saveResults() function and all related server-side
 * operations that were inlined in recite.tsx.
 *
 * Responsibilities:
 *  - Save individual mistakes to mistake_log
 *  - Upsert daily_logs (pages completed, verse range, score)
 *  - SM-2 review scheduling
 *  - XP awarding + streak management
 *  - Surah completion detection (direct + RPC cumulative)
 *  - Ward position advancement
 *  - Completion notifications + auto-navigation
 * ──────────────────────────────────────────────────────────────────────────────
 */

import * as React from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { updateReviewSchedule } from '../lib/planner';
import { awardXP, checkAchievements, updateStreak, XP_REWARDS } from '../lib/gamification';
import { sendGoalCompletionNotification } from '../lib/notifications';
import { advanceWardPosition } from '../lib/ward';
import { getSurahByNumber } from '../constants/surahs';
import type { RecitationAssessment } from '../lib/recitation-storage';
import type { Ayah } from './useSurahFetcher';

// ── Supabase Mutation Retry Helper ───────────────────────────────────────────

type SupabaseMutationFn<T> = () => Promise<{ data: T | null; error: any }>;

interface RetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    onRetry?: (attempt: number, error: any) => void;
}

const isRetryableError = (error: any): boolean => {
    if (!error) return false;
    const status = error.status ?? error.statusCode;
    if (status === 429 || status === 503) return true;
    if (status >= 500 && status < 600) return true;
    const message = error.message?.toLowerCase() ?? '';
    return message.includes('network') || message.includes('timeout') || message.includes('fetch')
        || message.includes('temporary') || message.includes('try again');
};

async function saveWithRetry<T>(
    mutationFn: SupabaseMutationFn<T>,
    options: RetryOptions = {}
): Promise<{ data: T | null; error: any; success: boolean }> {
    const { maxRetries = 3, baseDelayMs = 1000, onRetry } = options;
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await mutationFn();
            if (result.error) {
                lastError = result.error;
                if (!isRetryableError(lastError) || attempt === maxRetries) {
                    return { data: result.data, error: lastError, success: false };
                }
                onRetry?.(attempt, lastError);
            } else {
                return { data: result.data, error: null, success: true };
            }
        } catch (err: any) {
            lastError = err;
            if (!isRetryableError(lastError) || attempt === maxRetries) {
                return { data: null, error: lastError, success: false };
            }
            onRetry?.(attempt, lastError);
        }

        if (attempt < maxRetries) {
            const delay = baseDelayMs * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(() => resolve(undefined), delay));
        }
    }

    return { data: null, error: lastError, success: false };
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface RecitationSyncResult {
    saving: boolean;
    saveResults: (
        assessment: RecitationAssessment,
        opts: SaveResultsOptions
    ) => Promise<SaveOutcome>;
}

export interface SaveResultsOptions {
    userId: string;
    surahNumber: number;
    surahName: string;
    selectedRange: { from: number; to: number };
    verses: Ayah[];
    getPlanSide: () => 'forward' | 'backward';
}

export interface SaveOutcome {
    success: boolean;
    isSurahCompleted: boolean;
    hasNextSurah: boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useRecitationSync(): RecitationSyncResult {
    const [saving, setSaving] = React.useState(false);

    const saveResults = React.useCallback(async (
        assessment: RecitationAssessment,
        opts: SaveResultsOptions
    ): Promise<SaveOutcome> => {
        const { userId, surahNumber, surahName, selectedRange, verses, getPlanSide } = opts;
        setSaving(true);

        try {
            // ── Save individual mistakes ───────────────────────────────────
            if (assessment.mistakes && assessment.mistakes.length > 0) {
                const mistakesToSave = assessment.mistakes.map(mistake => ({
                    user_id: userId,
                    surah: surahNumber,
                    verse: selectedRange.from,
                    error_description: `${mistake.text} → ${mistake.correction}: ${mistake.description}`,
                    created_at: new Date().toISOString(),
                }));

                const mistakeResult = await saveWithRetry(
                    async () => {
                        const { data, error } = await supabase.from('mistake_log').insert(mistakesToSave);
                        return { data, error };
                    },
                    { maxRetries: 3, baseDelayMs: 1000 }
                );
                if (!mistakeResult.success) {
                    console.warn('[saveResults] mistake_log insert failed after retries:', mistakeResult.error?.message);
                }
            }

            // ── Save daily log with surah_number + verse range ────────────
            // Compute unique pages from actual verse data so the completion
            // detector can match against the user's real progress.
            const versePages = verses
                .filter(v => v.numberInSurah >= selectedRange.from && v.numberInSurah <= selectedRange.to)
                .map(v => v.page);
            const uniquePages = versePages.length > 0 ? new Set(versePages).size : 1;

            const today = new Date().toISOString().split('T')[0];
            const { data: existingLog } = await supabase
                .from('daily_logs')
                .select('id, pages_completed')
                .eq('user_id', userId)
                .eq('date', today)
                .eq('surah_number', surahNumber)
                .maybeSingle();

            if (existingLog) {
                const updateResult = await saveWithRetry(
                    async () => {
                        const { data, error } = await supabase.from('daily_logs').update({
                            pages_completed: (existingLog.pages_completed || 0) + uniquePages,
                            verse_from: selectedRange.from,
                            verse_to: selectedRange.to,
                            score: assessment.score ?? null,
                            updated_at: new Date().toISOString(),
                        }).eq('id', existingLog.id);
                        return { data, error };
                    },
                    { maxRetries: 3, baseDelayMs: 1000 }
                );
                if (!updateResult.success) {
                    console.warn('[saveResults] daily_logs update failed after retries:', updateResult.error?.message);
                }
            } else {
                const insertResult = await saveWithRetry(
                    async () => {
                        const { data, error } = await supabase.from('daily_logs').insert({
                            user_id: userId,
                            date: today,
                            surah_number: surahNumber,
                            verse_from: selectedRange.from,
                            verse_to: selectedRange.to,
                            pages_completed: uniquePages,
                            score: assessment.score ?? null,
                            created_at: new Date().toISOString(),
                        });
                        return { data, error };
                    },
                    { maxRetries: 3, baseDelayMs: 1000 }
                );
                if (!insertResult.success) {
                    console.warn('[saveResults] daily_logs insert failed after retries:', insertResult.error?.message);
                }
            }

            // SM-2: pass the 0-100 score — planner converts it to quality 0-5 internally
            await updateReviewSchedule(userId, surahNumber, assessment.score ?? 0);

            // ✔️ Update streak AFTER saving the daily_log (correct order)
            const streakStatus = await updateStreak(userId);
            if (streakStatus === 'incremented') {
                await awardXP(userId, XP_REWARDS.DAILY_STREAK, 'Daily Streak');
            }

            await awardXP(userId, XP_REWARDS.PAGE_COMPLETED, 'Page Recitation');

            if (!assessment.mistakes || assessment.mistakes.length === 0) {
                await awardXP(userId, XP_REWARDS.PERFECT_RECITATION, 'Perfect Recitation');
            }

            await checkAchievements(userId);

            // ── Surah completion: direct check + RPC upsert ───────────────────
            const surahData = getSurahByNumber(surahNumber);
            if (surahData && surahData.verses > 0) {
                const totalVerses = surahData.verses;

                // ── Direct single-session surah completion check ───────────
                const isDirectlyComplete = selectedRange.to >= totalVerses && selectedRange.from === 1;
                console.log(`[saveResults] Range ${selectedRange.from}–${selectedRange.to} of ${totalVerses} verses. Direct complete: ${isDirectlyComplete}`);

                // ── RPC: update cumulative progress in DB ──────────────────
                const rpcResult = await saveWithRetry(
                    async () => {
                        const { data, error } = await supabase.rpc('upsert_surah_progress', {
                            p_user_id: userId,
                            p_surah: surahNumber,
                            p_verse_from: selectedRange.from,
                            p_verse_to: selectedRange.to,
                            p_total_verses: totalVerses,
                        });
                        return { data, error };
                    },
                    { maxRetries: 3, baseDelayMs: 1000 }
                );

                const progressData = rpcResult.data ?? null;
                const progressError = rpcResult.success ? null : rpcResult.error;

                let isSurahCompleted = isDirectlyComplete; // client-side check wins
                let versesDone = selectedRange.to - selectedRange.from + 1;

                if (progressError) {
                    console.warn('[saveResults] upsert_surah_progress failed:', progressError.message);
                } else {
                    const rpcData = Array.isArray(progressData) ? progressData[0] : progressData;
                    // RPC may report completion from accumulated history
                    isSurahCompleted = isSurahCompleted || (rpcData?.out_completed ?? false);
                    versesDone = rpcData?.out_verses_done ?? versesDone;
                    console.log(`[saveResults] Surah ${surahNumber}: ${versesDone}/${totalVerses} verses (rpc_completed=${rpcData?.out_completed}, final=${isSurahCompleted})`);
                }

                if (isSurahCompleted) {
                    const side = getPlanSide();
                    console.log(`[saveResults] 🎉 Surah ${surahNumber} complete! Plan side: ${side}`);
                    await sendGoalCompletionNotification(surahName);

                    // Advance ward position in DB (plan-aware)
                    try {
                        await advanceWardPosition(userId, side, surahNumber, selectedRange.to, totalVerses);
                        console.log(`[saveResults] Ward position advanced (${side})`);
                    } catch (wardErr) {
                        console.warn('[saveResults] advanceWardPosition failed:', wardErr);
                    }

                    // Determine if there IS a next surah in this direction
                    const hasNext = side === 'backward'
                        ? surahNumber > 1    // backward: can go to surah 1
                        : surahNumber < 114; // forward: can go to surah 114

                    return { success: true, isSurahCompleted: true, hasNextSurah: hasNext };
                }
            }

            Alert.alert('تم الحفظ ✅', 'تم حفظ تقدمك! تمت إضافة نقاط XP 🎉');
            return { success: true, isSurahCompleted: false, hasNextSurah: false };
        } catch (error) {
            console.error('Error saving results:', error);
            Alert.alert('خطأ', 'فشل حفظ النتائج. يرجى المحاولة مرة أخرى.');
            return { success: false, isSurahCompleted: false, hasNextSurah: false };
        } finally {
            setSaving(false);
        }
    }, []);

    return { saving, saveResults };
}
