/**
 * app/plan-setup.tsx
 * ──────────────────────────────────────────────────────────────────────────────
 * 3-step wizard for configuring the memorization plan (ward system).
 * Step 1 → Direction (forward / backward / both)
 * Step 2 → Starting surah
 * Step 3 → Daily pages target
 * ──────────────────────────────────────────────────────────────────────────────
 */

import * as React from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
    ScrollView, Animated, Platform, StatusBar,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { ChevronRight, ChevronLeft, Check, BookOpen, ArrowRight, ArrowLeft, ArrowLeftRight } from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { SURAHS } from '../constants/surahs';
import { useAuth } from '../lib/auth';
import { savePlan, WardDirection } from '../lib/ward';

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3;

interface PlanConfig {
    direction: WardDirection;
    dailyPages: number;
    startSurahForward: number;
    startSurahBackward: number;
}

// ─── Direction Cards ──────────────────────────────────────────────────────────
const DIRECTIONS: Array<{
    key: WardDirection;
    title: string;
    subtitle: string;
    description: string;
    icon: React.ReactNode;
    gradient: readonly [string, string, string];
}> = [
    {
        key: 'forward',
        title: 'من الأول',
        subtitle: 'الفاتحة ← الناس',
        description: 'ابدأ من سورة الفاتحة وتقدم نحو سورة الناس. الطريقة الأكثر شيوعاً.',
        icon: <ArrowRight color={Colors.emerald[400]} size={28} />,
        gradient: ['#022c22', '#065f46', '#0f766e'],
    },
    {
        key: 'backward',
        title: 'من الآخر',
        subtitle: 'الناس ← الفاتحة',
        description: 'ابدأ من سورة الناس وتقدم نحو سورة الفاتحة. مناسب لمن يريد الجزء الثلاثين أولاً.',
        icon: <ArrowLeft color={Colors.gold[400]} size={28} />,
        gradient: ['#1c0e00', '#78350f', '#b45309'],
    },
    {
        key: 'both',
        title: 'من الطرفين',
        subtitle: 'يلتقيان في المنتصف',
        description: 'ورد مزدوج: من الفاتحة ومن الناس في آنٍ واحد حتى يلتقيا في سورة البقرة.',
        icon: <ArrowLeftRight color="#a78bfa" size={28} />,
        gradient: ['#0f0031', '#4c1d95', '#6d28d9'],
    },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PlanSetupScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const params = useLocalSearchParams<{ prefillDailyPages?: string }>();

    // If coming from plan.tsx with a pre-calculated value, use it as initial pages
    const prefillPages = params.prefillDailyPages ? parseInt(params.prefillDailyPages) : null;

    const [step, setStep] = React.useState<Step>(1);
    const [config, setConfig] = React.useState<PlanConfig>({
        direction: 'forward',
        dailyPages: prefillPages && prefillPages >= 1 && prefillPages <= 20 ? prefillPages : 2,
        startSurahForward: 1,
        startSurahBackward: 114,
    });
    const [saving, setSaving] = React.useState(false);

    // Animated progress bar width
    const progressAnim = React.useRef(new Animated.Value(33)).current;
    React.useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: step === 1 ? 33 : step === 2 ? 66 : 100,
            duration: 350,
            useNativeDriver: false,
        }).start();
    }, [step]);

    // Slide animation between steps
    const slideAnim = React.useRef(new Animated.Value(0)).current;
    function animateStep(direction: 'next' | 'back', cb: () => void) {
        const toX = direction === 'next' ? -30 : 30;
        Animated.timing(slideAnim, { toValue: toX, duration: 120, useNativeDriver: true }).start(() => {
            cb();
            slideAnim.setValue(direction === 'next' ? 30 : -30);
            Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start();
        });
    }

    function goNext() {
        if (step < 3) animateStep('next', () => setStep((s) => (s + 1) as Step));
    }
    function goBack() {
        if (step > 1) animateStep('back', () => setStep((s) => (s - 1) as Step));
        else router.back();
    }

    async function handleFinish() {
        if (!user) return;
        setSaving(true);
        try {
            const bwdSurah = getSurahByNumber(config.startSurahBackward);
            const { success, error } = await savePlan(
                user.id,
                config.direction,
                config.dailyPages,
                config.startSurahForward,
                1,
                config.startSurahBackward,
                1
            );
            if (!success) {
                console.error('Plan save error:', error);
                return;
            }
            // Navigate back to home
            router.replace('/(tabs)');
        } catch (e) {
            console.error('handleFinish error:', e);
        } finally {
            setSaving(false);
        }
    }

    const canProceed = step === 1 || step === 2 || step === 3;

    return (
        <LinearGradient colors={['#020617', '#0f172a', '#020617']} style={styles.root}>
            <StatusBar barStyle="light-content" />
            <SafeAreaView style={styles.safe}>

                {/* ── Header ── */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={goBack} style={styles.backBtn}>
                        <ChevronRight color={Colors.neutral[400]} size={24} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>إعداد خطة الحفظ</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* ── Step indicators ── */}
                <View style={styles.stepsRow}>
                    {[1, 2, 3].map((n) => (
                        <View key={n} style={styles.stepItem}>
                            <View style={[styles.stepDot, n <= step && styles.stepDotActive]}>
                                {n < step ? (
                                    <Check color="#fff" size={12} />
                                ) : (
                                    <Text style={[styles.stepNum, n === step && styles.stepNumActive]}>{n}</Text>
                                )}
                            </View>
                            {n < 3 && (
                                <View style={[styles.stepLine, n < step && styles.stepLineActive]} />
                            )}
                        </View>
                    ))}
                </View>

                {/* ── Progress bar ── */}
                <View style={styles.progressBg}>
                    <Animated.View
                        style={[styles.progressFill, {
                            width: progressAnim.interpolate({
                                inputRange: [0, 100],
                                outputRange: ['0%', '100%'],
                            }),
                        }]}
                    />
                </View>

                {/* ── Content ── */}
                <Animated.View
                    style={[styles.content, { transform: [{ translateX: slideAnim }] }]}
                >
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollContent}
                    >
                        {step === 1 && (
                            <Step1
                                selected={config.direction}
                                onSelect={(d) => setConfig((c) => ({ ...c, direction: d }))}
                            />
                        )}
                        {step === 2 && (
                            <Step2
                                direction={config.direction}
                                startForward={config.startSurahForward}
                                startBackward={config.startSurahBackward}
                                onChangeForward={(n) => setConfig((c) => ({ ...c, startSurahForward: n }))}
                                onChangeBackward={(n) => setConfig((c) => ({ ...c, startSurahBackward: n }))}
                            />
                        )}
                        {step === 3 && (
                            <Step3
                                dailyPages={config.dailyPages}
                                onChange={(p) => setConfig((c) => ({ ...c, dailyPages: p }))}
                                config={config}
                                prefilled={prefillPages !== null}
                            />
                        )}
                    </ScrollView>
                </Animated.View>

                {/* ── Footer CTA ── */}
                <View style={styles.footer}>
                    {step < 3 ? (
                        <TouchableOpacity style={styles.nextBtn} onPress={goNext}>
                            <LinearGradient
                                colors={['#059669', '#10b981', '#34d399']}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                style={styles.nextGradient}
                            >
                                <Text style={styles.nextText}>التالي</Text>
                                <ChevronLeft color="#fff" size={20} />
                            </LinearGradient>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[styles.nextBtn, saving && { opacity: 0.6 }]}
                            onPress={handleFinish}
                            disabled={saving}
                        >
                            <LinearGradient
                                colors={['#d97706', '#f59e0b', '#fbbf24']}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                style={styles.nextGradient}
                            >
                                <Text style={styles.nextText}>
                                    {saving ? 'جارٍ الحفظ...' : 'ابدأ رحلة الحفظ 🚀'}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                </View>
            </SafeAreaView>
        </LinearGradient>
    );
}

function getSurahByNumber(n: number) {
    return SURAHS.find(s => s.number === n);
}

// ─── Step 1: Direction ────────────────────────────────────────────────────────
function Step1({ selected, onSelect }: { selected: WardDirection; onSelect: (d: WardDirection) => void }) {
    return (
        <View>
            <Text style={styles.stepTitle}>اختر طريقة الحفظ</Text>
            <Text style={styles.stepSubtitle}>
                من أين تريد أن تبدأ رحلتك مع القرآن الكريم؟
            </Text>
            <View style={styles.directionCards}>
                {DIRECTIONS.map((d) => {
                    const isSelected = selected === d.key;
                    return (
                        <TouchableOpacity
                            key={d.key}
                            onPress={() => onSelect(d.key)}
                            activeOpacity={0.85}
                            style={[styles.dirCard, isSelected && styles.dirCardSelected]}
                        >
                            <LinearGradient
                                colors={d.gradient as any}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                style={StyleSheet.absoluteFill}
                            />
                            {isSelected && (
                                <View style={styles.dirCheckBadge}>
                                    <Check color="#fff" size={14} />
                                </View>
                            )}
                            <View style={styles.dirIconBox}>{d.icon}</View>
                            <View style={styles.dirTextBox}>
                                <Text style={styles.dirTitle}>{d.title}</Text>
                                <Text style={styles.dirSub}>{d.subtitle}</Text>
                                <Text style={styles.dirDesc}>{d.description}</Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

// ─── Step 2: Starting Surah ───────────────────────────────────────────────────
function Step2({
    direction, startForward, startBackward, onChangeForward, onChangeBackward,
}: {
    direction: WardDirection;
    startForward: number; startBackward: number;
    onChangeForward: (n: number) => void; onChangeBackward: (n: number) => void;
}) {
    const showForward  = direction === 'forward'  || direction === 'both';
    const showBackward = direction === 'backward' || direction === 'both';

    // Surah list slices for forward (1-114) and backward (114-1)
    const forwardSurahs  = SURAHS;
    const backwardSurahs = [...SURAHS].reverse();

    return (
        <View>
            <Text style={styles.stepTitle}>نقطة البداية</Text>
            <Text style={styles.stepSubtitle}>
                من أي سورة تريد أن تبدأ الحفظ؟
            </Text>

            {showForward && (
                <SurahPicker
                    label="البداية (الأمام) 📖"
                    surahs={forwardSurahs}
                    selected={startForward}
                    onSelect={onChangeForward}
                    accentColor={Colors.emerald[400]}
                />
            )}
            {showBackward && (
                <SurahPicker
                    label="البداية (الخلف) 📖"
                    surahs={backwardSurahs}
                    selected={startBackward}
                    onSelect={onChangeBackward}
                    accentColor={Colors.gold[400]}
                />
            )}
        </View>
    );
}

function SurahPicker({
    label, surahs, selected, onSelect, accentColor,
}: {
    label: string;
    surahs: typeof SURAHS;
    selected: number;
    onSelect: (n: number) => void;
    accentColor: string;
}) {
    return (
        <View style={styles.pickerContainer}>
            <Text style={[styles.pickerLabel, { color: accentColor }]}>{label}</Text>
            <View style={styles.surahGrid}>
                {surahs.map((s) => {
                    const isSelected = s.number === selected;
                    return (
                        <TouchableOpacity
                            key={s.number}
                            onPress={() => onSelect(s.number)}
                            style={[
                                styles.surahChip,
                                isSelected && { backgroundColor: accentColor + '25', borderColor: accentColor },
                            ]}
                        >
                            <Text style={[styles.surahChipNum, isSelected && { color: accentColor }]}>
                                {s.number}
                            </Text>
                            <Text
                                style={[styles.surahChipName, isSelected && { color: accentColor }]}
                                numberOfLines={1}
                            >
                                {s.name}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

// ─── Step 3: Daily Target ─────────────────────────────────────────────────────
function Step3({
    dailyPages, onChange, config, prefilled,
}: {
    dailyPages: number;
    onChange: (p: number) => void;
    config: PlanConfig;
    prefilled?: boolean;
}) {
    const TOTAL_QURAN_PAGES = 604;
    const totalPagesForPlan = config.direction === 'both' ? TOTAL_QURAN_PAGES / 2 : TOTAL_QURAN_PAGES;
    const daysToComplete = Math.ceil(totalPagesForPlan / dailyPages);
    const months = Math.floor(daysToComplete / 30);
    const days   = daysToComplete % 30;

    const PAGE_OPTIONS = [1, 2, 3, 4, 5, 7, 10, 15, 20];
    const EST_MINUTES  = dailyPages * 10;

    const dirLabel =
        config.direction === 'forward'  ? 'الفاتحة → الناس' :
        config.direction === 'backward' ? 'الناس → الفاتحة' : 'من الطرفين';

    const fwdSurah = SURAHS.find(s => s.number === config.startSurahForward);
    const bwdSurah = SURAHS.find(s => s.number === config.startSurahBackward);

    return (
        <View>
            <Text style={styles.stepTitle}>الهدف اليومي</Text>
            <Text style={styles.stepSubtitle}>
                كم صفحة تريد أن تحفظ كل يوم؟
            </Text>

            {/* Pre-filled badge */}
            {prefilled && (
                <View style={styles.prefilledBadge}>
                    <Text style={styles.prefilledBadgeText}>
                        ✨ محسوب تلقائياً من تاريخ ختمك — يمكنك تعديله
                    </Text>
                </View>
            )}

            {/* Page options */}
            <View style={styles.pageGrid}>
                {PAGE_OPTIONS.map((p) => {
                    const isSelected = dailyPages === p;
                    return (
                        <TouchableOpacity
                            key={p}
                            onPress={() => onChange(p)}
                            style={[styles.pageChip, isSelected && styles.pageChipSelected]}
                        >
                            <Text style={[styles.pageChipNum, isSelected && styles.pageChipNumSelected]}>
                                {p}
                            </Text>
                            <Text style={[styles.pageChipLabel, isSelected && styles.pageChipLabelSelected]}>
                                {p === 1 ? 'صفحة' : 'صفحات'}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Estimate card */}
            <View style={styles.estimateCard}>
                <LinearGradient
                    colors={['rgba(52,211,153,0.08)', 'rgba(16,185,129,0.04)']}
                    style={StyleSheet.absoluteFill}
                />
                <Text style={styles.estimateTitle}>ملخص خطتك</Text>

                <View style={styles.estimateRow}>
                    <Text style={styles.estimateKey}>الاتجاه</Text>
                    <Text style={styles.estimateVal}>{dirLabel}</Text>
                </View>
                {(config.direction === 'forward' || config.direction === 'both') && fwdSurah && (
                    <View style={styles.estimateRow}>
                        <Text style={styles.estimateKey}>تبدأ (أمام) من</Text>
                        <Text style={[styles.estimateVal, { color: Colors.emerald[400] }]}>{fwdSurah.name}</Text>
                    </View>
                )}
                {(config.direction === 'backward' || config.direction === 'both') && bwdSurah && (
                    <View style={styles.estimateRow}>
                        <Text style={styles.estimateKey}>تبدأ (خلف) من</Text>
                        <Text style={[styles.estimateVal, { color: Colors.gold[400] }]}>{bwdSurah.name}</Text>
                    </View>
                )}
                <View style={styles.estimateRow}>
                    <Text style={styles.estimateKey}>الهدف اليومي</Text>
                    <Text style={styles.estimateVal}>{dailyPages} {dailyPages === 1 ? 'صفحة' : 'صفحات'} (~{EST_MINUTES} دق)</Text>
                </View>
                <View style={styles.estimateRow}>
                    <Text style={styles.estimateKey}>وقت الإكمال</Text>
                    <Text style={[styles.estimateVal, { color: Colors.gold[300] }]}>
                        {months > 0 ? `${months} شهر ` : ''}{days > 0 ? `${days} يوم` : ''}
                    </Text>
                </View>
            </View>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root: { flex: 1 },
    safe: { flex: 1 },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.xl,
        paddingTop: Platform.OS === 'android' ? Spacing.xl : Spacing.md,
        paddingBottom: Spacing.md,
    },
    backBtn: {
        width: 40, height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: {
        fontSize: Typography.fontSize.lg,
        fontWeight: '700',
        color: '#fff',
    },

    // Step indicators
    stepsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing['3xl'],
        marginBottom: Spacing.md,
    },
    stepItem: { flexDirection: 'row', alignItems: 'center' },
    stepDot: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center', justifyContent: 'center',
    },
    stepDotActive: {
        backgroundColor: Colors.emerald[600],
        borderColor: Colors.emerald[400],
    },
    stepNum: { fontSize: 12, color: Colors.neutral[500], fontWeight: '700' },
    stepNumActive: { color: '#fff' },
    stepLine: { width: 40, height: 2, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 6 },
    stepLineActive: { backgroundColor: Colors.emerald[500] },

    // Progress
    progressBg: {
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginHorizontal: Spacing.xl,
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: Spacing.xl,
    },
    progressFill: {
        height: '100%',
        backgroundColor: Colors.emerald[400],
        borderRadius: 2,
    },

    // Content
    content: { flex: 1 },
    scrollContent: { padding: Spacing.xl, paddingBottom: 40 },

    // Step text
    stepTitle: {
        fontSize: Typography.fontSize['3xl'],
        fontWeight: '800',
        color: '#fff',
        marginBottom: Spacing.sm,
        textAlign: 'right',
    },
    stepSubtitle: {
        fontSize: Typography.fontSize.base,
        color: Colors.neutral[400],
        marginBottom: Spacing.xl,
        textAlign: 'right',
        lineHeight: 22,
    },

    // Direction cards
    directionCards: { gap: Spacing.md },
    dirCard: {
        borderRadius: BorderRadius.xl,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.08)',
        padding: Spacing.xl,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.md,
        position: 'relative',
    },
    dirCardSelected: {
        borderColor: Colors.emerald[500],
        ...Shadows.glowEmerald,
    },
    dirCheckBadge: {
        position: 'absolute', top: 12, left: 12,
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: Colors.emerald[500],
        alignItems: 'center', justifyContent: 'center',
    },
    dirIconBox: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center', justifyContent: 'center',
    },
    dirTextBox: { flex: 1, alignItems: 'flex-end' },
    dirTitle: { fontSize: Typography.fontSize.xl, fontWeight: '800', color: '#fff', textAlign: 'right' },
    dirSub: { fontSize: Typography.fontSize.sm, color: Colors.emerald[400], marginBottom: 4, textAlign: 'right' },
    dirDesc: { fontSize: Typography.fontSize.xs, color: Colors.neutral[400], textAlign: 'right', lineHeight: 18 },

    // Surah picker
    pickerContainer: { marginBottom: Spacing.xl },
    pickerLabel: { fontSize: Typography.fontSize.base, fontWeight: '700', marginBottom: Spacing.md, textAlign: 'right' },
    surahGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    surahChip: {
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: BorderRadius.md,
        padding: 8, paddingHorizontal: 10,
        backgroundColor: 'rgba(255,255,255,0.04)',
        alignItems: 'center', minWidth: 70,
    },
    surahChipNum: { fontSize: 10, color: Colors.neutral[500], fontWeight: '700' },
    surahChipName: { fontSize: 11, color: Colors.neutral[300], marginTop: 2, textAlign: 'center' },

    // Page picker
    pageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.xl },
    pageChip: {
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: BorderRadius.xl,
        padding: Spacing.md, paddingHorizontal: Spacing.lg,
        backgroundColor: 'rgba(255,255,255,0.04)',
        alignItems: 'center', minWidth: 76,
    },
    pageChipSelected: {
        backgroundColor: 'rgba(52,211,153,0.12)',
        borderColor: Colors.emerald[400],
    },
    pageChipNum: { fontSize: Typography.fontSize['2xl'], fontWeight: '800', color: Colors.neutral[300] },
    pageChipNumSelected: { color: Colors.emerald[300] },
    pageChipLabel: { fontSize: 11, color: Colors.neutral[500], marginTop: 2 },
    pageChipLabelSelected: { color: Colors.emerald[400] },

    // Estimate
    estimateCard: {
        borderRadius: BorderRadius.xl, overflow: 'hidden',
        borderWidth: 1, borderColor: 'rgba(52,211,153,0.15)',
        padding: Spacing.xl,
    },
    estimateTitle: {
        fontSize: Typography.fontSize.lg, fontWeight: '700', color: Colors.emerald[300],
        marginBottom: Spacing.md, textAlign: 'right',
    },
    estimateRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', paddingVertical: 6,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    estimateKey: { fontSize: Typography.fontSize.sm, color: Colors.neutral[500] },
    estimateVal: { fontSize: Typography.fontSize.sm, fontWeight: '700', color: '#fff' },

    // Footer
    footer: { padding: Spacing.xl, paddingBottom: Platform.OS === 'ios' ? Spacing.sm : Spacing.xl },
    nextBtn: { borderRadius: BorderRadius.xl, overflow: 'hidden' },
    nextGradient: {
        paddingVertical: Spacing.lg,
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'row', gap: Spacing.sm,
    },
    nextText: { fontSize: Typography.fontSize.lg, fontWeight: '800', color: '#fff' },
    prefilledBadge: {
        backgroundColor: 'rgba(251,191,36,0.08)',
        borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)',
        borderRadius: BorderRadius.lg,
        padding: Spacing.sm,
        marginBottom: Spacing.md,
        alignItems: 'center',
    },
    prefilledBadgeText: {
        color: Colors.gold[300],
        fontSize: Typography.fontSize.sm,
        textAlign: 'center',
    },
});
