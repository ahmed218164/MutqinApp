/**
 * WeeklyReportCard
 * Displays the AI-generated weekly report with stats and report text.
 * Shown in profile.tsx.
 */
import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Sparkles,
    TrendingUp,
    AlertCircle,
    BookOpen,
    RefreshCw,
    ChevronDown,
    ChevronUp,
} from 'lucide-react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { WeeklyReport } from '../../lib/weekly-report';

interface WeeklyReportCardProps {
    report: WeeklyReport | null;
    loading: boolean;
    onGenerate: () => void;
    isGenerating: boolean;
}

interface StatPillProps {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    color: string;
}

function StatPill({ icon, label, value, color }: StatPillProps) {
    return (
        <View style={[pillStyles.container, { borderColor: color + '30', backgroundColor: color + '12' }]}>
            {icon}
            <View style={pillStyles.texts}>
                <Text style={[pillStyles.value, { color }]}>{value}</Text>
                <Text style={pillStyles.label}>{label}</Text>
            </View>
        </View>
    );
}

const pillStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 8,
        borderRadius: BorderRadius.lg,
        borderWidth: 1,
        flex: 1,
    },
    texts: { flex: 1 },
    value: {
        fontSize: Typography.fontSize.lg,
        fontWeight: '700' as const,
        lineHeight: 22,
    },
    label: {
        fontSize: 10,
        color: Colors.text.tertiary,
        fontWeight: '500' as const,
    },
});

export default function WeeklyReportCard({
    report,
    loading,
    onGenerate,
    isGenerating,
}: WeeklyReportCardProps) {
    const [expanded, setExpanded] = React.useState(true);

    // ── Empty state ───────────────────────────────────────────────────────────
    if (!loading && !report) {
        return (
            <View style={styles.emptyWrapper}>
                {/* Gradient header */}
                <LinearGradient
                    colors={['#1e1445', '#2d1b69', '#1e1445']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.emptyGradient}
                >
                    <Sparkles color={Colors.gold[400]} size={28} />
                    <Text style={styles.emptyTitle}>تقرير الأسبوع</Text>
                    <Text style={styles.emptySubtitle}>
                        دعنا نولّد تقريراً شخصياً يلخّص أداءك هذا الأسبوع ويقدّم لك توصيات ذكية.
                    </Text>
                    <TouchableOpacity
                        style={styles.generateBtn}
                        onPress={onGenerate}
                        activeOpacity={0.85}
                        disabled={isGenerating}
                    >
                        {isGenerating ? (
                            <ActivityIndicator color={Colors.neutral[950]} size="small" />
                        ) : (
                            <>
                                <Sparkles size={16} color={Colors.neutral[950]} />
                                <Text style={styles.generateBtnText}>توليد التقرير</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </LinearGradient>
            </View>
        );
    }

    // ── Loading skeleton ──────────────────────────────────────────────────────
    if (loading) {
        return (
            <View style={styles.skeletonWrapper}>
                <View style={styles.skeletonHeader} />
                <View style={[styles.skeletonLine, { width: '90%' }]} />
                <View style={[styles.skeletonLine, { width: '75%' }]} />
                <View style={[styles.skeletonLine, { width: '85%' }]} />
            </View>
        );
    }

    // ── Loaded state ──────────────────────────────────────────────────────────
    const s = report!.stats;
    const dateLabel = (() => {
        const start = new Date(report!.week_start);
        const end = new Date(report!.week_end);
        const fmt = (d: Date) =>
            d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
        return `${fmt(start)} – ${fmt(end)}`;
    })();

    return (
        <View style={styles.card}>
            {/* Subtle gradient background */}
            <LinearGradient
                colors={['#0d1b2a', '#112240', '#0d1b2a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            {/* Glowing accent orb */}
            <View style={styles.accentOrb} />

            {/* ── Header ── */}
            <TouchableOpacity
                style={styles.header}
                onPress={() => setExpanded((e) => !e)}
                activeOpacity={0.8}
            >
                <View style={styles.headerLeft}>
                    <View style={styles.sparkleChip}>
                        <Sparkles size={13} color={Colors.gold[400]} />
                        <Text style={styles.sparkleLabel}>تقرير الذكاء الاصطناعي</Text>
                    </View>
                    <Text style={styles.weekLabel}>{dateLabel}</Text>
                </View>
                {expanded
                    ? <ChevronUp size={18} color={Colors.text.tertiary} />
                    : <ChevronDown size={18} color={Colors.text.tertiary} />}
            </TouchableOpacity>

            {expanded && (
                <>
                    {/* ── Stat pills ── */}
                    <View style={styles.statsRow}>
                        <StatPill
                            icon={<BookOpen size={14} color={Colors.emerald[400]} />}
                            label="الصفحات"
                            value={s.totalPages}
                            color={Colors.emerald[400]}
                        />
                        <StatPill
                            icon={<TrendingUp size={14} color={Colors.gold[400]} />}
                            label="متوسط النتيجة"
                            value={`${s.avgScore}%`}
                            color={Colors.gold[400]}
                        />
                        <StatPill
                            icon={<AlertCircle size={14} color={Colors.error} />}
                            label="أخطاء"
                            value={s.mistakesCount}
                            color={Colors.error}
                        />
                    </View>

                    {/* ── Divider ── */}
                    <View style={styles.divider} />

                    {/* ── AI Report Text ── */}
                    <Text style={styles.reportText}>{report!.report_text}</Text>

                    {/* ── Regenerate button ── */}
                    <TouchableOpacity
                        style={styles.regenRow}
                        onPress={onGenerate}
                        disabled={isGenerating}
                        activeOpacity={0.7}
                    >
                        {isGenerating
                            ? <ActivityIndicator size="small" color={Colors.text.tertiary} />
                            : <RefreshCw size={13} color={Colors.text.tertiary} />}
                        <Text style={styles.regenText}>
                            {isGenerating ? 'جاري التوليد…' : 'إعادة التوليد'}
                        </Text>
                    </TouchableOpacity>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    // ── Empty state ─────────────────────────────────────────────────────────
    emptyWrapper: {
        borderRadius: BorderRadius['2xl'],
        overflow: 'hidden',
        marginBottom: Spacing.lg,
        borderWidth: 1,
        borderColor: 'rgba(234,179,8,0.2)',
    },
    emptyGradient: {
        padding: Spacing.xl,
        alignItems: 'center',
        gap: Spacing.md,
    },
    emptyTitle: {
        fontSize: Typography.fontSize['2xl'],
        fontWeight: '800' as const,
        color: Colors.text.inverse,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.secondary,
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: Spacing.md,
    },
    generateBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        backgroundColor: Colors.gold[400],
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        borderRadius: BorderRadius.full,
        marginTop: Spacing.sm,
    },
    generateBtnText: {
        fontSize: Typography.fontSize.base,
        fontWeight: '700' as const,
        color: Colors.neutral[950],
    },
    // ── Skeleton ─────────────────────────────────────────────────────────────
    skeletonWrapper: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: BorderRadius['2xl'],
        padding: Spacing.xl,
        marginBottom: Spacing.lg,
        gap: Spacing.sm,
    },
    skeletonHeader: {
        height: 20,
        width: '50%',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: BorderRadius.base,
        marginBottom: Spacing.sm,
    },
    skeletonLine: {
        height: 14,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: BorderRadius.base,
    },
    // ── Loaded card ───────────────────────────────────────────────────────────
    card: {
        borderRadius: BorderRadius['2xl'],
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(99,179,237,0.15)',
        marginBottom: Spacing.lg,
        padding: Spacing.lg,
        position: 'relative',
    },
    accentOrb: {
        position: 'absolute',
        top: -30,
        right: -30,
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: Colors.gold[500],
        opacity: 0.05,
    },
    // ── Header ───────────────────────────────────────────────────────────────
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: Spacing.md,
    },
    headerLeft: { gap: 4 },
    sparkleChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: Colors.gold[500] + '20',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 3,
        borderRadius: BorderRadius.full,
        alignSelf: 'flex-start',
    },
    sparkleLabel: {
        fontSize: 10,
        fontWeight: '700' as const,
        color: Colors.gold[400],
        letterSpacing: 0.5,
    },
    weekLabel: {
        fontSize: Typography.fontSize.sm,
        fontWeight: '600' as const,
        color: Colors.text.inverse,
        marginTop: 2,
    },
    // ── Stats ────────────────────────────────────────────────────────────────
    statsRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.07)',
        marginVertical: Spacing.md,
    },
    // ── Report text ───────────────────────────────────────────────────────────
    reportText: {
        fontSize: Typography.fontSize.sm,
        color: Colors.text.secondary,
        lineHeight: 24,
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    // ── Regenerate ────────────────────────────────────────────────────────────
    regenRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
        marginTop: Spacing.md,
        alignSelf: 'flex-start',
    },
    regenText: {
        fontSize: Typography.fontSize.xs,
        color: Colors.text.tertiary,
    },
});
