import { supabase } from './supabase';
import { sendReviewReminder } from './notifications';
import { getSurahByNumber } from '../constants/surahs';

const REVIEW_DAYS = 5;

export interface PlannerData {
    daysRemaining: number;
    dailyTarget: number;
    totalPagesGoal: number;
    pagesCompleted: number;
    pagesRemaining: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SM-2 Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SM-2 state per review item.
 * Mirrors the columns in the review_schedule table.
 */
export interface SM2State {
    efactor: number;         // Ease factor (1.3 – 4.0), default 2.5
    sm2_interval: number;    // Days until next review
    sm2_repetitions: number; // Consecutive successful reviews
    quality?: number;        // Last quality grade (0-5)
}

/**
 * SM-2 quality scale used to call updateReviewScheduleSM2:
 *  5 – Perfect recall with no hesitation
 *  4 – Correct with slight hesitation
 *  3 – Correct with serious difficulty
 *  2 – Wrong but answer seemed easy to recall (minor mistake)
 *  1 – Wrong with great difficulty
 *  0 – Complete blackout
 */
export type SM2Quality = 0 | 1 | 2 | 3 | 4 | 5;

/** Convert a 0-100 recitation score to the SM-2 quality scale (0-5). */
export function scoreToSM2Quality(score: number): SM2Quality {
    if (score >= 95) return 5;
    if (score >= 85) return 4;
    if (score >= 70) return 3;
    if (score >= 55) return 2;
    if (score >= 35) return 1;
    return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// SM-2 Core (pure, client-side)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure SM-2 algorithm implementation.
 * Returns the *new* SM-2 state after processing a quality response.
 *
 * Rules:
 *  - quality < 3  → failed; reset repetitions and interval to 1
 *  - repetitions 0 → 1 gets interval = 1 day
 *  - repetitions 1 → 2 gets interval = 6 days
 *  - subsequent   → interval = round(previous_interval × efactor)
 *  - efactor never drops below 1.3
 */
export function sm2(quality: SM2Quality, current: SM2State): SM2State {
    // New ease factor
    const newEF = Math.max(
        1.3,
        current.efactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    );

    if (quality < 3) {
        // Failed: restart the repetition cycle
        return {
            efactor: newEF,
            sm2_interval: 1,
            sm2_repetitions: 0,
            quality,
        };
    }

    const newRep = current.sm2_repetitions + 1;
    let newInterval: number;

    if (newRep === 1) {
        newInterval = 1;
    } else if (newRep === 2) {
        newInterval = 6;
    } else {
        newInterval = Math.round(current.sm2_interval * newEF);
    }

    // Clamp to sane range
    newInterval = Math.max(1, Math.min(newInterval, 365));

    return {
        efactor: parseFloat(newEF.toFixed(2)),
        sm2_interval: newInterval,
        sm2_repetitions: newRep,
        quality,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Planner Calculations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate daily target using the Rescue Algorithm
 * Formula: DailyTarget = (TotalRemainingPages) / (DaysRemaining - REVIEW_DAYS)
 *
 * This algorithm automatically adjusts when users miss days:
 * - If a day is missed, DaysRemaining decreases but PagesRemaining stays the same
 * - This naturally increases the DailyTarget for subsequent days
 */
export async function calculateDailyTarget(userId: string): Promise<PlannerData> {
    try {
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('target_date, total_pages_goal')
            .eq('id', userId)
            .maybeSingle();

        if (profileError) throw profileError;

        if (!profile || !profile.target_date) {
            return {
                daysRemaining: 0,
                dailyTarget: 0,
                totalPagesGoal: 604,
                pagesCompleted: 0,
                pagesRemaining: 604,
            };
        }

        const totalPagesGoal = profile.total_pages_goal || 604;

        const targetDate = new Date(profile.target_date);
        const today = new Date();
        const timeDiff = targetDate.getTime() - today.getTime();
        const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

        const { data: logs, error: logsError } = await supabase
            .from('daily_logs')
            .select('pages_completed')
            .eq('user_id', userId);

        if (logsError) throw logsError;

        const pagesCompleted = logs?.reduce((sum, log) => sum + (log.pages_completed || 0), 0) || 0;
        const pagesRemaining = totalPagesGoal - pagesCompleted;

        const effectiveDays = Math.max(1, daysRemaining - REVIEW_DAYS);
        const dailyTarget = Math.ceil(Math.max(0, pagesRemaining) / effectiveDays);

        return {
            daysRemaining: Math.max(0, daysRemaining),
            dailyTarget: Math.max(0, dailyTarget),
            totalPagesGoal,
            pagesCompleted,
            pagesRemaining: Math.max(0, pagesRemaining),
        };
    } catch (error) {
        console.error('Error calculating daily target:', error);
        return {
            daysRemaining: 0,
            dailyTarget: 0,
            totalPagesGoal: 604,
            pagesCompleted: 0,
            pagesRemaining: 604,
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SM-2 Review Scheduling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the review schedule for a surah using the SM-2 algorithm.
 *
 * Preferred path: calls the server-side `update_sm2_schedule` Postgres function
 * (which does the computation in SQL for consistency across devices).
 * Falls back to the pure client-side `sm2()` implementation if the RPC fails.
 *
 * @param userId       - authenticated user id
 * @param surahNumber  - surah that was just reviewed
 * @param score        - recitation score 0-100 (converted internally to SM-2 quality)
 */
export async function updateReviewSchedule(
    userId: string,
    surahNumber: number,
    score: number
): Promise<void> {
    const quality = scoreToSM2Quality(score);

    try {
        // ── Preferred: server-side computation (impossible to tamper) ──────────
        const { data, error } = await supabase.rpc('update_sm2_schedule', {
            p_user_id: userId,
            p_surah:   surahNumber,
            p_quality: quality,
        });

        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;
        // RPC returns out_* prefixed columns to avoid PostgreSQL name conflicts
        const nextReviewDate: string = row?.out_next_review_date ?? null;
        const interval: number       = row?.out_new_interval     ?? 1;

        console.log(
            `✅ SM-2 updated: surah=${surahNumber} quality=${quality} ` +
            `interval=${interval}d nextReview=${nextReviewDate}`
        );

        // Notify user if review is due soon
        await maybeScheduleReviewNotification(surahNumber, interval);

    } catch (rpcError) {
        console.warn('⚠️ RPC update_sm2_schedule failed, falling back to client-side SM-2:', rpcError);

        // ── Fallback: compute client-side and upsert manually ────────────────
        await updateReviewScheduleClientFallback(userId, surahNumber, quality);
    }
}

/**
 * Client-side fallback for SM-2 when the stored procedure is unavailable.
 * Reads the current state, applies sm2(), then upserts.
 */
async function updateReviewScheduleClientFallback(
    userId: string,
    surahNumber: number,
    quality: SM2Quality
): Promise<void> {
    try {
        // Fetch current state
        const { data: existing } = await supabase
            .from('review_schedule')
            .select('efactor, sm2_interval, sm2_repetitions, quality, mistake_count')
            .eq('user_id', userId)
            .eq('surah_number', surahNumber)   // ← FIXED: was 'surah'
            .maybeSingle();

        const currentState: SM2State = existing
            ? {
                efactor:         existing.efactor         ?? 2.5,
                sm2_interval:    existing.sm2_interval    ?? 1,
                sm2_repetitions: existing.sm2_repetitions ?? 0,
                quality:         existing.quality,
            }
            : { efactor: 2.5, sm2_interval: 1, sm2_repetitions: 0 };

        const newState = sm2(quality, currentState);

        const nextReview = new Date();
        nextReview.setDate(nextReview.getDate() + newState.sm2_interval);
        const nextReviewStr = nextReview.toISOString().split('T')[0];

        await supabase
            .from('review_schedule')
            .upsert(
                {
                    user_id:         userId,
                    surah_number:    surahNumber,           // ← FIXED: was 'surah'
                    last_reviewed:   new Date().toISOString().split('T')[0],
                    next_review:     nextReviewStr,
                    mistake_count:   quality < 3
                        ? (existing?.mistake_count ?? 0) + 1
                        : 0,
                    efactor:         newState.efactor,
                    sm2_interval:    newState.sm2_interval,
                    sm2_repetitions: newState.sm2_repetitions,
                    quality,
                },
                { onConflict: 'user_id,surah_number' }     // ← FIXED: was 'user_id,surah'
            );

        console.log(
            `✅ SM-2 (client fallback): surah=${surahNumber} ` +
            `quality=${quality} interval=${newState.sm2_interval}d`
        );

        await maybeScheduleReviewNotification(surahNumber, newState.sm2_interval);

    } catch (error) {
        console.error('Error in client-side SM-2 fallback:', error);
    }
}

/** Send a review reminder notification if the interval is short. */
async function maybeScheduleReviewNotification(
    surahNumber: number,
    intervalDays: number
): Promise<void> {
    if (intervalDays <= 3) {
        const surah = getSurahByNumber(surahNumber);
        await sendReviewReminder(surah?.name || `Surah ${surahNumber}`, intervalDays);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetching Due Reviews
// ─────────────────────────────────────────────────────────────────────────────

export interface DueReview {
    surah_number: number;    // renamed from 'surah' to match DB column
    next_review: string;
    efactor: number;
    sm2_repetitions: number;
    days_overdue: number;
}

/**
 * Fetch surahs due for review today, ordered by:
 *  1. Most overdue (earliest next_review first)
 *  2. Hardest items (lowest efactor first)
 *
 * Uses the server-side function `fetch_due_reviews_sm2` when available,
 * falls back to a plain client query.
 */
// Module-level cache: once we know the RPC/table is broken, stop spamming warnings.
// Reset by reloading the JS bundle (i.e. each app session starts fresh).
let _dueReviewsUnavailable = false;
let _rpcUnavailableLogged  = false;

/** Maximum number of due reviews shown per day — prevents overwhelming the user. */
const MAX_DAILY_REVIEWS = 15;

export async function fetchDueReviews(userId: string): Promise<DueReview[]> {
    // Short-circuit: if we already know neither the RPC nor the fallback table works,
    // return empty silently rather than hammering the DB on every tab focus.
    if (_dueReviewsUnavailable) return [];
    try {
        // ── Preferred: RPC with smart ordering ────────────────────────────────
        const { data, error } = await supabase.rpc('fetch_due_reviews_sm2', {
            p_user_id: userId,
        });

        if (error) throw error;
        _dueReviewsUnavailable = false; // RPC works — clear the flag
        _rpcUnavailableLogged  = false;
        // Map renamed RPC columns → DueReview interface, then cap at MAX_DAILY_REVIEWS
        const mapped = ((data as any[]) ?? []).map((row) => ({
            surah_number:    row.out_surah   ?? row.surah_number ?? row.surah,
            next_review:     row.review_date ?? row.next_review,
            efactor:         row.ease_factor ?? row.efactor ?? 2.5,
            sm2_repetitions: row.repetitions ?? row.sm2_repetitions ?? 0,
            days_overdue:    row.days_overdue ?? 0,
        })) as DueReview[];
        return mapped.slice(0, MAX_DAILY_REVIEWS);

    } catch (rpcError) {
        // Only log once per session to avoid terminal spam.
        // The error is a known DB mismatch (column name mismatch in the stored procedure)
        // and is not actionable at runtime — the client fallback handles it.
        if (!_rpcUnavailableLogged) {
            console.log('[planner] fetch_due_reviews_sm2 unavailable, using client fallback.');
            _rpcUnavailableLogged = true;
        }

        // ── Fallback: simple date comparison ──────────────────────────────────
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await supabase
                .from('review_schedule')
                .select('surah_number, next_review, efactor, sm2_repetitions')  // ← FIXED: was 'surah'
                .eq('user_id', userId)
                .lte('next_review', today)
                .order('next_review', { ascending: true })
                .limit(MAX_DAILY_REVIEWS);   // ✔ cap enforced at DB level

            if (error) {
                if (error.code === '42703' || error.code === '42P01') {
                    // Mark as unavailable so we stop retrying every render cycle.
                    // This is a DB schema issue (column missing) — not a transient network error.
                    if (!_dueReviewsUnavailable) {
                        console.log('[planner] review_schedule table/columns not available — skipping due reviews.');
                        _dueReviewsUnavailable = true;
                    }
                    return [];
                }
                throw error;
            }

            return (data ?? []).map((row) => ({
                surah_number:    row.surah_number ?? (row as any).surah ?? 0,
                next_review:     row.next_review,
                efactor:         row.efactor         ?? 2.5,
                sm2_repetitions: row.sm2_repetitions ?? 0,
                days_overdue:    Math.max(
                    0,
                    Math.floor(
                        (Date.now() - new Date(row.next_review).getTime()) /
                        (1000 * 60 * 60 * 24)
                    )
                ),
            })) as DueReview[];
        } catch (fallbackError) {
            console.error('Error fetching due reviews (fallback):', fallbackError);
            return [];
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy helpers (kept for backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Use `updateReviewSchedule()` (SM-2) instead.
 * Kept only to avoid breaking any uncommitted callers.
 */
export function calculateNextReview(mistakeCount: number): Date {
    const today = new Date();
    if (mistakeCount === 0) {
        today.setDate(today.getDate() + 3);
    } else if (mistakeCount <= 5) {
        today.setDate(today.getDate() + 2);
    } else {
        today.setDate(today.getDate() + 1);
    }
    return today;
}
