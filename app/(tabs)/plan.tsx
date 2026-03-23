import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    SafeAreaView,
    TextInput,
    TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { format } from 'date-fns';
import DatePickerModal from '../../components/ui/DatePickerModal';
import { CalendarDays, CheckCircle2, BookOpen, Clock, Target } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import Card from '../../components/ui/Card';
import ModernBackground from '../../components/ui/ModernBackground';
import GradientButton from '../../components/ui/GradientButton';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useRouter } from 'expo-router';
import { StaggerDelay } from '../../constants/animations';

// ─── Types ───────────────────────────────────────────────────────────────────

type MemorizationLevel = 'beginner' | 'basic' | 'intermediate' | 'advanced';
type TimeSlot = 'fajr' | 'morning' | 'afternoon' | 'maghrib' | 'flexible';
type Intensity = 'gentle' | 'balanced' | 'intensive';

const MEMORIZATION_LEVELS: { key: MemorizationLevel; label: string; sub: string; emoji: string }[] = [
    { key: 'beginner', label: 'مبتدئ', sub: 'جزء عم فقط', emoji: '🌱' },
    { key: 'basic', label: 'أساسي', sub: '١–٥ أجزاء', emoji: '📖' },
    { key: 'intermediate', label: 'متوسط', sub: '٦–١٥ جزءاً', emoji: '🕌' },
    { key: 'advanced', label: 'متقدم', sub: '١٥+ جزءاً', emoji: '⭐' },
];

const TIME_SLOTS: { key: TimeSlot; label: string; sub: string; emoji: string }[] = [
    { key: 'fajr', label: 'بعد الفجر', sub: 'الأمثل', emoji: '🌅' },
    { key: 'morning', label: 'الصباح', sub: '٨–١٢', emoji: '🕗' },
    { key: 'afternoon', label: 'العصر', sub: '٢–٦', emoji: '🕑' },
    { key: 'maghrib', label: 'بعد المغرب', sub: 'ليلاً', emoji: '🌙' },
    { key: 'flexible', label: 'مرن', sub: 'حسب التوفر', emoji: '⚡' },
];

const INTENSITY_LEVELS: { key: Intensity; label: string; sub: string; emoji: string; minutes: string }[] = [
    { key: 'gentle', label: 'لطيف', sub: 'مناسب للمبتدئين', emoji: '🌿', minutes: '٥–١٠ دقائق' },
    { key: 'balanced', label: 'متوازن', sub: 'الأكثر شيوعاً', emoji: '📿', minutes: '١٥–٣٠ دقيقة' },
    { key: 'intensive', label: 'مكثف', sub: 'للجادين المتفرغين', emoji: '🔥', minutes: '٤٥+ دقيقة' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function PlanScreen() {
    const { user } = useAuth();
    const router = useRouter();

    // Basic fields
    const [nickname, setNickname] = React.useState('');
    const [age, setAge] = React.useState('');
    const [targetDate, setTargetDate] = React.useState<Date>(
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    );
    const [showDatePicker, setShowDatePicker] = React.useState(false);
    const [qiraat, setQiraat] = React.useState('Hafs');
    const [userNotes, setUserNotes] = React.useState('');

    // New personalization fields
    const [memLevel, setMemLevel] = React.useState<MemorizationLevel>('beginner');
    const [timeSlot, setTimeSlot] = React.useState<TimeSlot>('fajr');
    const [intensity, setIntensity] = React.useState<Intensity>('balanced');

    // State
    const [loading, setLoading] = React.useState(false);
    const [hasExistingPlan, setHasExistingPlan] = React.useState(false);
    const [hasWardPlan, setHasWardPlan] = React.useState(false);
    const [planSuccess, setPlanSuccess] = React.useState<null | { totalDays: number; dailyPages: number }>(null);
    const [planError, setPlanError] = React.useState<string | null>(null);
    // true when a legacy user was auto-upgraded silently
    const [legacyAutoUpgraded, setLegacyAutoUpgraded] = React.useState(false);
    const [legacyDailyPages, setLegacyDailyPages] = React.useState<number | null>(null);

    // Success card animation
    const successScale = useSharedValue(0.8);
    const successOpacity = useSharedValue(0);
    const successAnimStyle = useAnimatedStyle(() => ({
        transform: [{ scale: successScale.value }],
        opacity: successOpacity.value,
    }));

    React.useEffect(() => {
        loadProfile();
        checkExistingPlan();
    }, []);

    async function loadProfile() {
        try {
            if (!user) return;
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            if (error && error.code !== 'PGRST116') throw error;
            if (data) {
                setNickname(data.nickname || '');
                setAge(data.age?.toString() || '');
                if (data.target_date) setTargetDate(new Date(data.target_date));
                setQiraat(data.qiraat || 'Hafs');
                setUserNotes(data.user_notes || '');
                if (data.memorization_level) setMemLevel(data.memorization_level);
                if (data.preferred_time_slot) setTimeSlot(data.preferred_time_slot);
                if (data.intensity) setIntensity(data.intensity);
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    }

    async function checkExistingPlan() {
        try {
            if (!user) return;

            // ── Check user_plans (AI-generated plan) ─────────────────────────
            const { data: userPlanRows } = await supabase
                .from('user_plans')
                .select('id')
                .eq('user_id', user.id)
                .limit(1);
            const hasUserPlan = userPlanRows != null && userPlanRows.length > 0;
            setHasExistingPlan(hasUserPlan);

            // ── Check memorization_plan (ward direction plan) ─────────────────
            const { data: wardData } = await supabase
                .from('memorization_plan')
                .select('id, daily_pages')
                .eq('user_id', user.id)
                .maybeSingle();
            setHasWardPlan(wardData != null);

            // ── LEGACY USER UPGRADE ──────────────────────────────────────────
            // User has a ward plan (old-style) but no AI user_plan (new-style).
            // Silently generate a local plan from their existing profile data
            // so they don't hit a blank form when they visit this screen.
            if (!hasUserPlan && wardData) {
                await autoUpgradeLegacyUser(wardData.daily_pages ?? 1);
            }
        } catch (error) {
            console.error('Error checking plan:', error);
        }
    }

    /**
     * Auto-upgrades a legacy user who has memorization_plan but no user_plans.
     * Reads their existing profile, computes daily_pages, and inserts a minimal
     * user_plans record so the dashboard and ward system work correctly.
     * Never asks the user anything — fully transparent.
     */
    async function autoUpgradeLegacyUser(existingDailyPages: number) {
        try {
            if (!user) return;

            // Read existing profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('nickname, age, target_date, qiraat')
                .eq('id', user.id)
                .single();

            // Compute sensible defaults from whatever we have
            const ageNum  = profile?.age ?? 25;
            const tDate   = profile?.target_date
                ? new Date(profile.target_date)
                : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
            const daysLeft = Math.max(30, Math.floor((tDate.getTime() - Date.now()) / 86400000));

            // Fill in UI fields so the form looks pre-filled if user opens it
            if (profile?.nickname) setNickname(profile.nickname);
            if (profile?.age)      setAge(String(profile.age));
            if (profile?.target_date) setTargetDate(tDate);
            if (profile?.qiraat)   setQiraat(profile.qiraat);

            // Generate an algorithmic pace (same as Edge Function local fallback)
            const pagesPerDay    = ageNum < 15 ? 1.0 : ageNum < 25 ? 1.5 : ageNum < 40 ? 1.0 : 0.5;
            const reviewFreq     = 7;
            const totalDays      = Math.ceil(604 / pagesPerDay * 1.15);

            // Build plan records (day 1 only unlocked for brevity):
            // We generate a compact version — just enough to satisfy `hasPlan` check.
            const planRecords: any[] = [];
            let currentPage = 1;
            let dayNum      = 1;
            while (currentPage <= 604 && dayNum <= 2000) {
                if (dayNum % reviewFreq === 0) {
                    const reviewStart = Math.max(1, currentPage - Math.floor(pagesPerDay * (reviewFreq - 1)));
                    const reviewEnd   = Math.max(reviewStart, currentPage - 1);
                    planRecords.push({
                        user_id:      user.id,
                        day_number:   dayNum,
                        verses_range: { page_from: reviewStart, page_to: reviewEnd },
                        task_type:    'Review',
                        is_unlocked:  dayNum === 1,
                    });
                } else {
                    const endPage = Math.min(currentPage + Math.floor(pagesPerDay) - 1, 604);
                    planRecords.push({
                        user_id:      user.id,
                        day_number:   dayNum,
                        verses_range: { page_from: currentPage, page_to: endPage },
                        task_type:    'Memorize',
                        is_unlocked:  dayNum === 1,
                    });
                    currentPage = endPage + 1;
                }
                dayNum++;
            }

            // Ensure the profile exists first to satisfy 'user_plans' foreign key constraint
            await supabase.from('profiles').upsert({
                id: user.id,
                target_date: tDate.toISOString(),
                age: ageNum,
                updated_at: new Date().toISOString()
            });

            // Insert in Supabase (it's fine if it fails — we'll retry next time)
            const { error: insertErr } = await supabase.from('user_plans').insert(planRecords);
            if (insertErr) {
                console.warn('[Legacy] user_plans insert failed:', insertErr.message);
                return;
            }

            // Also sync daily_pages → memorization_plan (use existing value or recalculate)
            const dp = existingDailyPages > 0 ? existingDailyPages : Math.max(1, Math.round(604 / daysLeft));
            await supabase.from('memorization_plan').update({
                daily_pages: dp,
                updated_at:  new Date().toISOString(),
            }).eq('user_id', user.id);

            setHasExistingPlan(true);
            setLegacyAutoUpgraded(true);
            setLegacyDailyPages(dp);
            console.log(`[Legacy] Auto-upgraded user: ${planRecords.length} days, ${dp} pages/day`);
        } catch (err) {
            console.warn('[Legacy] autoUpgradeLegacyUser failed silently:', err);
        }
    }

    function onDateConfirm(date: Date) {
        setTargetDate(date);
        setShowDatePicker(false);
    }

    async function generatePlan() {
        if (!nickname || !age) return;
        const ageNum = parseInt(age);
        if (isNaN(ageNum) || ageNum < 5 || ageNum > 100) return;

        setLoading(true);
        try {
            if (!user) return;
            const targetDateStr = format(targetDate, 'yyyy-MM-dd');
            const daysUntilTarget = Math.max(1, Math.floor((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

            // ── ① Save profile ────────────────────────────────────────────────
            await supabase.from('profiles').upsert({
                id: user.id,
                nickname,
                age: ageNum,
                target_date: targetDateStr,
                qiraat,
                user_notes: userNotes,
                memorization_level: memLevel,
                preferred_time_slot: timeSlot,
                intensity,
                total_pages_goal: 604,
                updated_at: new Date().toISOString(),
            });

            // ── ② Call AI plan generator (Local Client-Side Calculation) ───────────
            // Instead of an Edge Function that costs money/latency, we use smart local algorithms.
            // (If you want AI suggestions later, you can integrate gemini-flash directly here).

            // ── ③ Calculate daily_pages from days remaining ───────────────────
            // Fetch completed pages so far to get accurate remaining
            const { data: logs } = await supabase
                .from('daily_logs')
                .select('pages_completed')
                .eq('user_id', user.id);
            const pagesCompleted = logs?.reduce((s, l) => s + (l.pages_completed || 0), 0) || 0;
            const pagesRemaining = Math.max(1, 604 - pagesCompleted);
            const dailyPages = Math.max(1, Math.min(20, Math.round(pagesRemaining / daysUntilTarget)));

            // ── ④ Sync daily_pages to memorization_plan ───────────────────────
            const { data: existingWard } = await supabase
                .from('memorization_plan')
                .select('id')
                .eq('user_id', user.id)
                .maybeSingle();

            if (existingWard) {
                // Update daily_pages only — preserve direction & position
                await supabase.from('memorization_plan').update({
                    daily_pages: dailyPages,
                    updated_at: new Date().toISOString(),
                }).eq('user_id', user.id);
                setHasWardPlan(true);
            }
            // If no ward plan yet: user will be prompted to set it up below

            setPlanSuccess({ totalDays: daysUntilTarget, dailyPages });
            setHasExistingPlan(true);

            successScale.value = withSpring(1, { damping: 16, stiffness: 180 });
            successOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });

            // ── ⑤ If first time → auto-navigate to ward setup after 2.5s ─────
            if (!existingWard) {
                setTimeout(() => {
                    router.push({
                        pathname: '/plan-setup',
                        params: { prefillDailyPages: dailyPages.toString() },
                    });
                }, 2500);
            }
        } catch (error: any) {
            console.error('Error generating plan locally:', error);
            setPlanError('حدث خطأ أثناء حفظ الخطة. يرجى المحاولة مرة أخرى.');
        } finally {
            setLoading(false);
        }
    }

    const isHafs = qiraat === 'Hafs';
    const accentColor = isHafs ? Colors.emerald[400] : Colors.gold[400];
    const gradientColors = isHafs ? Colors.gradients.primary : Colors.gradients.gold;
    const daysUntilTarget = Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

    return (
        <View style={styles.container}>
            <ModernBackground />
            <SafeAreaView style={styles.safeArea}>

                {/* ── Header ── */}
                <View style={styles.header}>
                    <Text style={styles.title}>خطة الحفظ الذكية</Text>
                    <Text style={styles.subtitle}>
                        {hasExistingPlan ? 'تعديل خطتك المخصصة' : 'خطة مخصصة بالذكاء الاصطناعي'}
                    </Text>
                </View>

                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                >

                    {/* ══ Plan Error Banner ══ */}
                    {planError && (
                        <View style={styles.warningBanner}>
                            <Text style={styles.warningText}>⚠️ {planError}</Text>
                        </View>
                    )}

                    {/* ══ Legacy User Auto-Upgrade Banner ══ */}
                    {legacyAutoUpgraded && !planSuccess && (
                        <View style={styles.legacyBanner}>
                            <Text style={styles.legacyBannerTitle}>🎉 مرحباً مجدداً!</Text>
                            <Text style={styles.legacyBannerText}>
                                تم ترقية خطتك تلقائياً استناداً لبياناتك السابقة.{'\n'}
                                ورد يومي حالي: <Text style={{ color: '#34d399', fontWeight: '700' }}>{legacyDailyPages} صفحة/يوم</Text>
                            </Text>
                            <Text style={styles.legacyBannerSub}>
                                يمكنك تعديل المعلومات أدناه وإعادة توليد الخطة إذا أردت.
                            </Text>
                        </View>
                    )}

                    {/* ══════════════════════════════════════════
                        SUCCESS CARD — glows + glassmorphism
                    ══════════════════════════════════════════ */}
                    {planSuccess && (
                        <Animated.View style={[styles.successCardWrapper, successAnimStyle]}>
                            {/* Neon emerald glow orb behind card */}
                            <View style={styles.successGlowOrb} />

                            <LinearGradient
                                colors={['rgba(5,46,37,0.98)', 'rgba(2,44,34,0.97)', 'rgba(6,95,70,0.9)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={StyleSheet.absoluteFill}
                            />
                            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />

                            {/* Inner glow border shimmer */}
                            <LinearGradient
                                colors={['rgba(52,211,153,0.5)', 'rgba(52,211,153,0)', 'rgba(251,191,36,0.3)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.successBorderGradient}
                            />

                            <View style={styles.successCardInner}>
                                <View style={styles.successIcon}>
                                    <CheckCircle2 color={Colors.emerald[400]} size={32} />
                                </View>
                                <Text style={styles.successTitle}>تم إنشاء خطتك! 🎉</Text>
                                <Text style={styles.successSubtitle}>
                                    {hasWardPlan ? 'تم تحديث الورد اليومي تلقائياً' : 'جارٍ الانتقال لإعداد اتجاه الورد...'}
                                </Text>

                                <View style={styles.successStats}>
                                    <View style={styles.successStat}>
                                        <Clock color={Colors.emerald[400]} size={18} />
                                        <Text style={[styles.successStatValue, { color: Colors.emerald[400] }]}>
                                            {planSuccess.totalDays}
                                        </Text>
                                        <Text style={styles.successStatLabel}>يوماً</Text>
                                    </View>
                                    <View style={styles.successStatDivider} />
                                    <View style={styles.successStat}>
                                        <BookOpen color={Colors.gold[400]} size={18} />
                                        <Text style={[styles.successStatValue, { color: Colors.gold[400] }]}>
                                            {planSuccess.dailyPages}
                                        </Text>
                                        <Text style={styles.successStatLabel}>صفحات/يوم</Text>
                                    </View>
                                    <View style={styles.successStatDivider} />
                                    <View style={styles.successStat}>
                                        <Target color={Colors.gold[300]} size={18} />
                                        <Text style={[styles.successStatValue, { color: Colors.gold[300] }]}>
                                            {format(targetDate, 'yyyy')}
                                        </Text>
                                        <Text style={styles.successStatLabel}>الهدف</Text>
                                    </View>
                                </View>

                                {/* Ward setup button — only if ward plan not configured yet */}
                                {hasWardPlan && (
                                    <TouchableOpacity
                                        style={styles.wardSetupBtn}
                                        onPress={() => router.push({
                                            pathname: '/plan-setup',
                                            params: { prefillDailyPages: planSuccess.dailyPages.toString() },
                                        })}
                                    >
                                        <Text style={styles.wardSetupBtnText}>⚙️ تعديل اتجاه الورد</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </Animated.View>
                    )}

                    {/* ══════════════════════════════════════════
                        BASIC INFO
                    ══════════════════════════════════════════ */}

                    {/* Nickname */}
                    <Card style={styles.settingCard} variant="glass" animated delay={StaggerDelay * 0}>
                        <Text style={styles.label}>الاسم المستعار</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="مثال: أحمد"
                            placeholderTextColor={Colors.neutral[500]}
                            value={nickname}
                            onChangeText={setNickname}
                        />
                    </Card>

                    {/* Age */}
                    <Card style={styles.settingCard} variant="glass" animated delay={StaggerDelay * 1}>
                        <Text style={styles.label}>العمر</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="مثال: 25"
                            placeholderTextColor={Colors.neutral[500]}
                            value={age}
                            onChangeText={setAge}
                            keyboardType="number-pad"
                        />
                        <Text style={styles.hint}>سيتم تخصيص الخطة حسب عمرك</Text>
                    </Card>

                    {/* Target Date */}
                    <Card style={styles.settingCard} variant="glass" animated delay={StaggerDelay * 2}>
                        <Text style={styles.label}>تاريخ الإنهاء المستهدف</Text>
                        <TouchableOpacity
                            style={styles.dateButton}
                            onPress={() => setShowDatePicker(true)}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={['rgba(52,211,153,0.08)', 'rgba(52,211,153,0.02)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={StyleSheet.absoluteFill}
                            />
                            <CalendarDays color={Colors.emerald[400]} size={20} />
                            <Text style={styles.dateButtonText}>
                                {format(targetDate, 'MMMM d, yyyy')}
                            </Text>
                            <View style={styles.dateBadge}>
                                <Text style={styles.dateBadgeText}>{daysUntilTarget} يوم</Text>
                            </View>
                        </TouchableOpacity>
                        {/* JS-only date picker modal — Expo Go compatible */}
                        <DatePickerModal
                            visible={showDatePicker}
                            value={targetDate}
                            minimumDate={new Date(Date.now() + 24 * 60 * 60 * 1000)}
                            onConfirm={onDateConfirm}
                            onCancel={() => setShowDatePicker(false)}
                        />
                    </Card>

                    {/* Qira'at */}
                    <Card style={styles.settingCard} variant="glass" animated delay={StaggerDelay * 3}>
                        <Text style={styles.label}>القراءة</Text>
                        <View style={styles.optionsRow}>
                            {(['Hafs', 'Warsh'] as const).map((q) => (
                                <TouchableOpacity
                                    key={q}
                                    style={[
                                        styles.option,
                                        qiraat === q && {
                                            borderColor: q === 'Hafs' ? Colors.emerald[400] : Colors.gold[400],
                                            backgroundColor: q === 'Hafs'
                                                ? 'rgba(52,211,153,0.12)'
                                                : 'rgba(251,191,36,0.12)',
                                        }
                                    ]}
                                    onPress={() => setQiraat(q)}
                                >
                                    <Text style={[
                                        styles.optionText,
                                        qiraat === q && {
                                            color: q === 'Hafs' ? Colors.emerald[400] : Colors.gold[400],
                                        }
                                    ]}>
                                        {q === 'Hafs' ? 'حفص' : 'ورش'}
                                    </Text>
                                    <Text style={styles.optionSubtext}>{q}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </Card>

                    {/* ══════════════════════════════════════════
                        PERSONALIZATION FIELDS (NEW)
                    ══════════════════════════════════════════ */}

                    {/* 1. Current Memorization Level */}
                    <Card style={styles.settingCard} variant="glassDark" animated delay={StaggerDelay * 4}>
                        <Text style={styles.label}>مستوى الحفظ الحالي</Text>
                        <Text style={styles.hint}>حتى يحدد الذكاء الاصطناعي نقطة البداية المناسبة</Text>
                        <View style={styles.levelGrid}>
                            {MEMORIZATION_LEVELS.map((lvl) => (
                                <TouchableOpacity
                                    key={lvl.key}
                                    style={[
                                        styles.levelCard,
                                        memLevel === lvl.key && styles.levelCardActive,
                                    ]}
                                    onPress={() => setMemLevel(lvl.key)}
                                    activeOpacity={0.8}
                                >
                                    {memLevel === lvl.key && (
                                        <LinearGradient
                                            colors={['rgba(52,211,153,0.15)', 'rgba(52,211,153,0.05)']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={StyleSheet.absoluteFill}
                                        />
                                    )}
                                    <Text style={styles.levelEmoji}>{lvl.emoji}</Text>
                                    <Text style={[styles.levelLabel, memLevel === lvl.key && { color: Colors.emerald[400] }]}>
                                        {lvl.label}
                                    </Text>
                                    <Text style={styles.levelSub}>{lvl.sub}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </Card>

                    {/* 2. Preferred Daily Time Slot */}
                    <Card style={styles.settingCard} variant="glassDark" animated delay={StaggerDelay * 5}>
                        <Text style={styles.label}>وقت الحفظ المفضل</Text>
                        <Text style={styles.hint}>سيُصمَّم جدولك حول وقت ذروة تركيزك</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.timeScrollContent}
                        >
                            {TIME_SLOTS.map((slot) => (
                                <TouchableOpacity
                                    key={slot.key}
                                    style={[
                                        styles.timeChip,
                                        timeSlot === slot.key && styles.timeChipActive,
                                    ]}
                                    onPress={() => setTimeSlot(slot.key)}
                                    activeOpacity={0.8}
                                >
                                    {timeSlot === slot.key && (
                                        <LinearGradient
                                            colors={['rgba(52,211,153,0.18)', 'rgba(52,211,153,0.06)']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={StyleSheet.absoluteFill}
                                        />
                                    )}
                                    <Text style={styles.timeEmoji}>{slot.emoji}</Text>
                                    <Text style={[
                                        styles.timeLabel,
                                        timeSlot === slot.key && { color: Colors.emerald[300], fontWeight: '700' }
                                    ]}>
                                        {slot.label}
                                    </Text>
                                    <Text style={styles.timeSub}>{slot.sub}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </Card>

                    {/* 3. Intensity Level */}
                    <Card style={styles.settingCard} variant="glassDark" animated delay={StaggerDelay * 6}>
                        <Text style={styles.label}>مستوى الكثافة</Text>
                        <Text style={styles.hint}>كم من وقتك اليومي يمكنك تخصيصه للحفظ؟</Text>
                        <View style={styles.intensityRow}>
                            {INTENSITY_LEVELS.map((lvl, i) => (
                                <TouchableOpacity
                                    key={lvl.key}
                                    style={[
                                        styles.intensityCard,
                                        intensity === lvl.key && styles.intensityCardActive,
                                        intensity === lvl.key && {
                                            borderColor: i === 2
                                                ? Colors.gold[400]
                                                : Colors.emerald[400],
                                        }
                                    ]}
                                    onPress={() => setIntensity(lvl.key)}
                                    activeOpacity={0.8}
                                >
                                    {intensity === lvl.key && (
                                        <LinearGradient
                                            colors={i === 2
                                                ? ['rgba(251,191,36,0.15)', 'rgba(251,191,36,0.04)']
                                                : ['rgba(52,211,153,0.15)', 'rgba(52,211,153,0.04)']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={StyleSheet.absoluteFill}
                                        />
                                    )}
                                    <Text style={styles.intensityEmoji}>{lvl.emoji}</Text>
                                    <Text style={[
                                        styles.intensityLabel,
                                        intensity === lvl.key && {
                                            color: i === 2 ? Colors.gold[400] : Colors.emerald[400],
                                        }
                                    ]}>
                                        {lvl.label}
                                    </Text>
                                    <Text style={styles.intensityMinutes}>{lvl.minutes}</Text>
                                    <Text style={styles.intensitySub}>{lvl.sub}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </Card>

                    {/* User Notes */}
                    <Card style={styles.settingCard} variant="glass" animated delay={StaggerDelay * 7}>
                        <Text style={styles.label}>ملاحظات إضافية (اختياري)</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            placeholder="أي شيء آخر تريد إخبار المساعد عنه..."
                            placeholderTextColor={Colors.neutral[500]}
                            value={userNotes}
                            onChangeText={setUserNotes}
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                        />
                    </Card>

                    {/* Generate Button — gold gradient for Islamic feel */}
                    <View style={styles.buttonWrapper}>
                        <GradientButton
                            title={loading
                                ? 'جاري إنشاء الخطة...'
                                : hasExistingPlan ? 'تحديث الخطة' : 'إنشاء خطتي ✦'
                            }
                            onPress={generatePlan}
                            colors={gradientColors}
                            disabled={loading}
                            style={{ width: '100%' }}
                        />
                        {/* Glow halo under button */}
                        <View style={[styles.buttonGlowHalo, { backgroundColor: accentColor }]} />
                    </View>

                    <View style={{ height: 120 }} />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.neutral[950] },
    safeArea: { flex: 1 },
    header: {
        padding: Spacing.xl,
        paddingTop: Spacing['3xl'],
        paddingBottom: Spacing.lg,
    },
    title: {
        fontSize: Typography.fontSize['3xl'],
        fontWeight: Typography.fontWeight.bold,
        color: Colors.text.inverse,
        marginBottom: Spacing.xs,
        fontFamily: Typography.fontFamily.arabicBold,
    },
    subtitle: {
        fontSize: Typography.fontSize.base,
        color: Colors.text.tertiary,
        fontFamily: Typography.fontFamily.arabic,
    },
    content: { flex: 1, paddingHorizontal: Spacing.lg },
    scrollContent: { paddingTop: Spacing.sm, paddingBottom: 40 },
    settingCard: { marginBottom: Spacing.lg },

    label: {
        fontSize: Typography.fontSize.lg,
        fontWeight: Typography.fontWeight.semibold,
        color: Colors.text.inverse,
        marginBottom: Spacing.xs,
        textAlign: 'right',
        fontFamily: Typography.fontFamily.arabicBold,
    },
    hint: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        marginBottom: Spacing.md,
        textAlign: 'right',
        fontFamily: Typography.fontFamily.arabic,
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: BorderRadius.base,
        padding: Spacing.base,
        fontSize: Typography.fontSize.base,
        color: Colors.text.inverse,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        textAlign: 'right',
        marginTop: Spacing.xs,
    },
    textArea: { minHeight: 80, paddingTop: Spacing.md },

    // ── Date button ──
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.base,
        paddingHorizontal: Spacing.base,
        borderRadius: BorderRadius.lg,
        borderWidth: 1.5,
        borderColor: 'rgba(52,211,153,0.3)',
        overflow: 'hidden',
        marginTop: Spacing.xs,
    },
    dateButtonText: {
        flex: 1,
        fontSize: Typography.fontSize.base,
        fontWeight: '600',
        color: Colors.text.inverse,
    },
    dateBadge: {
        backgroundColor: 'rgba(52,211,153,0.15)',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 3,
        borderRadius: BorderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(52,211,153,0.3)',
    },
    dateBadgeText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.emerald[400],
        fontWeight: '700',
    },

    // ── Qira'at ──
    optionsRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
    option: {
        flex: 1,
        paddingVertical: Spacing.base,
        borderRadius: BorderRadius.lg,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        alignItems: 'center',
    },
    optionText: {
        fontSize: Typography.fontSize.xl,
        fontWeight: '600',
        color: Colors.text.tertiary,
        fontFamily: Typography.fontFamily.arabicBold,
    },
    optionSubtext: {
        fontSize: Typography.fontSize.xs,
        color: Colors.neutral[600],
        marginTop: 2,
        letterSpacing: 1,
    },

    // ── Memorization Level Grid ──
    levelGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
        marginTop: Spacing.sm,
    },
    levelCard: {
        width: '47%',
        padding: Spacing.md,
        borderRadius: BorderRadius.lg,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        alignItems: 'center',
        overflow: 'hidden',
    },
    levelCardActive: {
        borderColor: Colors.emerald[400],
        shadowColor: Colors.emerald[400],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
    },
    levelEmoji: { fontSize: 26, marginBottom: Spacing.xs },
    levelLabel: {
        fontSize: Typography.fontSize.base,
        fontWeight: '700',
        color: Colors.text.secondary,
        fontFamily: Typography.fontFamily.arabicBold,
    },
    levelSub: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
        marginTop: 2,
        fontFamily: Typography.fontFamily.arabic,
    },

    // ── Time Slot Chips ──
    timeScrollContent: { gap: Spacing.sm, paddingVertical: Spacing.sm },
    timeChip: {
        paddingHorizontal: Spacing.base,
        paddingVertical: Spacing.sm,
        borderRadius: BorderRadius.xl,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        alignItems: 'center',
        minWidth: 80,
        overflow: 'hidden',
    },
    timeChipActive: {
        borderColor: Colors.emerald[400],
        shadowColor: Colors.emerald[400],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 6,
    },
    timeEmoji: { fontSize: 22, marginBottom: 2 },
    timeLabel: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.secondary,
        fontFamily: Typography.fontFamily.arabic,
    },
    timeSub: {
        fontSize: 10,
        color: Colors.text.tertiary,
        marginTop: 1,
    },

    // ── Intensity ──
    intensityRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
    intensityCard: {
        flex: 1,
        padding: Spacing.sm,
        borderRadius: BorderRadius.lg,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        alignItems: 'center',
        overflow: 'hidden',
    },
    intensityCardActive: {
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
    },
    intensityEmoji: { fontSize: 24, marginBottom: Spacing.xs },
    intensityLabel: {
        fontSize: Typography.fontSize.sm,
        fontWeight: '700',
        color: Colors.text.secondary,
        fontFamily: Typography.fontFamily.arabicBold,
    },
    intensityMinutes: {
        fontSize: 10,
        color: Colors.emerald[400],
        fontWeight: '600',
        marginTop: 2,
    },
    intensitySub: {
        fontSize: 10,
        color: Colors.text.tertiary,
        marginTop: 2,
        textAlign: 'center',
        fontFamily: Typography.fontFamily.arabic,
    },

    // ── Button ──
    buttonWrapper: {
        marginTop: Spacing.md,
        alignItems: 'center',
        position: 'relative',
    },
    buttonGlowHalo: {
        position: 'absolute',
        bottom: -8,
        width: '60%',
        height: 20,
        borderRadius: 10,
        opacity: 0.25,
        transform: [{ scaleX: 1.2 }],
        // blur workaround via opacity + borderRadius
    },

    // ══════════════════════════════════════════
    // SUCCESS CARD — Spatial Islamic UI
    // ══════════════════════════════════════════
    successCardWrapper: {
        borderRadius: BorderRadius['2xl'],
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: 'rgba(52,211,153,0.3)',
        marginBottom: Spacing.xl,
        shadowColor: Colors.emerald[400],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 24,
        elevation: 20,
    },
    // Radial glow orb above the card (absolute, bleeds outside due to overflow:visible on parent)
    successGlowOrb: {
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: Colors.emerald[400],
        opacity: 0.06,
        top: -60,
        right: -40,
    },
    successBorderGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 2,
    },
    successCardInner: {
        padding: Spacing.xl,
        alignItems: 'center',
    },
    successIcon: {
        width: 64,
        height: 64,
        borderRadius: BorderRadius.full,
        backgroundColor: 'rgba(52,211,153,0.12)',
        borderWidth: 1.5,
        borderColor: 'rgba(52,211,153,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.md,
        shadowColor: Colors.emerald[400],
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 8,
    },
    successTitle: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: '800',
        color: Colors.text.inverse,
        marginBottom: Spacing.xs,
        fontFamily: Typography.fontFamily.arabicBold,
    },
    successSubtitle: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.tertiary,
        marginBottom: Spacing.xl,
        fontFamily: Typography.fontFamily.arabic,
    },
    successStats: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: BorderRadius.xl,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
        width: '100%',
    },
    successStat: { flex: 1, alignItems: 'center', gap: 4 },
    successStatValue: { fontSize: Typography.fontSize['2xl'], fontWeight: '800' },
    successStatLabel: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
        fontFamily: Typography.fontFamily.arabic,
    },
    successStatDivider: {
        width: 1,
        height: 44,
        backgroundColor: 'rgba(255,255,255,0.07)',
    },
    wardSetupBtn: {
        marginTop: Spacing.md,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.xl,
        borderRadius: BorderRadius.full,
        backgroundColor: 'rgba(52,211,153,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(52,211,153,0.3)',
    },
    wardSetupBtnText: {
        color: Colors.emerald[300],
        fontSize: Typography.fontSize.sm,
        fontWeight: '700',
        textAlign: 'center',
    },
    warningBanner: {
        backgroundColor: 'rgba(245,158,11,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(245,158,11,0.35)',
        borderRadius: BorderRadius.lg,
        paddingVertical: Spacing.sm,
        paddingHorizontal: Spacing.md,
        marginBottom: Spacing.lg,
    },
    warningText: {
        color: Colors.gold[300],
        fontSize: Typography.fontSize.sm,
        fontWeight: '600',
        textAlign: 'right',
        fontFamily: Typography.fontFamily.arabic,
    },

    // ── Legacy user upgrade banner ──────────────────────────────────────────
    legacyBanner: {
        backgroundColor: 'rgba(16,185,129,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(16,185,129,0.3)',
        borderRadius: BorderRadius.xl,
        padding: Spacing.lg,
        marginBottom: Spacing.lg,
    },
    legacyBannerTitle: {
        fontSize: Typography.fontSize.lg,
        fontWeight: '700',
        color: Colors.emerald[300],
        textAlign: 'right',
        fontFamily: Typography.fontFamily.arabicBold,
        marginBottom: 4,
    },
    legacyBannerText: {
        fontSize: Typography.fontSize.sm,
        color: Colors.neutral[300],
        textAlign: 'right',
        fontFamily: Typography.fontFamily.arabic,
        lineHeight: 22,
        marginBottom: 4,
    },
    legacyBannerSub: {
        fontSize: Typography.fontSize.xs,
        color: Colors.neutral[500],
        textAlign: 'right',
        fontFamily: Typography.fontFamily.arabic,
    },
});
