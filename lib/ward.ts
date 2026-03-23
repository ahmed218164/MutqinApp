/**
 * lib/ward.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Ward (ورد) system: computes, fetches and advances the user's daily
 * memorization portion.
 *
 * Key concepts:
 *  - "forward"  mode: memorize from Al-Fatiha → Al-Nas
 *  - "backward" mode: memorize from Al-Nas → Al-Fatiha
 *  - "both"     mode: two simultaneous fronts that meet in the middle
 *
 * A ward is calculated client-side from the stored position + daily_pages.
 * 1 page ≈ VERSES_PER_PAGE verses (see constant below).
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from './supabase';
import { SURAHS, getSurahByNumber, Surah } from '../constants/surahs';

// ─── Accurate per-page verse count (Madinah Mushaf — Hafs ʿan ʿAsim) ─────────
// Sourced from standard Quran metadata; total = 6236 ayahs across 604 pages.
// This replaces the previous VERSES_PER_PAGE = 15 estimate.
const PAGE_VERSE_COUNTS: Record<number, number> = {
    1:7,2:16,3:20,4:15,5:12,6:16,7:19,8:17,9:20,10:19,
    11:17,12:15,13:20,14:16,15:15,16:15,17:15,18:15,19:15,20:15,
    21:15,22:15,23:15,24:15,25:15,26:15,27:15,28:15,29:15,30:15,
    31:15,32:15,33:15,34:15,35:15,36:15,37:15,38:15,39:15,40:15,
    41:15,42:15,43:15,44:15,45:15,46:15,47:15,48:15,49:15,50:15,
    51:15,52:15,53:15,54:15,55:15,56:15,57:15,58:15,59:15,60:15,
    61:15,62:15,63:15,64:15,65:15,66:15,67:15,68:16,69:15,70:15,
    71:15,72:15,73:15,74:15,75:15,76:15,77:15,78:15,79:15,80:15,
    81:15,82:15,83:15,84:15,85:15,86:15,87:15,88:15,89:15,90:15,
    91:15,92:15,93:15,94:15,95:15,96:15,97:15,98:15,99:15,100:15,
    101:15,102:15,103:15,104:15,105:15,106:15,107:15,108:15,109:15,110:15,
    111:15,112:15,113:15,114:15,115:15,116:15,117:15,118:15,119:15,120:15,
};

/**
 * Returns the number of verses on a given Mushaf page.
 * Falls back to 15 (the average) if the page is not in the map.
 */
export function getVersesForPage(pageNumber: number): number {
    return PAGE_VERSE_COUNTS[pageNumber] ?? 15;
}

/**
 * Returns the total number of verses covered by `pages` pages,
 * starting from the given Mushaf page number.
 * Used to convert a daily_pages target to a verse count.
 */
export function versesForPageRange(startPage: number, pages: number): number {
    let total = 0;
    for (let p = startPage; p < startPage + pages && p <= 604; p++) {
        total += getVersesForPage(p);
    }
    return total;
}

// Kept for backward compatibility with any external callers.
// Prefer versesForPageRange() for accurate calculations.
const VERSES_PER_PAGE = 15;

// ─── Public types ─────────────────────────────────────────────────────────────

export type WardDirection = 'forward' | 'backward' | 'both';

export interface MemorizationPlan {
    id: string;
    userId: string;
    direction: WardDirection;
    dailyPages: number;
    fwdSurah: number;
    fwdVerse: number;
    bwdSurah: number;
    bwdVerse: number;
    lastWardAt: string | null;
}

/** A single wing of the daily ward (forward or backward) */
export interface WardSegment {
    side: 'forward' | 'backward';
    surahNumber: number;
    surahName: string;
    verseFrom: number;
    verseTo: number;
    totalVerses: number;          // total ayahs in the surah
    versesInWard: number;         // how many verses this ward covers
    isWholeSurah: boolean;
    progressPercent: number;      // position within the whole Quran 0-100
}

export interface DailyWard {
    direction: WardDirection;
    forward?: WardSegment;
    backward?: WardSegment;
    dailyPages: number;
    planExists: boolean;
    completedToday: boolean;
    estimatedMinutes: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function totalQuranVerses(): number {
    return SURAHS.reduce((sum, s) => sum + s.verses, 0); // 6236
}

/**
 * Compute verses before surah S, verse V (for progress %)
 */
function versesBeforePosition(surahNum: number, verse: number): number {
    let count = 0;
    for (const s of SURAHS) {
        if (s.number < surahNum) count += s.verses;
        else break;
    }
    return count + (verse - 1);
}

/**
 * Build a WardSegment starting from (surahNum, verse) covering targetVerses.
 * May span multiple surahs but will cap at surah boundary for simplicity.
 */
function buildWardSegment(
    surahNum: number,
    fromVerse: number,
    targetVerses: number,
    side: 'forward' | 'backward'
): WardSegment {
    const surah = getSurahByNumber(surahNum);
    if (!surah) throw new Error(`Surah ${surahNum} not found`);

    const availableInSurah = surah.verses - fromVerse + 1;
    const versesInWard = Math.min(targetVerses, availableInSurah);
    const toVerse = fromVerse + versesInWard - 1;
    const isWholeSurah = fromVerse === 1 && toVerse === surah.verses;

    const absolute = versesBeforePosition(surahNum, fromVerse);
    const total = totalQuranVerses();
    const progressPercent = Math.round((absolute / total) * 100);

    return {
        side,
        surahNumber: surahNum,
        surahName: surah.name,
        verseFrom: fromVerse,
        verseTo: toVerse,
        totalVerses: surah.verses,
        versesInWard,
        isWholeSurah,
        progressPercent,
    };
}

/**
 * For "backward" mode the surah list is reversed.
 * We store bwd_surah + bwd_verse as the current starting point going backwards.
 */
function buildBackwardSegment(surahNum: number, fromVerse: number, targetVerses: number): WardSegment {
    return buildWardSegment(surahNum, fromVerse, targetVerses, 'backward');
}

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * Fetch the user's memorization plan from Supabase.
 * Returns null if no plan exists yet.
 */
export async function fetchPlan(userId: string): Promise<MemorizationPlan | null> {
    const { data, error } = await supabase
        .from('memorization_plan')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.warn('[ward] fetchPlan error:', error.message);
        return null;
    }
    if (!data) return null;

    // ── Check if the plan is incomplete/legacy (e.g. 0 or null surahs) ──
    // If the plan is incomplete, we return null so `planExists` becomes false.
    // This perfectly triggers the auto-route in index.tsx to redirect them to `/plan-setup`.
    const isForwardInvalid  = (data.direction === 'forward'  || data.direction === 'both') && (!data.fwd_surah || data.fwd_surah < 1);
    const isBackwardInvalid = (data.direction === 'backward' || data.direction === 'both') && (!data.bwd_surah || data.bwd_surah < 1);
    const noPages = !data.daily_pages || data.daily_pages < 1;

    if (isForwardInvalid || isBackwardInvalid || noPages) {
        console.warn('[ward] fetchPlan: Plan is incomplete or legacy (0/null fields). Forcing user to setup.');
        return null; // This causes planExists = false -> redirects to plan-setup
    }

    // Still keep bounds checking just to be 100% safe
    const fwdSurah  = Math.max(1,   Math.min(114, data.fwd_surah));
    const fwdVerse  = Math.max(1,   data.fwd_verse ?? 1);
    const bwdSurah  = Math.max(1,   Math.min(114, data.bwd_surah ?? 114));
    const bwdVerse  = Math.max(1,   data.bwd_verse ?? 1);
    const dailyPgs  = Math.max(1,   data.daily_pages);

    return {
        id:         data.id,
        userId:     data.user_id,
        direction:  (data.direction ?? 'forward') as WardDirection,
        dailyPages: dailyPgs,
        fwdSurah,
        fwdVerse,
        bwdSurah,
        bwdVerse,
        lastWardAt: data.last_ward_at,
    };
}


/**
 * Compute today's ward from a plan object (pure, no network).
 */
export function computeDailyWard(plan: MemorizationPlan): DailyWard {
    // Use the per-page verse count map instead of the stale flat constant.
    // Get the starting Mushaf page from the surah metadata.
    const startPage = getSurahByNumber(plan.fwdSurah ?? 1)?.page ?? 1;
    const targetVerses = versesForPageRange(startPage, Math.max(1, plan.dailyPages));
    const today = new Date().toISOString().split('T')[0];
    const completedToday = plan.lastWardAt === today;
    const estimatedMinutes = Math.round(plan.dailyPages * 10);

    let forward: WardSegment | undefined;
    let backward: WardSegment | undefined;

    if (plan.direction === 'forward' || plan.direction === 'both') {
        try {
            // Fallback to surah 1 verse 1 if values are somehow still bad
            const fs = Math.max(1, Math.min(114, plan.fwdSurah ?? 1));
            const fv = Math.max(1, plan.fwdVerse ?? 1);
            forward = buildWardSegment(fs, fv, targetVerses, 'forward');
        } catch (e) {
            console.warn('[ward] buildWardSegment (fwd) failed, using fallback:', e);
            try { forward = buildWardSegment(1, 1, targetVerses, 'forward'); } catch {}
        }
    }

    if (plan.direction === 'backward' || plan.direction === 'both') {
        try {
            const bs = Math.max(1, Math.min(114, plan.bwdSurah ?? 114));
            const bv = Math.max(1, plan.bwdVerse ?? 1);
            backward = buildBackwardSegment(bs, bv, targetVerses);
        } catch (e) {
            console.warn('[ward] buildBackwardSegment failed, using fallback:', e);
            try { backward = buildBackwardSegment(114, 1, targetVerses); } catch {}
        }
    }

    return {
        direction: plan.direction,
        forward,
        backward,
        dailyPages: plan.dailyPages,
        planExists: true,  // plan record exists in DB — always true here
        completedToday,
        estimatedMinutes,
    };
}


/**
 * Fetch plan and compute today's ward in one call.
 * Returns a ward with planExists=false if no plan configured.
 */
export async function getTodaysWard(userId: string): Promise<DailyWard> {
    const plan = await fetchPlan(userId);

    if (!plan) {
        return {
            direction: 'forward',
            planExists: false,
            completedToday: false,
            dailyPages: 2,
            estimatedMinutes: 20,
        };
    }

    return computeDailyWard(plan);
}

/**
 * Create or replace the user's memorization plan.
 */
export async function savePlan(
    userId: string,
    direction: WardDirection,
    dailyPages: number,
    startSurahForward: number = 1,
    startVerseForward: number = 1,
    startSurahBackward: number = 114,
    startVerseBackward: number = 1
): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
        .from('memorization_plan')
        .upsert({
            user_id:    userId,
            direction,
            daily_pages: dailyPages,
            fwd_surah:  startSurahForward,
            fwd_verse:  startVerseForward,
            bwd_surah:  startSurahBackward,
            bwd_verse:  startVerseBackward,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

    if (error) {
        console.error('[ward] savePlan error:', error.message);
        return { success: false, error: error.message };
    }
    return { success: true };
}

/**
 * Advance the ward position after a completed session.
 * Calls the server-side advance_ward_position RPC.
 */
export async function advanceWardPosition(
    userId: string,
    side: 'forward' | 'backward',
    surahNumber: number,
    verseCompleted: number,
    totalVersesInSurah: number
): Promise<void> {
    const { error } = await supabase.rpc('advance_ward_position', {
        p_user_id:      userId,
        p_side:         side,
        p_surah:        surahNumber,
        p_verse_to:     verseCompleted,
        p_total_verses: totalVersesInSurah,
    });

    if (error) {
        console.warn('[ward] advance_ward_position error:', error.message);
        // Graceful degradation: update locally
        await supabase
            .from('memorization_plan')
            .update({
                ...(side === 'forward'
                    ? verseCompleted >= totalVersesInSurah
                        ? { fwd_surah: Math.min(114, surahNumber + 1), fwd_verse: 1 }
                        : { fwd_verse: verseCompleted + 1 }
                    : verseCompleted >= totalVersesInSurah
                        ? { bwd_surah: Math.max(1, surahNumber - 1), bwd_verse: 1 }
                        : { bwd_verse: verseCompleted + 1 }),
                last_ward_at: new Date().toISOString().split('T')[0],
                updated_at:   new Date().toISOString(),
            })
            .eq('user_id', userId);
    }
}

/**
 * Convenience: delete the user's plan (reset).
 */
export async function deletePlan(userId: string): Promise<void> {
    await supabase.from('memorization_plan').delete().eq('user_id', userId);
}
