import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    SafeAreaView,
    TouchableOpacity,
    Dimensions,
    Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Settings as SettingsIcon, TrendingUp, TrendingDown, BookOpen, Flame, BarChart3, Target, Award } from 'lucide-react-native';
import { LineChart, ContributionGraph } from 'react-native-chart-kit';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { useThemeColors } from '../../constants/dynamicTheme';
import Card from '../../components/ui/Card';
import ModernBackground from '../../components/ui/ModernBackground';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import SkeletonLoader from '../../components/ui/SkeletonLoader';
import { getUserAchievements, Achievement } from '../../lib/gamification';
import BadgeCard from '../../components/gamification/BadgeCard';
import { StaggerDelay } from '../../constants/animations';
import WeeklyReportCard from '../../components/profile/WeeklyReportCard';
import {
    getOrGenerateWeeklyReport,
    WeeklyReport,
} from '../../lib/weekly-report';

interface DailyLog {
    date: string;
    pages_completed: number;
}

export default function ProfileScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const [loading, setLoading] = React.useState(true);
    const [activityData, setActivityData] = React.useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
    const [contributionData, setContributionData] = React.useState<{ date: string; count: number }[]>([]);
    const [totalPages, setTotalPages] = React.useState(0);
    const [currentStreak, setCurrentStreak] = React.useState(0);
    const [averageScore, setAverageScore] = React.useState(0);
    const [achievements, setAchievements] = React.useState<Achievement[]>([]);
    const [nickname, setNickname] = React.useState<string | null>(null);
    const [weeklyReport, setWeeklyReport] = React.useState<WeeklyReport | null>(null);
    const [reportLoading, setReportLoading] = React.useState(false);
    const [reportGenerating, setReportGenerating] = React.useState(false);
    const [weeklyComparison, setWeeklyComparison] = React.useState<{
        thisWeek: number;
        lastWeek: number;
        changePercent: number;
    }>({ thisWeek: 0, lastWeek: 0, changePercent: 0 });

    useFocusEffect(
        React.useCallback(() => {
            fetchAnalytics();
            loadWeeklyReport();
        }, [user?.id])
    );

    async function fetchAnalytics() {
        if (!user) return;

        setLoading(true);
        try {
            // ── Run two parallel queries instead of four sequential ones ─────────
            // Query 1: ALL daily_logs (full history for totals + score avg)
            // Query 2: Profile nickname
            const [logsResult, profileResult] = await Promise.all([
                supabase
                    .from('daily_logs')
                    .select('date, pages_completed, score')
                    .eq('user_id', user.id)
                    .order('date', { ascending: true }),
                supabase
                    .from('profiles')
                    .select('nickname')
                    .eq('id', user.id)
                    .maybeSingle(),
            ]);

            if (logsResult.error) throw logsResult.error;
            const allLogs = logsResult.data ?? [];

            // Set nickname from profile
            if (profileResult.data?.nickname) setNickname(profileResult.data.nickname);

            // ── Slice last 90 days for Heatmap ────────────────────────────────
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];
            const recentLogs = allLogs.filter(l => l.date >= ninetyDaysAgoStr);

            // ── Line Chart: last 7 days ───────────────────────────────────────
            const last7Days: string[] = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                last7Days.push(date.toISOString().split('T')[0]);
            }
            const chartData = last7Days.map(date => {
                const log = recentLogs.find(l => l.date === date);
                return log?.pages_completed || 0;
            });
            setActivityData(chartData);

            // ── Contribution Heatmap ──────────────────────────────────────────
            const contributions = recentLogs.map(log => ({
                date: log.date,
                count: log.pages_completed,
            }));
            if (contributions.length === 0) {
                contributions.push({ date: new Date().toISOString().split('T')[0], count: 0 });
            }
            setContributionData(contributions);

            // ── Weekly comparison ─────────────────────────────────────────────
            const today = new Date();
            const dayOfWeek = today.getDay();
            const thisWeekStart = new Date(today);
            thisWeekStart.setDate(today.getDate() - dayOfWeek);
            const lastWeekStart = new Date(thisWeekStart);
            lastWeekStart.setDate(thisWeekStart.getDate() - 7);
            const thisWeekStr = thisWeekStart.toISOString().split('T')[0];
            const lastWeekStr = lastWeekStart.toISOString().split('T')[0];

            const thisWeekPages = recentLogs
                .filter(l => l.date >= thisWeekStr)
                .reduce((sum, l) => sum + (l.pages_completed || 0), 0);
            const lastWeekPages = recentLogs
                .filter(l => l.date >= lastWeekStr && l.date < thisWeekStr)
                .reduce((sum, l) => sum + (l.pages_completed || 0), 0);
            const changePercent = lastWeekPages > 0
                ? Math.round(((thisWeekPages - lastWeekPages) / lastWeekPages) * 100)
                : thisWeekPages > 0 ? 100 : 0;
            setWeeklyComparison({ thisWeek: thisWeekPages, lastWeek: lastWeekPages, changePercent });

            // ── Total pages (all history) ─────────────────────────────────────
            const total = allLogs.reduce((sum, log) => sum + (log.pages_completed || 0), 0);
            setTotalPages(total);

            // ── Streak ────────────────────────────────────────────────────────
            // calculateStreak only needs date + pages_completed
            const streak = calculateStreak(allLogs as DailyLog[]);
            setCurrentStreak(streak);

            // ── Average score (filter nulls) ──────────────────────────────────
            const scoreLogs = allLogs.filter(l => l.score != null);
            if (scoreLogs.length > 0) {
                const avgScore = Math.round(
                    scoreLogs.reduce((sum, log) => sum + (log.score || 0), 0) / scoreLogs.length
                );
                setAverageScore(avgScore);
            } else {
                setAverageScore(0);
            }

            // ── Achievements ──────────────────────────────────────────────────
            const userAchievements = await getUserAchievements(user.id);
            setAchievements(userAchievements);
        } catch (error) {
            console.error('Error fetching analytics:', error);
        } finally {
            setLoading(false);
        }
    }

    async function loadWeeklyReport(forceRegenerate = false) {
        if (!user) return;
        if (forceRegenerate) {
            setReportGenerating(true);
        } else {
            setReportLoading(true);
        }
        try {
            // ✔️ Use nickname already in state — no extra Supabase query needed
            const report = await getOrGenerateWeeklyReport(
                user.id,
                nickname ?? undefined,
                forceRegenerate
            );
            setWeeklyReport(report);
            if (forceRegenerate && !report) {
                Alert.alert('خطأ', 'فشل توليد التقرير. يرجى المحاولة مرة أخرى.');
            }
        } catch (e) {
            console.error('Error loading weekly report:', e);
        } finally {
            setReportLoading(false);
            setReportGenerating(false);
        }
    }

    function calculateStreak(logs: DailyLog[]): number {
        // Use streak from gamification system (user_progress table) as primary.
        // This is a fallback for when the gamification data hasn't loaded yet.
        if (logs.length === 0) return 0;
        let streak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < 365; i++) {
            const checkDate = new Date(today);
            checkDate.setDate(checkDate.getDate() - i);
            const dateStr = checkDate.toLocaleDateString('en-CA'); // Local timezone

            const hasActivity = logs.some(log => log.date === dateStr && log.pages_completed > 0);
            if (hasActivity) {
                streak++;
            } else if (i > 0) {
                break;
            }
        }
        return streak;
    }

    const dayLabels = ['اث', 'ثل', 'أر', 'خم', 'جم', 'سب', 'أح'];

    return (
        <View style={styles.container}>
            <ModernBackground />
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        {/* Avatar initials circle */}
                        <View style={styles.avatarContainer}>
                            <LinearGradient
                                colors={['#d4af37', '#b8941e']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={StyleSheet.absoluteFill}
                            />
                            <Text style={styles.avatarText}>
                                {(nickname || user?.email || 'U').charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        <View>
                            <Text style={styles.title}>
                                {nickname || 'ملفي'}
                            </Text>
                            <Text style={styles.subtitle}>{user?.email || ''}</Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={styles.settingsButton}
                        onPress={() => router.push('/settings')}
                    >
                        <SettingsIcon color={Colors.text.inverse} size={24} />
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                    {loading ? (
                        <>
                            <Card style={styles.chartCard} variant="glass">
                                <SkeletonLoader width="40%" height={24} style={{ marginBottom: Spacing.lg, alignSelf: 'flex-start' }} />
                                <SkeletonLoader width={Dimensions.get('window').width - 64} height={220} borderRadius={BorderRadius.lg} />
                            </Card>
                            <View style={styles.statsGrid}>
                                <Card style={styles.statCard} variant="glass">
                                    <SkeletonLoader width={40} height={40} borderRadius={20} style={{ marginBottom: Spacing.md }} />
                                    <SkeletonLoader width="60%" height={32} style={{ marginBottom: Spacing.xs }} />
                                    <SkeletonLoader width="80%" height={16} />
                                </Card>
                                <Card style={styles.statCard} variant="glass">
                                    <SkeletonLoader width={40} height={40} borderRadius={20} style={{ marginBottom: Spacing.md }} />
                                    <SkeletonLoader width="60%" height={32} style={{ marginBottom: Spacing.xs }} />
                                    <SkeletonLoader width="80%" height={16} />
                                </Card>
                            </View>
                        </>
                    ) : (
                        <>
                            {/* Weekly Report Card */}
                            <WeeklyReportCard
                                report={weeklyReport}
                                loading={reportLoading}
                                onGenerate={() => loadWeeklyReport(true)}
                                isGenerating={reportGenerating}
                            />

                            {/* Activity Chart */}
                            <Card style={styles.chartCard} variant="glassDark" animated={true} delay={StaggerDelay * 0}>
                                <Text style={styles.cardTitle}>نشاط 7 أيام</Text>
                                <LineChart
                                    data={{
                                        labels: dayLabels,
                                        datasets: [{ data: activityData }]
                                    }}
                                    width={Dimensions.get('window').width - 64}
                                    height={220}
                                    chartConfig={{
                                        backgroundColor: 'transparent',
                                        backgroundGradientFrom: 'transparent',
                                        backgroundGradientTo: 'transparent',
                                        decimalPlaces: 0,
                                        color: (opacity = 1) => `rgba(212, 175, 55, ${opacity})`,
                                        labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                                        style: { borderRadius: BorderRadius.lg },
                                        propsForDots: {
                                            r: '6',
                                            strokeWidth: '2',
                                            stroke: Colors.gold[600],
                                        },
                                    }}
                                    bezier
                                    style={styles.chart}
                                />
                            </Card>

                            {/* Quran Completion Ring */}
                            <Card style={styles.completionCard} variant="glassDark" animated={true} delay={StaggerDelay * 1}>
                                <View style={styles.completionRow}>
                                    <View style={styles.completionRing}>
                                        <View style={styles.completionRingBg}>
                                            <View style={[
                                                styles.completionRingFill,
                                                { width: `${Math.min(100, Math.round((totalPages / 604) * 100))}%` },
                                            ]} />
                                        </View>
                                        <Text style={styles.completionPercent}>
                                            {Math.round((totalPages / 604) * 100)}%
                                        </Text>
                                    </View>
                                    <View style={styles.completionInfo}>
                                        <Text style={styles.completionTitle}>إتمام القرآن</Text>
                                        <Text style={styles.completionSubtitle}>
                                            {totalPages} من 604 صفحة
                                        </Text>
                                    </View>
                                </View>
                            </Card>

                            {/* Summary Cards — 2×2 grid */}
                            <View style={styles.statsGrid}>
                                <Card style={styles.statCard} variant="glass" animated={true} delay={StaggerDelay * 2}>
                                    <View style={styles.statIcon}>
                                        <BookOpen color={Colors.emerald[400]} size={28} />
                                    </View>
                                    <Text style={styles.statNumber}>{totalPages}</Text>
                                    <Text style={styles.statLabel}>مجموع الصفحات</Text>
                                </Card>

                                <Card style={styles.statCard} variant="glass" animated={true} delay={StaggerDelay * 2}>
                                    <View style={styles.statIcon}>
                                        <Flame color={Colors.gold[400]} size={28} />
                                    </View>
                                    <Text style={styles.statNumber}>{currentStreak}</Text>
                                    <Text style={styles.statLabel}>سلسلة الأيام</Text>
                                </Card>
                            </View>

                            <View style={styles.statsGrid}>
                                <Card style={styles.statCard} variant="glass" animated={true} delay={StaggerDelay * 3}>
                                    <View style={styles.statIcon}>
                                        <Target color={Colors.emerald[400]} size={28} />
                                    </View>
                                    <Text style={styles.statNumber}>
                                        {averageScore > 0 ? `${averageScore}%` : '—'}
                                    </Text>
                                    <Text style={styles.statLabel}>متوسط التقييم</Text>
                                </Card>

                                <Card style={styles.statCard} variant="glass" animated={true} delay={StaggerDelay * 3}>
                                    <View style={styles.statIcon}>
                                        <Award color={Colors.gold[400]} size={28} />
                                    </View>
                                    <Text style={styles.statNumber}>{achievements.length}</Text>
                                    <Text style={styles.statLabel}>شارات مكتسبة</Text>
                                </Card>
                            </View>

                            {/* Weekly Performance Comparison */}
                            <Card style={styles.weeklyCard} variant="glass" animated={true} delay={StaggerDelay * 3}>
                                <View style={styles.weeklyHeader}>
                                    <BarChart3 color={Colors.emerald[400]} size={22} />
                                    <Text style={[styles.cardTitle, { marginBottom: 0, marginRight: Spacing.sm }]}>مقارنة أسبوعية</Text>
                                </View>
                                <View style={styles.weeklyBars}>
                                    <View style={styles.weeklyBarContainer}>
                                        <View style={styles.barWrap}>
                                            <View style={[
                                                styles.bar,
                                                styles.barLastWeek,
                                                { height: Math.max(8, Math.min(120, Math.round(120 * (weeklyComparison.lastWeek / Math.max(weeklyComparison.lastWeek, weeklyComparison.thisWeek, 1))))) },
                                            ]} />
                                        </View>
                                        <Text style={styles.barValue}>{weeklyComparison.lastWeek}</Text>
                                        <Text style={styles.barLabel}>الأسبوع الماضي</Text>
                                    </View>
                                    <View style={styles.weeklyBarContainer}>
                                        <View style={styles.barWrap}>
                                            <View style={[
                                                styles.bar,
                                                styles.barThisWeek,
                                                { height: Math.max(8, Math.min(120, Math.round(120 * (weeklyComparison.thisWeek / Math.max(weeklyComparison.lastWeek, weeklyComparison.thisWeek, 1))))) },
                                            ]} />
                                        </View>
                                        <Text style={styles.barValue}>{weeklyComparison.thisWeek}</Text>
                                        <Text style={styles.barLabel}>هذا الأسبوع</Text>
                                    </View>
                                </View>
                                <View style={[
                                    styles.changeIndicator,
                                    { backgroundColor: weeklyComparison.changePercent >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)' },
                                ]}>
                                    {weeklyComparison.changePercent >= 0 ? (
                                        <TrendingUp color={Colors.success} size={16} />
                                    ) : (
                                        <TrendingDown color={Colors.error} size={16} />
                                    )}
                                    <Text style={[
                                        styles.changeText,
                                        { color: weeklyComparison.changePercent >= 0 ? Colors.success : Colors.error },
                                    ]}>
                                        {weeklyComparison.changePercent >= 0 ? '+' : ''}{weeklyComparison.changePercent}% صفحات
                                    </Text>
                                </View>
                            </Card>

                            {/* Contribution Heatmap */}
                            <Card style={styles.chartCard} variant="glassDark" animated={true} delay={StaggerDelay * 4}>
                                <Text style={styles.cardTitle}>خريطة النشاط</Text>
                                {/* try/catch guard: ContributionGraph crashes if values is empty or malformed */}
                                {contributionData.length > 0 ? (
                                    <React.Fragment>
                                        {(() => {
                                            try {
                                                return (
                                    <ContributionGraph
                                        values={contributionData}
                                        endDate={new Date()}
                                        numDays={90}
                                        width={Dimensions.get('window').width - 64}
                                        height={220}
                                        chartConfig={{
                                            backgroundColor: 'transparent',
                                            backgroundGradientFrom: 'transparent',
                                            backgroundGradientTo: 'transparent',
                                            color: (opacity = 1) => `rgba(20, 184, 166, ${opacity})`,
                                            labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                                            style: { borderRadius: BorderRadius.lg },
                                            propsForDots: {
                                                r: '6',
                                                strokeWidth: '2',
                                                stroke: Colors.gold[600],
                                            },
                                        }}
                                        tooltipDataAttrs={() => ({} as any)}
                                    />
                                                );
                                            } catch {
                                                return (
                                    <View style={{ height: 120, alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: Colors.text.tertiary, fontSize: Typography.fontSize.sm }}>
                                            تعذر عرض خريطة النشاط
                                        </Text>
                                    </View>
                                                );
                                            }
                                        })()}
                                    </React.Fragment>
                                ) : (
                                    <View style={{ height: 120, alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: Colors.text.tertiary, fontSize: Typography.fontSize.sm }}>
                                            ابدأ تسميعك ليظهر نشاطك هنا 🌱
                                        </Text>
                                    </View>
                                )}
                            </Card>

                            {/* Badges Section */}
                            {achievements.length > 0 && (
                                <View style={styles.badgesSection}>
                                    <Text style={styles.sectionTitle}>🏆 شاراتي المكتسبة</Text>
                                    {achievements.map((achievement, index) => (
                                        <BadgeCard
                                            key={achievement.id}
                                            icon={achievement.icon}
                                            name={achievement.achievement_name}
                                            description={achievement.achievement_description}
                                            xpReward={achievement.xp_reward}
                                            earnedAt={achievement.earned_at}
                                        // delay={StaggerDelay * (5 + index)} // Ensure BadgeCard accepts delay if implementing stagger
                                        />
                                    ))}
                                </View>
                            )}
                        </>
                    )}
                    <View style={{ height: 100 }} />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.neutral[950],
    },
    safeArea: {
        flex: 1,
    },
    header: {
        padding: Spacing.xl,
        paddingTop: Spacing['3xl'],
        paddingBottom: Spacing.md,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        fontSize: Typography.fontSize['3xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.xs,
    },
    subtitle: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.tertiary,
    },
    settingsButton: {
        padding: Spacing.sm,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: BorderRadius.full,
    },
    content: {
        flex: 1,
        padding: Spacing.lg,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    chartCard: {
        marginBottom: Spacing.lg,
        alignItems: 'center',
    },
    cardTitle: {
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.lg,
        alignSelf: 'flex-start',
    },
    chart: {
        marginVertical: Spacing.md,
        borderRadius: BorderRadius.lg,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: Spacing.lg,
        gap: Spacing.md,
    },
    statCard: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: Spacing.xl,
    },
    statCardFull: {
        alignItems: 'center',
        paddingVertical: Spacing.xl,
        marginBottom: Spacing['2xl'],
    },
    statIcon: {
        marginBottom: Spacing.md,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        padding: Spacing.sm,
        borderRadius: BorderRadius.full,
    },
    statNumber: {
        fontSize: Typography.fontSize['3xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.xs,
    },
    statLabel: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
    },
    // Completion card
    completionCard: {
        marginBottom: Spacing.lg,
    },
    completionRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: Spacing.lg,
    },
    completionRing: {
        alignItems: 'center' as const,
        gap: Spacing.xs,
    },
    completionRingBg: {
        width: 100,
        height: 10,
        borderRadius: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        overflow: 'hidden' as const,
    },
    completionRingFill: {
        height: '100%' as any,
        borderRadius: 5,
        backgroundColor: Colors.emerald[500],
    },
    completionPercent: {
        fontSize: Typography.fontSize['3xl'],
        fontWeight: Typography.fontWeight.extrabold,
        color: Colors.emerald[400],
    },
    completionInfo: {
        flex: 1,
    },
    completionTitle: {
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: 2,
    },
    completionSubtitle: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
    },
    badgesSection: {
        marginBottom: Spacing['2xl'],
    },
    sectionTitle: {
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.md,
    },
    weeklyCard: {
        marginBottom: Spacing.lg,
        padding: Spacing.lg,
    },
    weeklyHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    weeklyBars: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-around',
        height: 160,
        paddingBottom: Spacing.md,
        marginBottom: Spacing.md,
    },
    weeklyBarContainer: {
        alignItems: 'center',
        flex: 1,
    },
    barWrap: {
        height: 120,
        width: 40,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: BorderRadius.full,
        justifyContent: 'flex-end',
        overflow: 'hidden',
        marginBottom: Spacing.sm,
    },
    bar: {
        width: '100%',
        borderRadius: BorderRadius.full,
    },
    barLastWeek: {
        backgroundColor: Colors.neutral[600],
    },
    barThisWeek: {
        backgroundColor: Colors.emerald[500],
    },
    barValue: {
        fontSize: Typography.fontSize.base,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: 2,
    },
    barLabel: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
    },
    changeIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.sm,
        borderRadius: BorderRadius.lg,
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        marginTop: Spacing.sm,
    },
    changeText: {
        marginRight: Spacing.xs,  // RTL: was marginLeft
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.semibold,
    },
    // Avatar circle
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    avatarContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(212, 175, 55, 0.4)',
        shadowColor: Colors.gold[400],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
    },
    avatarText: {
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.extrabold,
        color: Colors.emerald[950],
        letterSpacing: 0,
    },
});

