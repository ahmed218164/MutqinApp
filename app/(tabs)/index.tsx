import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    Platform,
    StatusBar,
    ActivityIndicator,
    TouchableOpacity
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import { TrendingUp, BookOpen, Clock, AlertCircle, Zap, Search, Sparkles, Radio } from 'lucide-react-native';
import MissingWordsModal from '../../components/challenges/MissingWordsModal';
import LiveMuaalemModal from '../../components/recite/LiveMuaalemModal';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSequence,
    withSpring,
    withRepeat,
    interpolate,
    Easing,
} from 'react-native-reanimated';

import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import Card from '../../components/ui/Card';
import ModernBackground from '../../components/ui/ModernBackground';
import GreetingSection from '../../components/dashboard/GreetingSection';
import StatsBento from '../../components/dashboard/StatsBento';
import NarrationSwitcher from '../../components/dashboard/NarrationSwitcher';
import DailyTipCard from '../../components/dashboard/DailyTipCard';
import TodayFocusStrip from '../../components/dashboard/TodayFocusStrip';
import { calculateDailyTarget, PlannerData, fetchDueReviews } from '../../lib/planner';
import { getTodaysWard, DailyWard } from '../../lib/ward';
import { supabase } from '../../lib/supabase';
import SkeletonLoader from '../../components/ui/SkeletonLoader';
import EmptyState from '../../components/ui/EmptyState';
import GradientButton from '../../components/ui/GradientButton';
import ChallengeCard from '../../components/gamification/ChallengeCard';
import { getUserProgress, getActiveChallenges, createDailyChallenges, Challenge, UserProgress } from '../../lib/gamification';
import { useAuth } from '../../lib/auth';
import { getSurahByNumber } from '../../constants/surahs';
import { scheduleDailyReminder, getNotificationSettings } from '../../lib/notifications';
import { StaggerDelay } from '../../constants/animations';

const RECOVERY_REVIEW_THRESHOLD = 8;

// ── Staggered fade-in-up container ──────────────────────────────────────────
function StaggerIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(22);

    React.useEffect(() => {
        const t = setTimeout(() => {
            opacity.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) });
            translateY.value = withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) });
        }, delay);
        return () => clearTimeout(t);
    }, [delay]);

    const style = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    return <Animated.View style={style}>{children}</Animated.View>;
}

// ── Animated progress bar (no shimmer loop) ───────────────────────────────────────
function AnimatedProgressBar({ progress, gradientColors }: { progress: number; gradientColors: string[] }) {
    const widthAnim = useSharedValue(0);

    React.useEffect(() => {
        widthAnim.value = withSpring(progress, { damping: 20, stiffness: 90 });
    }, [progress]);

    const barStyle = useAnimatedStyle(() => ({
        width: `${widthAnim.value}%`,
    }));

    return (
        <View style={progressStyles.bg}>
            <Animated.View style={[progressStyles.fill, barStyle]}>
                <LinearGradient
                    colors={gradientColors as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                />
            </Animated.View>
        </View>
    );
}

const progressStyles = StyleSheet.create({
    bg: {
        height: 10,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: BorderRadius.full,
        overflow: 'hidden',
        marginBottom: Spacing.sm,
    },
    fill: {
        height: '100%',
        borderRadius: BorderRadius.full,
        overflow: 'hidden',
    },
});

// ── Daily Ward Card ───────────────────────────────────────────────────────────
interface DailyWardCardProps {
    ward: import('../../lib/ward').DailyWard | null;
    accentColor: string;
    isHafs: boolean;
    heroGradientColors: readonly [string, string, string, string];
    onStart: (surahNum: number, surahName: string, verseFrom: number, verseTo: number) => void;
    onSetupPlan: () => void;
}

function DailyWardCard({ ward, accentColor, isHafs, heroGradientColors, onStart, onSetupPlan }: DailyWardCardProps) {
    // No plan yet
    if (!ward || !ward.planExists) {
        return (
            <View style={styles.heroCardWrapper}>
                <LinearGradient
                    colors={[Colors.neutral[900], Colors.neutral[800], Colors.neutral[900]]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.heroCardInner}>
                    <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: Spacing.md }}>📖</Text>
                    <Text style={[styles.focusSurah, { textAlign: 'center', marginBottom: Spacing.sm }]}>
                        لم تُعدَّ خطة الحفظ بعد
                    </Text>
                    <Text style={[styles.progressText, { textAlign: 'center', marginBottom: Spacing.lg }]}>
                        حدِّد طريقتك واهدافك لتبدأ ورداً يومياً منظماً
                    </Text>
                    <GradientButton
                        title="إعداد خطة الحفظ 🚀"
                        onPress={onSetupPlan}
                        style={styles.startButton}
                        colors={isHafs ? Colors.gradients.primary : Colors.gradients.gold}
                    />
                </View>
            </View>
        );
    }

    const fwd  = ward.forward;
    const bwd  = ward.backward;
    const main = fwd ?? bwd;  // Primary segment

    if (!main) return null;

    const verseRangeLabel = main.isWholeSurah
        ? 'كامل السورة'
        : `آية ${main.verseFrom} – ${main.verseTo}`;

    const completedStyle = ward.completedToday
        ? { borderColor: Colors.emerald[400], opacity: 0.7 }
        : {};

    return (
        <View style={[styles.heroCardWrapper, completedStyle]}>
            <LinearGradient
                colors={heroGradientColors}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            {Platform.OS !== 'android' ? (
                <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            ) : null}
            <View style={styles.heroCardInner}>
                {/* Ward completed badge */}
                {ward.completedToday && (
                    <View style={styles.completedBadge}>
                        <Text style={styles.completedBadgeText}>✅ أتممت ورد اليوم!</Text>
                    </View>
                )}

                {/* Header */}
                <View style={styles.focusHeader}>
                    <View style={styles.focusHeaderLeft}>
                        <View style={styles.focusLabelRow}>
                            <View style={[styles.focusLabelDot, { backgroundColor: accentColor }]} />
                            <Text style={[styles.focusLabel, { color: accentColor }]}>
                                {ward.direction === 'forward' ? '📖 من الأول' :
                                 ward.direction === 'backward' ? '📖 من الآخر' : '📖 من الطرفين'}
                            </Text>
                        </View>
                        <Text style={styles.focusSurah}>{main.surahName}</Text>
                        <Text style={[styles.focusDetailText, { color: accentColor, marginTop: 2 }]} maxFontSizeMultiplier={1.3}>
                            {verseRangeLabel}
                        </Text>
                    </View>
                    <View style={[styles.focusIconCircle, { borderColor: accentColor + '40', backgroundColor: accentColor + '15' }]}>
                        <BookOpen color={accentColor} size={22} />
                    </View>
                </View>

                {/* Details row */}
                <View style={[styles.focusDetails, { marginTop: Spacing.md }]}>
                    <View style={styles.focusDetailChip}>
                        <BookOpen size={13} color={accentColor} />
                        <Text style={[styles.focusDetailText, { color: accentColor }]}>
                            {ward.dailyPages} {ward.dailyPages === 1 ? 'صفحة' : 'صفحات'}
                        </Text>
                    </View>
                    <View style={styles.focusDetailChip}>
                        <Clock size={13} color={Colors.text.tertiary} />
                        <Text style={styles.focusDetailText}>~{ward.estimatedMinutes} دق</Text>
                    </View>
                    <View style={styles.focusDetailChip}>
                        <TrendingUp size={13} color={Colors.text.tertiary} />
                        <Text style={styles.focusDetailText}>{main.progressPercent}% من القرآن</Text>
                    </View>
                </View>

                {/* 3-Pillar Quranic Plan Badges */}
                <View style={{ flexDirection: 'row-reverse', gap: 6, marginVertical: Spacing.sm, flexWrap: 'wrap' }}>
                    {ward.alJadeed ? (
                        <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Colors.emerald[500] }}>
                            <Text style={{ color: Colors.emerald[500], fontSize: 12, fontWeight: '700' }}>
                                🟢 الجديد: {ward.alJadeed.surahName}
                            </Text>
                        </View>
                    ) : null}
                    {ward.alQareeb ? (
                        <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Colors.gold[500] }}>
                            <Text style={{ color: Colors.gold[500], fontSize: 12, fontWeight: '700' }}>
                                🟡 الصغرى: {ward.alQareeb.surahName}
                            </Text>
                        </View>
                    ) : null}
                    {ward.alBaeed ? (
                        <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: Colors.error }}>
                            <Text style={{ color: '#f87171', fontSize: 12, fontWeight: '700' }}>
                                🔴 الكبرى: {ward.alBaeed.surahName}
                            </Text>
                        </View>
                    ) : null}
                </View>

                {/* Backward segment (both mode) */}
                {bwd && ward.direction === 'both' && (
                    <View style={[styles.bwdChip]}>
                        <Text style={styles.bwdChipText}>
                            📖 وأيضاً: {bwd.surahName} ({bwd.isWholeSurah ? 'كامل' : `آية ${bwd.verseFrom}–${bwd.verseTo}`})
                        </Text>
                    </View>
                )}

                <GradientButton
                    title={ward.completedToday ? 'مراجعة الورد 🔁' : 'ابدأ الورد الآن ▶'}
                    onPress={() => onStart(main.surahNumber, main.surahName, main.verseFrom, main.verseTo)}
                    style={styles.startButton}
                    colors={isHafs ? Colors.gradients.primary : Colors.gradients.gold}
                />
            </View>
        </View>
    );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
    const router = useRouter();
    const { user } = useAuth();
    const [plannerData, setPlannerData] = React.useState(null as PlannerData | null);
    const [loading, setLoading] = React.useState(true);
    const [userProgress, setUserProgress] = React.useState(null as UserProgress | null);
    const [challenges, setChallenges] = React.useState([] as Challenge[]);
    const [dueReviews, setDueReviews] = React.useState([] as any[]);
    const [refreshing, setRefreshing] = React.useState(false);
    const [currentSurah, setCurrentSurah] = React.useState(null as { name: string; number: number } | null);
    const [activeNarration, setActiveNarration] = React.useState('Hafs');
    const [dailyWard, setDailyWard] = React.useState<DailyWard | null>(null);
    const [showClozeModal, setShowClozeModal] = React.useState(false);
    const [showLiveModal, setShowLiveModal] = React.useState(false);
    // True when the initial dashboard load failed and we have nothing to show.
    const [loadError, setLoadError] = React.useState(false);
    // Track whether we already triggered the auto-advance for this session to prevent double-firing
    const autoAdvancedRef = React.useRef(false);
    const autoRoutedRef = React.useRef(false);

    useFocusEffect(
        React.useCallback(() => {
            loadDashboardData();
        }, [user?.id])
    );

    // ── Auto-advance when today's target reaches 100% ─────────────────────────
    React.useEffect(() => {
        if (!plannerData || plannerData.dailyTarget <= 0) return;
        const progress = Math.min(100, (plannerData.pagesCompleted / plannerData.dailyTarget) * 100);
        if (progress >= 100 && !autoAdvancedRef.current) {
            autoAdvancedRef.current = true;
            // Short celebration delay, then refresh the dashboard to load the next target.
            // The planner recalculates and surfaces the next surah/ward automatically.
            const timer = setTimeout(() => {
                autoAdvancedRef.current = false; // allow future advances
                loadDashboardData();
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [plannerData]);

    async function loadDashboardData() {
        try {
            setLoadError(false);
            if (!user) {
                setLoading(false);
                return;
            }

            const [
                profile,
                plannerData,
                progress,
                activeChallenges,
                reviews,
                settings,
                ward,
                surahProgressRows,
            // ✅ Parallel fetching
            ] = await Promise.all([
                supabase
                    .from('profiles')
                    .select('qiraat, current_surah, current_verse, target_date')
                    .eq('id', user.id)
                    .single()
                    .then(({ data }) => data),
                calculateDailyTarget(user.id),
                getUserProgress(user.id),
                getActiveChallenges(user.id),
                fetchDueReviews(user.id),
                getNotificationSettings(user.id),
                getTodaysWard(user.id),
                supabase
                    .from('surah_progress')
                    .select('surah_number, completed')
                    .eq('user_id', user.id)
                    .order('surah_number', { ascending: false })
                    .limit(1)
                    .then(({ data }) => data),
            ]);

            setDailyWard(ward);

            // ── The aggressive auto-routing was causing infinite loops for legacy users.
            // We now rely on the empty state UI widgets embedded in the dashboard
            // (e.g. DailyWardCard checking ward.planExists) to guide the user.
            if (profile?.qiraat) {
                setActiveNarration(profile.qiraat);
            }

            setPlannerData(plannerData);
            setUserProgress(progress);

            // ── 🔄 Silent daily_pages sync (year-long plan stability) ───────────
            // The Rescue Algorithm in calculateDailyTarget() recomputes how many pages
            // the user needs per day based on ACTUAL remaining pages + ACTUAL days left.
            // We write this back to memorization_plan.daily_pages so the ward system
            // always uses the correct target — not the stale value from plan creation.
            // Runs silently in the background; never blocks rendering.
            if (plannerData.dailyTarget > 0 && ward?.planExists && ward.dailyPages !== plannerData.dailyTarget) {
                supabase
                    .from('memorization_plan')
                    .update({
                        daily_pages: plannerData.dailyTarget,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', user.id)
                    .then(({ error }) => {
                        if (error) console.warn('[Dashboard] daily_pages sync failed:', error.message);
                        else console.log(`[Dashboard] daily_pages synced → ${plannerData.dailyTarget}`);
                    });
            }
            // ─────────────────────────────────────────────────────────────────────

            if (activeChallenges.length === 0) {
                await createDailyChallenges(user.id);
                const newChallenges = await getActiveChallenges(user.id);
                setChallenges(newChallenges);
            } else {
                setChallenges(activeChallenges);
            }

            setDueReviews(reviews);

            // ── ✅ FIXED: Current surah from profiles.current_surah, not from page ratio ─
            // The old formula Math.floor((pagesCompleted/604)*114) was completely wrong.
            // Now: server stores current_surah after each completed surah via RPC.
            // Fallback chain: reviews → profiles.current_surah → surah_progress max → Sūrah 1
            if (reviews.length > 0) {
                // Prioritise overdue SM-2 review if one exists
                const surah = getSurahByNumber(reviews[0].surah_number);
                if (surah) setCurrentSurah({ name: surah.name, number: surah.number });
            } else if (profile?.current_surah && profile.current_surah >= 1) {
                // Use the server-tracked position stored in profiles
                const surah = getSurahByNumber(profile.current_surah);
                if (surah) setCurrentSurah({ name: surah.name, number: surah.number });
            } else {
                // Last resort: use the latest tracked surah progress row already fetched above.
                const lastSurah = surahProgressRows?.[0]?.surah_number ?? 1;
                const surah = getSurahByNumber(lastSurah);
                if (surah) setCurrentSurah({ name: surah.name, number: surah.number });
            }

            // Schedule daily reminder ONLY once per day (not on every data load)
            if (settings.dailyReminder) {
                try {
                    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                    const lastScheduled = await AsyncStorage.getItem('@mutqin:last_reminder_scheduled').catch(() => null);
                    const today = new Date().toDateString();
                    if (lastScheduled !== today) {
                        const userCtx = {
                            name:         user?.email?.split('@')[0] || undefined,
                            streak:       (progress as any)?.currentStreak ?? (progress as any)?.streak ?? 0,
                            dueReviews:   reviews?.length ?? 0,
                            currentSurah: getSurahByNumber(profile?.current_surah ?? 1)?.name,
                            dailyPages:   ward?.dailyPages ?? 1,
                        };
                        await scheduleDailyReminder(settings.dailyReminderTime, userCtx);
                        await AsyncStorage.setItem('@mutqin:last_reminder_scheduled', today).catch(() => {});
                    }
                } catch (notifErr) {
                    console.warn('[Dashboard] notification scheduling skipped:', notifErr);
                }
            }

        } catch (error) {
            console.error('Error loading dashboard:', error);
            // Only surface the error UI when there is no previously loaded
            // content to keep showing (stale data beats an error screen).
            if (!plannerData) {
                setLoadError(true);
            }
        } finally {
            setLoading(false);
        }
    }

    async function onRefresh() {
        setRefreshing(true);
        await loadDashboardData();
        setRefreshing(false);
    }

    const userName = user?.email?.split('@')[0] || 'User';
    const isHafs = activeNarration === 'Hafs';
    const accentColor = isHafs ? Colors.emerald[400] : Colors.gold[400];
    const secondaryAccent = isHafs ? Colors.emerald[500] : Colors.gold[500];

    const focusProgress = plannerData && plannerData.dailyTarget > 0
        ? Math.min(100, (plannerData.pagesCompleted / plannerData.dailyTarget) * 100)
        : 0;

    const heroGradientColors = isHafs
        ? (['#011c1a', Colors.emerald[950], Colors.emerald[800], '#0f766e'] as const)
        : (['#1c0e00', Colors.gold[950], Colors.gold[900], Colors.gold[700]] as const);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <ModernBackground />

            <SafeAreaView style={styles.safeArea}>
                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={[Colors.gold[600]]}
                            tintColor={Colors.gold[600]}
                        />
                    }
                >
                    <StaggerIn delay={0}>
                        <View style={styles.dashboardHeader}>
                            <GreetingSection userName={userName} activeNarration={activeNarration} delay={0} />
                            <TouchableOpacity
                                onPress={() => router.push('/search')}
                                style={styles.searchButton}
                                accessibilityLabel="بحث في القرآن"
                                accessibilityHint="يفتح البحث في القرآن"
                            >
                                <Search size={20} color={Colors.emerald[400]} />
                            </TouchableOpacity>
                        </View>
                    </StaggerIn>

                    {loading ? (
                        <View style={{ marginTop: Spacing.xl }}>
                            <SkeletonLoader width="100%" height={200} borderRadius={BorderRadius['2xl']} />
                        </View>
                    ) : loadError && !plannerData ? (
                        <View style={styles.errorBox}>
                            <AlertCircle size={44} color={Colors.gold[400]} />
                            <Text style={styles.errorTitle}>تعذّر تحميل البيانات</Text>
                            <Text style={styles.errorMessage}>
                                تحقق من اتصالك بالإنترنت وحاول مرة أخرى
                            </Text>
                            <GradientButton
                                title="إعادة المحاولة"
                                onPress={() => {
                                    setLoading(true);
                                    loadDashboardData();
                                }}
                                style={styles.errorRetryButton}
                            />
                        </View>
                    ) : (
                        <>
                            {/* Row 1: Narration Switcher */}
                            <StaggerIn delay={StaggerDelay * 1}>
                                <NarrationSwitcher
                                    userId={user?.id || ''}
                                    activeNarration={activeNarration}
                                    onNarrationChange={(newNarration) => {
                                        setActiveNarration(newNarration);
                                        onRefresh();
                                    }}
                                />
                            </StaggerIn>

                            <StaggerIn delay={StaggerDelay * 2}>
                                <TodayFocusStrip
                                    activeNarration={activeNarration}
                                    dailyPages={dailyWard?.dailyPages ?? plannerData?.dailyTarget ?? 1}
                                    dueReviews={dueReviews.length}
                                    accentColor={accentColor}
                                />
                            </StaggerIn>

                            {/* Row 2: Stats Bento */}
                            <StaggerIn delay={StaggerDelay * 3}>
                                <StatsBento
                                    streak={userProgress?.current_streak || 0}
                                    daysRemaining={plannerData?.daysRemaining || 0}
                                    totalXP={userProgress?.total_xp || 0}
                                    baseDelay={0}
                                    activeNarration={activeNarration}
                                />
                            </StaggerIn>


                            {/* Row 3: Daily Ward Card */}
                            <StaggerIn delay={StaggerDelay * 4}>
                                <Text style={styles.sectionTitle}>ورد اليوم</Text>
                                <DailyWardCard
                                    ward={dailyWard}
                                    accentColor={accentColor}
                                    isHafs={isHafs}
                                    heroGradientColors={heroGradientColors}
                                    onStart={(surahNum, surahName, verseFrom, verseTo) => {
                                        router.push({
                                            pathname: '/recite',
                                            params: {
                                                surahNumber: surahNum.toString(),
                                                surahName,
                                                fromAyah: verseFrom.toString(),
                                                toAyah:   verseTo.toString(),
                                            },
                                        });
                                    }}
                                    onSetupPlan={() => router.push('/plan-setup')}
                                />
                            </StaggerIn>

                            {/* Missing Words Recitation Challenge Action Card */}
                            <StaggerIn delay={StaggerDelay * 4.5}>
                                <TouchableOpacity
                                    style={styles.clozeChallengeCard}
                                    onPress={() => setShowClozeModal(true)}
                                    activeOpacity={0.88}
                                >
                                    <LinearGradient
                                        colors={[Colors.emerald[950], Colors.emerald[900], Colors.emerald[700]]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.clozeGradient}
                                    >
                                        <View style={styles.clozeContent}>
                                            <View style={styles.clozeIconBadge}>
                                                <Sparkles color={Colors.emerald[300]} size={22} />
                                            </View>
                                            <View style={styles.clozeTextBlock}>
                                                <Text style={styles.clozeTitle}>اختبار الكلمات المفقودة 🧩</Text>
                                                <Text style={styles.clozeSubtitle}>اختبر حفظك التفاعلي باكتشاف ونطق الكلمات المخفية</Text>
                                            </View>
                                        </View>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </StaggerIn>

                            {/* Live Audio Muaalem Interactive Card */}
                            <StaggerIn delay={StaggerDelay * 4.8}>
                                <TouchableOpacity
                                    style={styles.clozeChallengeCard}
                                    onPress={() => setShowLiveModal(true)}
                                    activeOpacity={0.88}
                                >
                                    <LinearGradient
                                        colors={[Colors.emerald[900], Colors.emerald[700], Colors.emerald[600]]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.clozeGradient}
                                    >
                                        <View style={styles.clozeContent}>
                                            <View style={styles.clozeBadge}>
                                                <Radio size={16} color={Colors.emerald[500]} />
                                                <Text style={styles.clozeBadgeText}>جلسة حية مباشرة (Live API)</Text>
                                            </View>
                                            <View style={{ gap: 4 }}>
                                                <Text style={styles.clozeTitle}>المعلم الصوتي المباشر</Text>
                                                <Text style={styles.clozeSubtitle}>تسميع حي ومباشر مع المعلم الآلي بدون أي حدود استخدام</Text>
                                            </View>
                                        </View>
                                    </LinearGradient>
                                </TouchableOpacity>
                            </StaggerIn>

                            {/* Due Reviews */}
                            {dueReviews.length > 0 && (
                                <StaggerIn delay={StaggerDelay * 5}>
                                    <View style={styles.section}>
                                        <View style={styles.sectionHeader}>
                                            <Text style={styles.sectionTitle}>مراجعات مستحقة</Text>
                                            <View style={styles.badge}>
                                                <Text style={styles.badgeText}>{dueReviews.length}</Text>
                                            </View>
                                        </View>

                                        {dueReviews.length >= RECOVERY_REVIEW_THRESHOLD && (
                                            <View style={styles.recoveryCard}>
                                                <View style={styles.recoveryIcon}>
                                                    <Zap size={18} color={Colors.gold[300]} />
                                                </View>
                                                <View style={styles.recoveryTextBlock}>
                                                    <Text style={styles.recoveryTitle}>خطة استدراك خفيفة</Text>
                                                    <Text style={styles.recoveryText}>
                                                        ابدأ بأهم 5 مواضع الآن، ثم وزع الباقي على الأيام القادمة.
                                                    </Text>
                                                </View>
                                            </View>
                                        )}

                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalContent}>
                                            {dueReviews.slice(0, dueReviews.length >= RECOVERY_REVIEW_THRESHOLD ? 5 : dueReviews.length).map((review, index) => {
                                                const surah = getSurahByNumber(review.surah_number);
                                                return (
                                                    <Card
                                                        key={index}
                                                        variant="glass"
                                                        style={styles.reviewCard}
                                                        onPress={() => router.push({
                                                            pathname: '/recite',
                                                            params: {
                                                                surahNumber: review.surah_number,
                                                                surahName: surah?.name
                                                            }
                                                        })}
                                                        animated={true}
                                                        delay={StaggerDelay * (5 + index)}
                                                    >
                                                        <View style={styles.reviewIcon}>
                                                            <AlertCircle size={20} color={Colors.warning} />
                                                        </View>
                                                        <Text style={styles.reviewSurahName}>{surah?.name}</Text>
                                                        <Text style={styles.reviewSurahEnglish}>{surah?.transliteration}</Text>
                                                    </Card>
                                                );
                                            })}
                                        </ScrollView>
                                    </View>
                                </StaggerIn>
                            )}

                            {/* فائدة اليوم */}
                            <StaggerIn delay={StaggerDelay * 5}>
                                <DailyTipCard activeNarration={activeNarration} delay={0} />
                            </StaggerIn>

                            {/* Daily Challenges */}
                            {challenges.length > 0 && (
                                <StaggerIn delay={StaggerDelay * 6}>
                                    <View style={styles.section}>
                                        <Text style={styles.sectionTitle}>تحديات اليوم</Text>
                                        {challenges.map((challenge, index) => (
                                            <ChallengeCard
                                                key={challenge.id}
                                                name={challenge.challenge_name}
                                                description={challenge.challenge_description}
                                                currentValue={challenge.current_value}
                                                targetValue={challenge.target_value}
                                                xpReward={challenge.xp_reward}
                                                type={challenge.challenge_type}
                                                delay={StaggerDelay * (5 + dueReviews.length + index)}
                                            />
                                        ))}
                                    </View>
                                </StaggerIn>
                            )}
                        </>
                    )}
                    <View style={styles.bottomSpacer} />
                </ScrollView>

                {/* Smart Missing Words Recitation Challenge Modal */}
                <MissingWordsModal
                    visible={showClozeModal}
                    onClose={() => setShowClozeModal(false)}
                />

                {/* Live Interactive Voice Muaalem Modal */}
                <LiveMuaalemModal
                    visible={showLiveModal}
                    onClose={() => setShowLiveModal(false)}
                />
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
        paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 12) : 0,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        padding: Spacing.lg,
        paddingBottom: Spacing.xl,
    },
    dashboardHeader: {
        flexDirection: 'row-reverse',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: Spacing.md,
    },
    searchButton: {
        backgroundColor: 'rgba(16,185,129,0.15)',
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.32)',
        marginTop: Spacing.xs,
    },
    section: {
        marginTop: Spacing.xl,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
        gap: Spacing.sm,
    },
    sectionTitle: {
        fontSize: Typography.fontSize.xl,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.md,
        letterSpacing: 0,
    },
    // ── Hero Focus Card ──
    heroCardWrapper: {
        borderRadius: BorderRadius['2xl'],
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(52, 211, 153, 0.2)',
        ...Shadows.glowEmerald,
        marginBottom: Spacing.lg,
    },
    heroCardInner: {
        padding: Spacing.xl,
        position: 'relative',
        zIndex: 1,
    },
    focusHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: Spacing.lg,
    },
    focusHeaderLeft: {
        flex: 1,
    },
    focusLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: Spacing.xs,
    },
    focusLabelDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    focusLabel: {
        fontSize: 11,
        fontWeight: '700' as const,
        letterSpacing: 0,
        fontFamily: Typography.fontFamily.arabicBold,
    },
    focusSurah: {
        fontSize: Typography.fontSize['3xl'],
        fontWeight: '800' as const,
        color: Colors.text.inverse,
        letterSpacing: 0,
        fontFamily: Typography.fontFamily.arabicBold,
    },
    focusIconCircle: {
        width: 44,
        height: 44,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginStart: Spacing.sm,  // RTL: was marginLeft
    },
    progressText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
        textAlign: 'right',
        marginBottom: Spacing.md,
    },
    focusDetails: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginBottom: Spacing.xl,
    },
    focusDetailChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        backgroundColor: 'rgba(255,255,255,0.07)',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 5,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    focusDetailText: {
        color: Colors.text.tertiary,
        fontSize: Typography.fontSize.xs,
        fontWeight: '600' as const,
    },
    startButton: {
        width: '100%',
    },
    // ── Review cards ──
    recoveryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: 'rgba(251,191,36,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(251,191,36,0.25)',
        borderRadius: BorderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.md,
    },
    recoveryIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(251,191,36,0.14)',
    },
    recoveryTextBlock: {
        flex: 1,
    },
    recoveryTitle: {
        color: Colors.gold[300],
        fontSize: Typography.fontSize.base,
        fontWeight: '700',
        textAlign: 'right',
    },
    recoveryText: {
        color: Colors.neutral[300],
        fontSize: Typography.fontSize.sm,
        lineHeight: 20,
        marginTop: 2,
        textAlign: 'right',
    },
    horizontalContent: {
        gap: Spacing.md,
        paddingStart: Spacing.lg,
    },
    reviewCard: {
        width: 140,
        height: 140,
        justifyContent: 'space-between',
        padding: Spacing.md,
    },
    reviewIcon: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        padding: Spacing.xs,
        borderRadius: BorderRadius.full,
    },
    reviewSurahName: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginTop: Spacing.sm,
    },
    reviewSurahEnglish: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
    },
    badge: {
        backgroundColor: Colors.error,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 2,
        borderRadius: BorderRadius.full,
    },
    badgeText: {
        color: Colors.text.inverse,
        fontSize: Typography.fontSize.xs,
        fontWeight: 'bold',
    },
    bottomSpacer: {
        height: 140,
    },
    // Ward card additions
    completedBadge: {
        backgroundColor: 'rgba(52,211,153,0.15)',
        borderWidth: 1, borderColor: Colors.emerald[500],
        borderRadius: BorderRadius.full,
        paddingHorizontal: Spacing.md, paddingVertical: 4,
        alignSelf: 'flex-end',
        marginBottom: Spacing.sm,
    },
    completedBadgeText: {
        color: Colors.emerald[300],
        fontSize: Typography.fontSize.xs,
        fontWeight: '700',
    },
    bwdChip: {
        backgroundColor: 'rgba(251,191,36,0.08)',
        borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)',
        borderRadius: BorderRadius.lg,
        padding: Spacing.sm,
        marginTop: Spacing.sm,
    },
    bwdChipText: {
        color: Colors.gold[300],
        fontSize: Typography.fontSize.sm,
        textAlign: 'right',
    },
    // Cloze Challenge Card Styles
    clozeChallengeCard: {
        marginTop: Spacing.md,
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(52, 211, 153, 0.3)',
    },
    clozeGradient: {
        padding: Spacing.lg,
    },
    clozeContent: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: Spacing.md,
    },
    clozeIconBadge: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: Colors.emerald[400],
    },
    clozeTextBlock: {
        flex: 1,
    },
    clozeTitle: {
        fontSize: Typography.fontSize.base,
        fontWeight: 'bold',
        color: '#ffffff',
        textAlign: 'right',
    },
    clozeSubtitle: {
        fontSize: Typography.fontSize.xs,
        color: Colors.emerald[200],
        textAlign: 'right',
        marginTop: 2,
    },
    clozeBadge: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    clozeBadgeText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.emerald[300],
        fontWeight: '600',
    },
    // ── Load-error state ──
    errorBox: {
        marginTop: Spacing.xl,
        alignItems: 'center',
        padding: Spacing.xl,
        borderRadius: BorderRadius.xl,
        borderWidth: 1,
        borderColor: 'rgba(251, 191, 36, 0.25)',
        backgroundColor: 'rgba(2, 6, 23, 0.6)',
        gap: Spacing.sm,
    },
    errorTitle: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        fontFamily: Typography.fontFamily.arabicBold,
        textAlign: 'center',
    },
    errorMessage: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        fontFamily: Typography.fontFamily.arabic,
        textAlign: 'center',
        marginBottom: Spacing.sm,
    },
    errorRetryButton: {
        minWidth: 160,
    },
});
