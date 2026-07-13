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
import { checkConnectivity } from '../lib/network';
import { offlineQueue } from '../lib/offline-queue';
import { createEventId, getLocalDay } from '../lib/date-utils';
import { successHaptic, warningHaptic } from '../lib/haptics';
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
    sessionId?: string;
}

export interface SaveOutcome {
    success: boolean;
    isSurahCompleted: boolean;
    hasNextSurah: boolean;
    localSaved?: boolean;
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
            const localDay = getLocalDay();
            const sessionEventId = opts.sessionId ?? createEventId([
                'recitation',
                userId,
                localDay,
                surahNumber,
                selectedRange.from,
                selectedRange.to,
                Date.now(),
            ]);
            const side = getPlanSide();
            const surahData = getSurahByNumber(surahNumber);
            const totalVerses = surahData?.verses ?? verses.length;
            const versePages = verses
                .filter(v => v.numberInSurah >= selectedRange.from && v.numberInSurah <= selectedRange.to)
                .map(v => v.page);
            const uniquePages = versePages.length > 0 ? new Set(versePages).size : 1;
            const isOnline = await checkConnectivity();

            if (!isOnline) {
                await offlineQueue.addRecitationEvent({
                    eventId: sessionEventId,
                    userId,
                    localDay,
                    surahNumber,
                    surahName,
                    selectedRange,
                    uniquePages,
                    score: assessment.score ?? null,
                    mistakes: assessment.mistakes ?? [],
                    side,
                    totalVerses,
                    createdAt: new Date().toISOString(),
                });
                await warningHaptic();
                Alert.alert(
                    'تم حفظ التقدم محلياً',
                    'أنت غير متصل الآن. حفظنا نتيجة التسميع على جهازك وسنزامنها عند عودة الاتصال.'
                );
                return {
                    success: true,
                    isSurahCompleted: selectedRange.from === 1 && selectedRange.to >= totalVerses,
                    hasNextSurah: side === 'backward' ? surahNumber > 1 : surahNumber < 114,
                    localSaved: true,
                };
            }

            // ── Save individual mistakes ───────────────────────────────────
            if (assessment.mistakes && assessment.mistakes.length > 0) {
                const mistakesToSave = assessment.mistakes.map(mistake => ({
                    user_id: userId,
                    surah: surahNumber,
                    verse: selectedRange.from,
                    error_description: `${mistake.text} → ${mistake.correction}: ${mistake.description}`,
                    event_id: sessionEventId,
                    created_at: new Date().toISOString(),
                }));

                const { error: mistakeError } = await supabase.from('mistake_log').insert(mistakesToSave);
                if (mistakeError) {
                    console.warn('[saveResults] mistake_log insert failed:', mistakeError.message);
                }
            }

            // ── Save daily log with surah_number + verse range ────────────
            const dailyLogResult = await saveWithRetry(
                async () => {
                    const { data, error } = await supabase.rpc('upsert_daily_log_atomic', {
                        p_user_id: userId,
                        p_date: localDay,
                        p_surah_number: surahNumber,
                        p_verse_from: selectedRange.from,
                        p_verse_to: selectedRange.to,
                        p_pages: uniquePages,
                        p_score: assessment.score ?? null,
                        p_event_id: sessionEventId,
                    });
                    return { data, error };
                },
                { maxRetries: 3, baseDelayMs: 1000 }
            );
            if (!dailyLogResult.success) {
                console.warn('[saveResults] daily log RPC failed after retries:', dailyLogResult.error?.message);
            }

            // SM-2: pass the 0-100 score — planner converts it to quality 0-5 internally
            await updateReviewSchedule(userId, surahNumber, assessment.score ?? 0);

            // ✔️ Update streak AFTER saving the daily_log (correct order)
            const streakStatus = await updateStreak(userId, localDay);
            if (streakStatus === 'incremented') {
                await awardXP(userId, XP_REWARDS.DAILY_STREAK, 'Daily Streak', `${sessionEventId}:streak`);
            }

            await awardXP(userId, XP_REWARDS.PAGE_COMPLETED, 'Page Recitation', `${sessionEventId}:page`);

            if (!assessment.mistakes || assessment.mistakes.length === 0) {
                await awardXP(userId, XP_REWARDS.PERFECT_RECITATION, 'Perfect Recitation', `${sessionEventId}:perfect`);
            }

            await checkAchievements(userId);

            // ── Surah completion: direct check + RPC upsert ───────────────────
            if (surahData && surahData.verses > 0) {
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
                    console.log(`[saveResults] 🎉 Surah ${surahNumber} complete! Plan side: ${side}`);
                    await successHaptic();
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
