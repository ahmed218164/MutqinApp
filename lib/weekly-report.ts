/**
 * Weekly Report System
 * Generates a personalised Arabic AI report every Sunday,
 * stores it in weekly_reports, and sends a push notification.
 */

import { supabase } from './supabase';
import { generateWithFallback } from './ai-models';
import { AI_MODELS } from './ai-models';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WeeklyStats {
    totalPages: number;
    avgScore: number;           // 0-100
    streak: number;
    mistakesCount: number;
    topMistakeCategory: string; // 'tajweed' | 'pronunciation' | etc.
    reviewsDue: number;
    wardsCompleted: number;
    surahs: string[];           // Names of surahs visited this week
}

export interface WeeklyReport {
    id: string;
    user_id: string;
    week_start: string;         // ISO date
    week_end: string;           // ISO date
    report_text: string;        // Arabic AI-generated text
    stats: WeeklyStats;
    created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Returns ISO date string for last Sunday (start of the week). */
function getWeekStart(): string {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay()); // Sunday
    return d.toISOString().split('T')[0];
}

/** Returns ISO date string for coming Saturday (end of the week). */
function getWeekEnd(): string {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 6); // Saturday
    return d.toISOString().split('T')[0];
}

/** Returns Sunday of N weeks ago. */
function getWeeksAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() - n * 7);
    return d.toISOString().split('T')[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Collection
// ─────────────────────────────────────────────────────────────────────────────

async function collectWeeklyStats(userId: string): Promise<WeeklyStats> {
    const weekStart = getWeekStart();
    const weekEnd   = getWeekEnd();

    const [logsResult, mistakesResult, reviewsResult, progressResult] = await Promise.allSettled([
        // Daily logs this week
        supabase
            .from('daily_logs')
            .select('pages_completed, score, date')
            .eq('user_id', userId)
            .gte('date', weekStart)
            .lte('date', weekEnd),

        // Mistakes this week (from mistake_log)
        supabase
            .from('mistake_log')
            .select('mistake_type, surah_name')
            .eq('user_id', userId)
            .gte('created_at', `${weekStart}T00:00:00Z`),

        // Reviews due now
        supabase
            .from('review_schedule')
            .select('surah', { count: 'exact', head: true })
            .eq('user_id', userId)
            .lte('next_review', new Date().toISOString().split('T')[0]),

        // User progress (streak)
        supabase
            .from('user_progress')
            .select('current_streak')
            .eq('user_id', userId)
            .maybeSingle(),
    ]);

    // ── Parse logs ────────────────────────────────────────────────────────────
    const logs = logsResult.status === 'fulfilled' ? logsResult.value.data ?? [] : [];
    const totalPages  = logs.reduce((s, l) => s + (l.pages_completed ?? 0), 0);
    const scoresWithValues = logs.filter((l) => l.score != null).map((l) => l.score as number);
    const avgScore    = scoresWithValues.length
        ? Math.round(scoresWithValues.reduce((a, b) => a + b, 0) / scoresWithValues.length)
        : 0;

    // ── Parse mistakes ────────────────────────────────────────────────────────
    const mistakes    = mistakesResult.status === 'fulfilled' ? mistakesResult.value.data ?? [] : [];
    const mistakesCount = mistakes.length;

    // Find most common mistake category
    const categoryCounts: Record<string, number> = {};
    for (const m of mistakes) {
        const cat = m.mistake_type ?? 'other';
        categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
    }
    const topMistakeCategory = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';

    // Unique surahs visited
    const surahSet = new Set(mistakes.map((m) => m.surah_name).filter(Boolean));
    const surahs   = Array.from(surahSet) as string[];

    // ── Reviews due ───────────────────────────────────────────────────────────
    const reviewsDue = reviewsResult.status === 'fulfilled'
        ? (reviewsResult.value.count ?? 0)
        : 0;

    // ── Streak ────────────────────────────────────────────────────────────────
    const streak = progressResult.status === 'fulfilled'
        ? (progressResult.value.data?.current_streak ?? 0)
        : 0;

    // ── Wards this week (rows in progress_logs during this week) ─────────────
    let wardsCount = 0;
    try {
        const { count } = await supabase
            .from('progress_logs')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .gte('completion_date', `${weekStart}T00:00:00Z`);
        wardsCount = count ?? 0;
    } catch {
        // progress_logs may not exist yet — default to 0
    }

    return {
        totalPages,
        avgScore,
        streak,
        mistakesCount,
        topMistakeCategory,
        reviewsDue,
        wardsCompleted: wardsCount ?? 0,
        surahs,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Prompt Builder
// ─────────────────────────────────────────────────────────────────────────────

function buildPrompt(stats: WeeklyStats, nickname: string): string {
    const mistakeCategoryArabic: Record<string, string> = {
        tajweed:       'أحكام التجويد',
        pronunciation: 'مخارج الحروف',
        elongation:    'المد والقصر',
        waqf:          'الوقف والابتداء',
        none:          'لا يوجد',
        other:         'أخرى',
    };

    const topCatAr = mistakeCategoryArabic[stats.topMistakeCategory] ?? stats.topMistakeCategory;

    return `أنت مدرّب متخصص في حفظ القرآن الكريم، تعمل مع الطالب "${nickname}".

بناءً على أداء هذا الأسبوع، اكتب تقريراً شخصياً وتشجيعياً باللغة العربية الفصحى.

**إحصاءات الأسبوع:**
- الصفحات المكتملة: ${stats.totalPages} صفحة
- متوسط درجة التلاوة: ${stats.avgScore}/100
- سلسلة الأيام المتواصلة: ${stats.streak} يوم
- عدد الأخطاء المُسجَّلة: ${stats.mistakesCount} خطأ
- أكثر نوع خطأ تكراراً: ${topCatAr}
- السور التي واجه فيها أخطاء: ${stats.surahs.length > 0 ? stats.surahs.join('، ') : 'لا شيء'}
- المراجعات المستحقة: ${stats.reviewsDue} سورة
- الأوراد المكتملة هذا الأسبوع: ${stats.wardsCompleted} وردٍ

**تعليمات كتابة التقرير:**
1. ابدأ بتقييم عام للأسبوع (جملة أو اثنتان).
2. اذكر نقطة قوة واحدة بالتحديد (مع الاستشهاد بالأرقام).
3. اذكر نقطة تحتاج للتحسين (بلغة بنّاءة، لا نقدية).
4. قدّم توصية عملية واحدة مخصصة لأكثر نوع خطأ تكراراً.
5. اختم بجملة تحفيزية من القرآن الكريم أو الحديث الشريف تتعلق بالحفظ.

**الأسلوب:** دافئ، شخصي، مشجع. لا تتجاوز 150 كلمة.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main: Generate & Cache Report
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate (or return cached) the weekly report for a user.
 *
 * - If a report already exists for this week → return it immediately (no AI call).
 * - Otherwise → collect stats, call Gemini, save to weekly_reports, return.
 */
export async function getOrGenerateWeeklyReport(
    userId: string,
    nickname?: string,
    forceRegenerate = false
): Promise<WeeklyReport | null> {
    const weekStart = getWeekStart();

    // ── Check cache first ─────────────────────────────────────────────────────
    if (!forceRegenerate) {
        const { data: cached } = await supabase
            .from('weekly_reports')
            .select('*')
            .eq('user_id', userId)
            .eq('week_start', weekStart)
            .maybeSingle();

        if (cached) {
            console.log('📋 Weekly report loaded from cache');
            return cached as WeeklyReport;
        }
    }

    // ── Collect data ──────────────────────────────────────────────────────────
    console.log('📊 Collecting weekly stats for report...');
    const stats = await collectWeeklyStats(userId);

    // Fallback nickname
    const displayName = nickname || 'الطالب';

    // ── Call AI ───────────────────────────────────────────────────────────────
    console.log('🤖 Generating weekly report with AI...');
    try {
        const aiResult = await generateWithFallback<string>(
            AI_MODELS.PLAN_ARCHITECT,
            AI_MODELS.RANDOM_TESTER,
            buildPrompt(stats, displayName),
            { responseMimeType: 'text/plain' }
        );

        const reportText = typeof aiResult.data === 'string'
            ? aiResult.data.trim()
            : JSON.stringify(aiResult.data);

        // ── Save to DB ────────────────────────────────────────────────────────
        const weekEnd = getWeekEnd();
        const { data: saved, error: saveError } = await supabase
            .from('weekly_reports')
            .upsert(
                {
                    user_id:     userId,
                    week_start:  weekStart,
                    week_end:    weekEnd,
                    report_text: reportText,
                    stats,
                    created_at:  new Date().toISOString(),
                },
                { onConflict: 'user_id,week_start' }
            )
            .select()
            .single();

        if (saveError) {
            console.error('Error saving weekly report:', saveError);
            // Still return the text even if saving failed
            return {
                id:          'temp',
                user_id:     userId,
                week_start:  weekStart,
                week_end:    weekEnd,
                report_text: reportText,
                stats,
                created_at:  new Date().toISOString(),
            };
        }

        console.log('✅ Weekly report generated and saved');
        return saved as WeeklyReport;

    } catch (aiError) {
        console.error('AI report generation failed:', aiError);
        return null;
    }
}

/**
 * Fetch the last N weekly reports for a user (for history display).
 */
export async function getReportHistory(
    userId: string,
    limit = 4
): Promise<WeeklyReport[]> {
    const { data, error } = await supabase
        .from('weekly_reports')
        .select('*')
        .eq('user_id', userId)
        .order('week_start', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching report history:', error);
        return [];
    }
    return (data ?? []) as WeeklyReport[];
}

/**
 * Check if a report exists for the current week.
 */
export async function hasReportThisWeek(userId: string): Promise<boolean> {
    const { count } = await supabase
        .from('weekly_reports')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('week_start', getWeekStart())
        .then((r) => ({ count: r.count ?? 0 }));
    return count > 0;
}
